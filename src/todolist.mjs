import { sourceName } from './message-source.mjs';
import { appendShadow } from './context/shadow.mjs';
import { TODO_META, TASK_CONTEXT_META, taskContextMeta, latestTaskContext, withoutRuntime, tasksFromLegacy } from './task-context.mjs';
import { promptText } from './cc-adaptation/texts.mjs';
// Task ledger adapted from trisoul 4189f90: preserve excerpts, anchors, item operations and evidence.
// DSH V3 events and a unified model-facing tool are wired in tasks.mjs.
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { accessSync, constants, realpathSync } from 'node:fs'
import { resolve as resolvePath, extname } from 'node:path'

// Persist through the host's todo/write event. The native todos projection and
// the full excerpts/tasks ledger share that durable event, so both readers work.
export const TODOLIST_EVENT = 'todo/write'
// Full OMD snapshots include tasks; the host-only format contains todos.
export const isTodoSnapshot = (e) => e?.type === TODOLIST_EVENT && Array.isArray(e.data?.tasks)
/** 任务有跑绿的 test 链接（真正靠运行过关） */
const passedTest = (t) => (t.links ?? []).some(l => l.kind === 'test' && l.lastRun?.pass === true)
// Shared classification for evidence review, completion counts and UI labels.
export const textOnly = (t) => !passedTest(t) && (t.links ?? []).some(l => l.kind === 'text')
// Keep the native content/status shape and the two task states. Text-only
// completion remains visibly marked in the native projection.
export const todosOf = (tasks) => (Array.isArray(tasks) ? tasks : []).map(t => ({ content: textOnly(t) ? `${t.title} ⚠ text-only` : t.title, status: t.done ? 'completed' : 'pending' }))
/** 新用户输入时投递的任务提醒。 */
export const TODO_NUDGE = promptText('runtime/task-nudge.md')
/** run 失败输出尾巴长度（回执 output tail 的截取；「tail」语义是拍板文案自带的，非预算限制） */
const RUN_TAIL_CHARS = 2000
/** 单个测试文件的执行上限（对齐本仓 run_verify 前例 tsc 300s；防挂死拖住取证轮） */
const RUN_TIMEOUT_MS = 300_000

// ---------- transcript（单编号 [n]，取自会话全量日志、不受手术影响） ----------

/** 会话里的用户原话清单：[{ n, seq, text }]（[n] 编号 = 本清单序，最新在后；插件注入不算） */
function userMessages(session) {
  const items = []
  for (const e of session?.snapshotEvents() ?? []) {
    if (e.type !== 'user/message' || e.data?.source?.kind !== 'user') continue
    const text = (Array.isArray(e.data.content) ? e.data.content : []).filter(b => b?.type === 'text').map(b => b.text ?? '').join('\n')
    if (text.trim()) items.push({ n: items.length + 1, seq: e.seq, text })
  }
  return items
}

// User-message numbering is independent of positional context rewrites.
export function transcriptText(session) {
  const items = userMessages(session)
  return items.length
    ? `Verbatim user messages in this session (newest last):\n${items.map(m => `[${m.n}] ${m.text}`).join('\n')}`
    : '(No user messages in this session yet)'
}

// ---------- Quote anchors: unique matches, ignoring punctuation and whitespace ----------

/** 折叠噪音：空白、标点、符号一律去掉；返回折叠文本与「折叠位 → 原文 UTF-16 偏移」映射 */
const NOISE = /[\s\p{P}\p{S}]/u
function fold(text) {
  let out = ''
  const map = []
  let off = 0
  for (const ch of String(text ?? '')) {
    if (!NOISE.test(ch)) { out += ch; for (let j = 0; j < ch.length; j++) map.push(off + j) }
    off += ch.length
  }
  return { out, map }
}
/** needle 在 hay 里的全部起点（允许重叠——重叠命中也算多义） */
function findAll(hay, needle) {
  const out = []
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) out.push(i)
  return out
}
/** 在 text 里按 from/to 引文定位子区间（折叠后比对，区间按原文偏移切出）→ {ok,start,end} | {err:'multi'|'none'|'inverted', field?, count?} */
function locate(text, from, to) {
  const h = fold(text)
  const nf = fold(from).out, nt = fold(to).out
  const f = nf ? findAll(h.out, nf) : []
  if (f.length === 0) return { err: 'none', field: 'from' }
  const t = nt ? findAll(h.out, nt) : []
  if (t.length === 0) return { err: 'none', field: 'to' }
  if (f.length > 1) return { err: 'multi', field: 'from', count: f.length }
  if (t.length > 1) return { err: 'multi', field: 'to', count: t.length }
  const start = h.map[f[0]]
  const end = h.map[t[0] + nt.length - 1] + 1
  if (t[0] < f[0] || end <= start) return { err: 'inverted' }
  return { ok: true, start, end }
}
const locateErrText = (r, where) => r.err === 'multi'
  ? `Rejected: "${r.field}" matches ${r.count} places in ${where}. Quote a longer fragment.`
  : r.err === 'none'
    ? `Rejected: no match for "${r.field}" in ${where}.`
    : `Rejected: "to" ends before "from" begins in ${where}.`

// ---------- Ledger and evidence rendering ----------

const box4 = (done) => done ? '[done]' : '[    ]'
/** 含节选原文的完整树（op:view 与变更回执共用） */
function renderTree(rec) {
  if (!rec.excerpts.length && !rec.tasks.length) return 'Todo list is empty.'
  const lines = ['Todo list (E = excerpt, T = task):']
  const appendTask = (t, suffix) => {
    lines.push(`  ${t.id} ${box4(t.done)} ${t.title}${suffix}`)
  }
  for (const ex of rec.excerpts) {
    lines.push(`${ex.id} [msg ${ex.msg}] "${ex.text}"`)
    for (const t of rec.tasks.filter(t => t.anchor?.excerpt === ex.id)) {
      appendTask(t, ` ← "${ex.text.slice(t.anchor.start, t.anchor.end)}"`)
    }
  }
  for (const t of rec.tasks.filter(t => !t.anchor)) appendTask(t, ' — legacy task; add its original-wording anchor with op:edit')
  return lines.join('\n')
}
// Incomplete timed-out runs are distinct from completed failing runs.
const runState = (l) => l.lastRun ? (l.lastRun.timedOut ? 'TIMEOUT' : l.lastRun.pass ? 'PASS' : 'FAIL') : 'not run yet'
/** test 链接的标识：路径 +（有 cmd 时）命令原文，跑了什么留痕 */
const testLabel = (l) => `${l.path}${l.cmd ? ` (${l.cmd})` : ''}`
const linkLine = (l) => l.kind === 'text'
  ? `${l.id} text — "${l.note}" ⚠ text evidence${l.reason ? ` — reason: "${l.reason}"` : ''}`
  : `${l.id} test ${testLabel(l)} — ${runState(l)}`
/** verify_link 的 view 与 run 回执尾部共用验证视图。 */
function renderVerifyView(rec) {
  if (!rec.tasks.length) return 'No tasks yet.'
  const lines = ['Verification view (T = task, L = link):']
  for (const t of rec.tasks) {
    if (!t.links.length) { lines.push(`${t.id} ${box4(t.done)} ${t.title} — no links`); continue }
    lines.push(`${t.id} ${box4(t.done)} ${t.title}`)
    for (const l of t.links) lines.push(`  ${linkLine(l)}`)
  }
  return lines.join('\n')
}
// Original task-completion reminders; shared by the single-model stopping hook.
const qualified = (l) => l.kind === 'text' || l.lastRun?.pass === true
const deficitClause = (l) => l.kind === 'text'
  ? `${l.id} text — "${l.note}"`
  : `${l.id} test ${testLabel(l)}, ${runState(l)}`
const reviewClause = (l) => `${l.id} text — "${l.note}"${l.reason ? ` — your reason no higher rung was runnable: "${l.reason}"` : ''}`
const REVIEW_TAIL = promptText('runtime/evidence-review.md')

// ---------- 测试运行器（op:run 真执行；按扩展名定运行器，py 走 pytest→裸跑级联） ----------

/** 按文件扩展名选择运行器；未知扩展名只认可执行文件。 */
export function runnerFor(p) {
  const ext = extname(String(p ?? '')).toLowerCase()
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'node'
  if (ext === '.py') return 'python'
  if (ext === '.sh') return 'bash'
  if (ext === '.ps1') return 'pwsh'
  return null
}
/** Resolve a linked file relative to the session workspace. */
function existingPath(cwd, p) {
  try {
    const real = realpathSync(resolvePath(cwd, p))
    return real
  } catch { return null }
}
// The host owns process execution, sandboxing and cancellation. This layer only
// chooses the repository's runner and interprets a completed execution.
const quoteArg = value => process.platform === 'win32'
  ? "'" + String(value).replaceAll("'", "''") + "'"
  : "'" + String(value).replaceAll("'", "'\"'\"'") + "'"
const commandFor = (command, args) => (process.platform === 'win32' ? '& ' : '') + [command, ...args].map(quoteArg).join(' ')
async function runTestLink(link, real, execute, timeoutMs) {
  const run = (command, args) => execute(commandFor(command, args), timeoutMs)
  if (link.cmd) return execute(link.cmd, timeoutMs)
  const kind = runnerFor(link.path)
  if (kind === 'node') return run(process.execPath, [real])
  if (kind === 'bash') return run('bash', [real])
  if (kind === 'pwsh') return run('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', real])
  if (kind === 'python') {
    const python = process.platform === 'win32' ? 'python' : 'python3'
    const r = await run(python, ['-m', 'pytest', '-x', '-q', real])
    if (r.ok || r.timedOut || r.aborted) return r
    if (r.code === 5 || /No module named pytest/i.test(r.out)) return run(python, [real])
    return r
  }
  try { accessSync(real, constants.X_OK) } catch {
    return { ok: false, timedOut: false, out: `No runner for ${link.path} — give cmd (the repository's own test command for this file), or link a .js/.mjs/.cjs/.py/.sh/.ps1 file.` }
  }
  return run(real, [])
}

// ---------- 清单存储（会话持久：每次变更 append 快照事件，重启从事件恢复） ----------

export function createTodoStore({ runTimeoutMs = RUN_TIMEOUT_MS } = {}) {
  /** sessionId → 记录（内存态权威副本；快照事件是持久层与投影源） */
  const sessions = new Map()
  // Continuation control belongs to one running turn, never to task completion.
  // A restart starts a new turn; the successful tool result retains the reason.
  const turnControls = new WeakMap()
  const turnControl = (session, turn) => {
    const events = session.snapshotEvents()
    const start = events.findLast(e => e.type === 'turn/start')
    // Positional context rewrites can restore an old user message with a new seq.
    const input = events.findLast(e => e.type === 'user/message' && e.surfaceOp === 'append' && e.data?.source?.kind === 'user')
    const scope = { turn: turn ?? start?.data.turn, start: start?.seq ?? -1, input: input?.seq ?? -1 }
    let control = turnControls.get(session)
    if (!control || Object.keys(scope).some(key => control[key] !== scope[key])) {
      control = { ...scope, paused: false, reminders: new Set() }
      turnControls.set(session, control)
    }
    return control
  }
  const recordOf = (sid) => {
    let r = sessions.get(sid)
    if (!r) {
      r = { excerpts: [], tasks: [], nextE: 1, nextT: 1, nextL: 1, adopted: false }
      sessions.set(sid, r)
    }
    return r
  }
  // Restore the complete ledger, including quiet evidence-review snapshots.
  const adopt = (session, r) => {
    r.adopted = true
    const last = session.snapshotEvents().findLast(e => isTodoSnapshot(e) || (e.type === TODOLIST_EVENT && Array.isArray(e.data?.todos)))
    if (last?.data) {
      const d = last.data
      r.excerpts = structuredClone(d.excerpts ?? [])
      r.tasks = structuredClone(d.tasks ?? tasksFromLegacy(d.todos ?? []))
      r.nextE = d.nextE ?? r.excerpts.length + 1
      r.nextT = d.nextT ?? r.tasks.length + 1
      r.nextL = d.nextL ?? 1
    }

  }
  const getRec = (session) => {
    const r = recordOf(session.id)
    if (!r.adopted) { try { adopt(session, r) } catch { r.adopted = true } }
    return r
  }
  /** Commit the durable V3 snapshot before advancing the in-memory ledger. */
  const commit = (session, r, next, { quiet = false } = {}) => {
    session.append(TODOLIST_EVENT, { todos: todosOf(next.tasks), excerpts: next.excerpts, tasks: next.tasks, nextE: next.nextE, nextT: next.nextT, nextL: next.nextL, ...(quiet ? { quiet: true } : {}) })
    r.excerpts = next.excerpts; r.tasks = next.tasks
    r.nextE = next.nextE; r.nextT = next.nextT; r.nextL = next.nextL
  }
  const clone = (r) => structuredClone({ excerpts: r.excerpts, tasks: r.tasks, nextE: r.nextE, nextT: r.nextT, nextL: r.nextL })
  const err = (text) => ({ text, isError: true })
  const excerptTaskError = (message, entry, index, ex, source) => {
    const lines = [message, `Failed entry: tasks[${index}] (${JSON.stringify(entry?.title ?? '')}). No excerpt or tasks from this call were saved.`]
    const a = entry?.anchor
    if (!a || typeof a.from !== 'string' || typeof a.to !== 'string') lines.push('Each task needs its own nested anchor: {"title":"...","anchor":{"from":"words inside the excerpt","to":"words inside the excerpt"}}.')
    else if (locate(source.text, a.from, a.to).ok && !locate(ex.text, a.from, a.to).ok) lines.push(`This anchor exists in user message [${source.n}] outside the selected excerpt. Extend the outer from/to so this task is included, or use a separate excerpt for it. Anchor: ${JSON.stringify({from:a.from,to:a.to})}.`)
    lines.push(`Selected excerpt from message [${source.n}]${ex.text.length > 3000 ? ' (first 3000 characters)' : ''}:\n${JSON.stringify(ex.text.slice(0, 3000))}`)
    return err(lines.join('\n'))
  }

  /** 全局 anchor 定位（add/edit）：显式 excerpt id 优先；否则唯一命中的节选；跨节选歧义/多命中/无命中硬拒 */
  const resolveAnchor = (excerpts, anchor) => {
    if (!anchor || typeof anchor.from !== 'string' || !anchor.from || typeof anchor.to !== 'string' || !anchor.to) {
      return { error: 'Rejected: every task needs anchor.from and anchor.to.' }
    }
    let pool = excerpts
    if (anchor.excerpt !== undefined && anchor.excerpt !== null && anchor.excerpt !== '') {
      const ex = excerpts.find(x => x.id === anchor.excerpt)
      if (!ex) return { error: `Rejected: unknown excerpt id ${anchor.excerpt}.` }
      pool = [ex]
    }
    const hits = []
    let multi
    for (const ex of pool) {
      const r = locate(ex.text, anchor.from, anchor.to)
      if (r.ok) hits.push({ ex, r })
      else if (r.err === 'multi' && !multi) multi = { ex, r }
    }
    if (hits.length === 1 && !multi) return { excerpt: hits[0].ex.id, start: hits[0].r.start, end: hits[0].r.end }
    if (hits.length > 1) {
      const ids = hits.map(h => h.ex.id)
      const listed = ids.length === 2 ? `both ${ids[0]} and ${ids[1]}` : `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`
      return { error: `Rejected: the anchor quote appears in ${listed}. Add "excerpt" to specify.` }
    }
    if (multi) return { error: locateErrText(multi.r, `excerpt ${multi.ex.id}`) }
    return { error: `Rejected: the anchor ("${anchor.from}" → "${anchor.to}") matches no excerpt.` }
  }
  /** 建一条任务进 next 账面；返回错误文案或 undefined */
  const buildTask = (next, entry, fixedExcerpt) => {
    const title = typeof entry?.title === 'string' ? entry.title.trim() : ''
    if (!title) return 'Rejected: every task needs a one-line title.'
    let a
    if (fixedExcerpt) {
      if (!entry.anchor || typeof entry.anchor.from !== 'string' || !entry.anchor.from || typeof entry.anchor.to !== 'string' || !entry.anchor.to) {
        return 'Rejected: every task needs anchor.from and anchor.to.'
      }
      const r = locate(fixedExcerpt.text, entry.anchor.from, entry.anchor.to)
      if (!r.ok) return locateErrText(r, 'the new excerpt')
      a = { excerpt: fixedExcerpt.id, from: entry.anchor.from, to: entry.anchor.to, start: r.start, end: r.end }
    } else {
      const r = resolveAnchor(next.excerpts, entry.anchor)
      if (r.error) return r.error
      a = { excerpt: r.excerpt, from: entry.anchor.from, to: entry.anchor.to, start: r.start, end: r.end }
    }
    // The same title and anchor identify an existing task, not a second item.
    const dup = next.tasks.find(t => t.title === title && t.anchor?.excerpt === a.excerpt && t.anchor.start === a.start && t.anchor.end === a.end)
    if (dup) return `Rejected: task "${title}" with the same anchor already exists as ${dup.id}.`
    next.tasks.push({ id: `T${next.nextT++}`, title, anchor: a, done: false, links: [] })
    return undefined
  }

  /** 摘录与任务结构操作；整调用原子。 */
  const execTaskMap = (session, args) => {
    const rec = getRec(session)
    const op = args?.op
    if (op === 'transcript') return { text: transcriptText(session) }
    if (op === 'view') return { text: renderTree(rec) }
    if (op === 'pause_turn') {
      if (typeof args.reason !== 'string' || !args.reason.trim()) return err('Rejected: op:pause_turn requires a reason stating the blocker and what is needed to continue.')
      const events = session.snapshotEvents(), start = events.findLast(e => e.type === 'turn/start')
      if (!start || events.some(e => e.seq > start.seq && e.type === 'turn/end')) return err('Rejected: op:pause_turn requires an active turn.')
      turnControl(session).paused = true
      return { text: `Todo and verification continuation reminders are paused for this turn. Tasks, evidence, and BT settings are unchanged.\nReason: ${args.reason.trim()}\nExplain what remains incomplete and what is needed to continue, then end your response. New user input or the next turn restores the checks. This does not stop background jobs or pause an active goal.` }
    }
    if (op === 'excerpt') {
      const msgs = userMessages(session)
      if (typeof args.from !== 'string' || !args.from || typeof args.to !== 'string' || !args.to) {
        return err('Rejected: op:excerpt requires from and to.')
      }
      // A unique quote resolves without a message ID; ambiguous matches require one.
      let m, loc
      if (args.msg !== undefined && args.msg !== null) {
        m = msgs.find(x => x.n === args.msg)
        if (!m) return err(`Rejected: no user message [${args.msg}] — op:transcript lists ${msgs.length}.`)
      } else {
        const hits = []
        let multi
        for (const x of msgs) {
          const r = locate(x.text, args.from, args.to)
          if (r.ok) hits.push({ m: x, r })
          else if (r.err === 'multi' && !multi) multi = { m: x, r }
        }
        if (hits.length === 1 && !multi) { m = hits[0].m; loc = hits[0].r }
        else if (hits.length > 1) {
          const ns = hits.map(h => `[${h.m.n}]`)
          const listed = ns.length === 2 ? `both ${ns[0]} and ${ns[1]}` : `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`
          return err(`Rejected: the quote appears in ${listed}. Add "msg" to specify.`)
        } else if (multi) {
          return err(locateErrText(multi.r, `message [${multi.m.n}]`))
        } else {
          return err(`Rejected: the quote ("${args.from}" → "${args.to}") matches no user message.`)
        }
      }
      // Reject an already recorded excerpt without partially changing the ledger.
      const dupEx = rec.excerpts.find(x => x.msg === m.n && x.from === args.from && x.to === args.to)
      if (dupEx) return err(`Rejected: this excerpt is already recorded as ${dupEx.id} — the todo list already covers it. Use op:add/edit/remove to change tasks, or op:view to see it.`)
      if (!loc) {
        loc = locate(m.text, args.from, args.to)
        if (!loc.ok) return err(locateErrText(loc, `message [${m.n}]`))
      }
      const next = clone(rec)
      const ex = { id: `E${next.nextE++}`, msg: m.n, from: args.from, to: args.to, text: m.text.slice(loc.start, loc.end) }
      next.excerpts.push(ex)
      const entries = Array.isArray(args.tasks) ? args.tasks : []
      const firstT = next.nextT
      for (const [index, entry] of entries.entries()) {
        const e = buildTask(next, entry, ex)
        if (e) return excerptTaskError(e, entry, index, ex, m)
      }
      commit(session, rec, next)
      const ids = entries.length ? (entries.length === 1 ? `T${firstT}` : `T${firstT}–T${next.nextT - 1}`) : 'none'
      const head = `Excerpt ${ex.id} recorded (msg ${ex.msg}, "${ex.from}"→"${ex.to}") with ${entries.length} task${entries.length === 1 ? '' : 's'} (${ids}).`
      return { text: `${head}\n\n${renderTree(rec)}` }
    }
    if (op === 'add' || op === 'edit') {
      const entries = Array.isArray(args.tasks) ? args.tasks : []
      if (!entries.length) return err(`Rejected: op:${op} requires tasks.`)
      const next = clone(rec)
      const echo = []
      if (op === 'add') {
        const firstT = next.nextT
        for (const entry of entries) {
          const e = buildTask(next, entry)
          if (e) return err(e)
        }
        echo.push(`Tasks added: ${Array.from({ length: next.nextT - firstT }, (_, i) => `T${firstT + i}`).join(', ')}.`)
      } else {
        for (const entry of entries) {
          if (typeof entry?.id !== 'string' || !entry.id) return err('Rejected: op:edit requires an id on every task entry.')
          const t = next.tasks.find(x => x.id === entry.id)
          if (!t) return err(`Rejected: unknown task id ${entry.id}.`)
          const hasTitle = typeof entry.title === 'string' && entry.title.trim()
          const hasAnchor = entry.anchor !== undefined && entry.anchor !== null
          if (!hasTitle && !hasAnchor) return err('Rejected: op:edit entries need title or anchor.')
          const title = hasTitle ? entry.title.trim() : t.title
          let anchor = t.anchor
          if (hasAnchor) {
            const r = resolveAnchor(next.excerpts, entry.anchor)
            if (r.error) return err(r.error)
            anchor = { excerpt: r.excerpt, from: entry.anchor.from, to: entry.anchor.to, start: r.start, end: r.end }
          }
          // Compare resolved ranges, not alternate quotes of the same user text.
          if (title === t.title && anchor?.excerpt === t.anchor?.excerpt && anchor?.start === t.anchor?.start && anchor?.end === t.anchor?.end) {
            echo.push(`Task ${t.id} unchanged — its checkmark and verification links were preserved.`)
            continue
          }
          t.title = title; t.anchor = anchor
          // Only a changed task invalidates its completion and evidence, not the files.
          t.done = false
          t.links = []
          delete t.legacyVerification; delete t.legacySource
          echo.push(`Task ${t.id} updated — its checkmark and verification links were cleared.`)
        }
      }
      commit(session, rec, next)
      return { text: `${echo.join('\n')}\n\n${renderTree(rec)}` }
    }
    if (op === 'remove') {
      const ids = Array.isArray(args.ids) ? args.ids : []
      if (!ids.length) return err('Rejected: op:remove requires ids.')
      const next = clone(rec)
      for (const id of ids) {
        const i = next.tasks.findIndex(t => t.id === id)
        if (i < 0) return err(`Rejected: unknown task id ${id}.`)
        next.tasks.splice(i, 1)
      }
      commit(session, rec, next)
      return { text: `Tasks removed: ${ids.join(', ')}.\n\n${renderTree(rec)}` }
    }
    return err(`Rejected: unknown op "${String(op)}".`)
  }

  /** 更新完成状态；删除任务由 op:remove 处理。 */
  const execCheck = (session, updates) => {
    const rec = getRec(session)
    const ups = Array.isArray(updates) ? updates : []
    if (!ups.length) return err('Rejected: op:check requires updates.')
    const next = clone(rec)
    const seen = []
    for (const u of ups) {
      if (typeof u?.id !== 'string' || typeof u?.done !== 'boolean') return err('Rejected: every update needs id and done.')
      const t = next.tasks.find(x => x.id === u.id)
      if (!t) return err(`Rejected: unknown task id ${u.id}.`)
      t.done = u.done
      seen.push([t.id, u.done])
    }
    commit(session, rec, next)
    return { text: `Updated: ${seen.map(([id, d]) => `${id} → ${d ? 'done' : 'open'}`).join(', ')}. Tasks: ${rec.tasks.filter(t => t.done).length}/${rec.tasks.length} done.` }
  }

  /** 验证证据操作：link/run/unlink/view。 */
  const execVerifyLink = async (session, args, cwd, signal, execute) => {
    const rec = getRec(session)
    const op = args?.op
    if (op === 'view') return { text: renderVerifyView(rec) }
    if (op === 'link') {
      const next = clone(rec)
      const entries = Array.isArray(args.links) ? args.links : []
      if (!entries.length) return err('Rejected: op:link requires links.')
      const staged = []
      for (const [index, e] of entries.entries()) {
        if (typeof e?.task !== 'string' || !e.task) return err(`Rejected: links[${index}].task is required. ${next.tasks.length ? `Use an existing task ID: ${next.tasks.map(t => t.id).join(', ')}.` : 'No tasks have been recorded; correct the rejected todo_write call before linking evidence.'} No links were saved.`)
        const t = next.tasks.find(x => x.id === e?.task)
        if (!t) return err(`Rejected: unknown task id ${e?.task}.`)
        if (e.kind !== 'test' && e.kind !== 'text') return err('Rejected: kind must be "test" or "text".')
        if (e.kind === 'test' && (typeof e.path !== 'string' || !e.path.trim())) return err('Rejected: kind "test" requires path.')
        if (e.kind === 'text' && (typeof e.note !== 'string' || !e.note.trim())) return err('Rejected: kind "text" requires note.')
        // Text-only evidence retains the reason executable verification is unavailable.
        if (e.kind === 'text' && (typeof e.reason !== 'string' || !e.reason.trim())) return err('Rejected: kind "text" requires reason — why no higher rung on the evidence ladder is runnable here.')
        if (typeof e.path === 'string' && e.path.trim() && !existingPath(cwd, e.path.trim())) return err(`Rejected: no such file ${e.path.trim()}.`)
        const cmd = e.kind === 'test' && typeof e.cmd === 'string' && e.cmd.trim() ? e.cmd.trim() : null
        staged.push({ task: t, kind: e.kind, path: typeof e.path === 'string' && e.path.trim() ? e.path.trim() : null, note: typeof e.note === 'string' && e.note.trim() ? e.note.trim() : null, reason: e.kind === 'text' ? e.reason.trim() : null, cmd })
      }
      const made = []
      for (const s of staged) {
        const link = { id: `L${next.nextL++}`, kind: s.kind, path: s.path, note: s.note, reason: s.reason, lastRun: null, ...(s.kind === 'test' ? { cmd: s.cmd } : { asked: false }) }
        s.task.links.push(link)
        made.push({ link, task: s.task })
      }
      commit(session, rec, next)
      const pending = made.filter(m => m.link.kind === 'test')
      const head = `Linked: ${made.map(m => m.link.kind === 'test' ? `${m.link.id} (test ${m.link.path} → ${m.task.id})` : `${m.link.id} (text → ${m.task.id})`).join(', ')}.`
      return { text: pending.length ? `${head} Pending run: ${pending.map(m => m.link.id).join(', ')}.` : head }
    }
    if (op === 'run') {
      const next = clone(rec)
      let targets = next.tasks
      if (Array.isArray(args.tasks) && args.tasks.length) {
        targets = []
        for (const id of args.tasks) {
          const t = next.tasks.find(x => x.id === id)
          if (!t) return err(`Rejected: unknown task id ${id}.`)
          targets.push(t)
        }
      }
      const jobs = targets.flatMap(t => t.links.filter(l => l.kind === 'test').map(l => ({ t, l })))
      if (!jobs.length) return { text: 'Nothing to run: no test links on the given tasks.' }
      if (typeof execute !== 'function') return err('Native shell execution is unavailable; previous verification results are unchanged.')
      const results = []
      let aborted = false
      for (const { t, l } of jobs) {
        // Cancellation is not a test result; preserve unfinished and unstarted evidence.
        if (signal?.aborted) { aborted = true; break }
        const real = existingPath(cwd, l.path)
        const startedAt = Date.now(), started = performance.now()
        let r
        try { r = real ? await runTestLink(l, real, execute, runTimeoutMs) : { ok: false, timedOut: false, out: `no such file ${l.path}` } }
        catch (error) {
          // A denied or unavailable execution is not a failed test. Preserve its
          // previous evidence, but retain tests that actually finished earlier.
          if (results.length) commit(session, rec, next)
          throw error
        }
        if (r.aborted) { aborted = true; break }
        l.lastRun = { pass: r.ok, timedOut: Boolean(r.timedOut), tail: (r.out ?? '').slice(-RUN_TAIL_CHARS),
          startedAt, finishedAt: Date.now(), durationMs: Math.max(0, Math.round(performance.now() - started)),
          // Only the native runner can supply execution identity. Old evidence
          // and results without a completed native call retain unknown provenance.
          execution: r.execution ?? null }
        results.push({ t, l, pass: r.ok, timedOut: l.lastRun.timedOut, timeoutMs: r.timeoutMs ?? runTimeoutMs, tail: l.lastRun.tail })
      }
      if (results.length) commit(session, rec, next)
      // Completed failure is a valid result, not a broken tool. Always retain
      // command/output evidence, and distinguish timeout from a completed failure.
      const ran = results.length ? `Ran ${results.length} linked test${results.length === 1 ? '' : 's'}: ${results.map(r =>
        r.timedOut ? `${testLabel(r.l)} TIMEOUT after ${Math.round(r.timeoutMs / 1000)}s (${r.t.id} — did not finish; this is not a test failure. Narrow the command to the tests that cover this task.)`
          : `${testLabel(r.l)} ${r.pass ? 'PASS' : 'FAIL'} (${r.t.id}, output tail: "${r.tail}")`).join(' · ')}` : ''
      const head = !aborted ? ran
        : ran ? `${ran} · Run aborted: ${jobs.length - results.length} not finished — their previous results are unchanged.`
          : 'Run aborted before any linked test finished — previous results are unchanged.'
      return { text: `${head}\n\n${renderVerifyView(rec)}` }
    }
    if (op === 'unlink') {
      const next = clone(rec)
      const ids = Array.isArray(args.ids) ? args.ids : []
      if (!ids.length) return err('Rejected: op:unlink requires ids.')
      const found = []
      for (const id of ids) {
        const t = next.tasks.find(x => x.links.some(l => l.id === id))
        if (!t) return err(`Rejected: unknown link id ${id}.`)
        found.push([t, id])
      }
      for (const [t, id] of found) t.links = t.links.filter(l => l.id !== id)
      commit(session, rec, next)
      return { text: `Unlinked: ${found.map(([t, id]) => `${id} (${t.id})`).join(', ')}.` }
    }
    return err(`Rejected: unknown op "${String(op)}".`)
  }

  const gateState = (session) => {
    const rec = getRec(session)
    const undone = rec.tasks.filter(t => !t.done).length
    const unqualified = rec.tasks.filter(t => !t.links.some(qualified)).length
    return { pass: rec.tasks.length === 0 || (undone === 0 && unqualified === 0), undone, unqualified, total: rec.tasks.length }
  }
  const blockingLines = (rec, { todo = true, verification = true } = {}) => rec.tasks
    .filter(t => (todo && !t.done) || (verification && !t.links.some(qualified)))
    .map(t => `${t.id} ${box4(t.done)} ${t.title}${verification ? ` — ${t.links.length ? t.links.map(deficitClause).join(' · ') : 'no link to real, valid evidence that the task is done'}` : ''}`)
  const unresolvedText = (session, options) => `[todo list] Unresolved tasks remain:\n${blockingLines(getRec(session), options).join('\n')}\nContinue the permitted work that remains. A summary of progress is not completion of these tasks.`
  const unqualifiedText = (session) => {
    const rec = getRec(session), heading = rec.tasks.every(t => t.done)
      ? '[todo list] Every task is checked off, but these lack qualifying evidence:'
      : '[todo list] These tasks lack qualifying evidence:'
    return `${heading}\n${blockingLines(rec, { todo: false }).join('\n')}\nLink real evidence, or uncheck what is not actually done.`
  }
  const reviewTargets = (rec) => rec.tasks.filter(t => textOnly(t) && t.links.some(l => l.kind === 'text' && l.asked !== true))
  const releaseSummary = (session) => {
    const rec = getRec(session)
    return { total: rec.tasks.length, done: rec.tasks.filter(t => t.done).length, tested: rec.tasks.filter(passedTest).length, textOnly: rec.tasks.filter(textOnly).length }
  }
  const textReviewLinkIds = (session) => reviewTargets(getRec(session)).flatMap(t => t.links.filter(l => l.kind === 'text' && l.asked !== true).map(l => l.id))
  const textReviewText = (session) => {
    const targets = reviewTargets(getRec(session))
    if (!targets.length) return undefined
    const lines = targets.map(t => `${t.id} ${box4(t.done)} ${t.title} — ${t.links.filter(l => l.kind === 'text').map(reviewClause).join(' · ')}`)
    return `[todo list] Tasks whose only evidence is a text record:\n${lines.join('\n')}\n${REVIEW_TAIL}`
  }
  // Mark only links included in the delivered review; newly linked evidence gets its own review.
  const markTextReviewed = (session, ids) => {
    const rec = getRec(session), next = clone(rec), included = new Set(ids)
    let n = 0
    for (const t of reviewTargets(next)) for (const l of t.links) {
      if (l.kind === 'text' && l.asked !== true && included.has(l.id)) { l.asked = true; n++ }
    }
    if (n) commit(session, rec, next, { quiet: true })
    return n
  }

  // Compare the live Todo/runtime block with the current ledger at request boundaries.
  const maintainInjection = (session, options = {}) => {
    let live = session.surface.nodes.map(seq => session.eventAt(seq)).filter(e => e.type === 'user/message' && (sourceName(e.data?.source) === 'trisoul-x:tasks' || e.data?.[TODO_META]));
    const desired = latestTaskContext(session, options.runtime);
    // Disabling removes only our state section, including compressed carriers.
    if (!desired?.meta.runtime) {
      for (const e of live.filter(e => taskContextMeta(e.data)?.runtime)) {
        const restored = withoutRuntime(e.data);
        if (restored) session.append('user/message', { ...restored, id: crypto.randomUUID() },
          { surfaceOp: { op: 'replace', startSeq: e.seq, endSeq: e.seq }, sourceEventSeqs: [e.seq] });
        else appendShadow(session, [e.seq]);
      }
      live = session.surface.nodes.map(seq => session.eventAt(seq)).filter(e => e.type === 'user/message' && (sourceName(e.data?.source) === 'trisoul-x:tasks' || e.data?.[TODO_META]));
    }
    if (!desired) return undefined;
    // Budget-only updates share the existing summary exclusion and compaction
    // cleanup, but never replace the baseline for full Todo/state delivery.
    const last = live.findLast(e => !taskContextMeta(e.data)?.budgetOnly), meta = taskContextMeta(last?.data);
    const text = last?.data.content[last.data[TODO_META]?.index ?? 0]?.text;
    // The full block always follows the original node-based cadence.
    const same = meta ? meta.todoText === desired.meta.todoText && (meta.runtime?.key ?? null) === (desired.meta.runtime?.key ?? null) : text === desired.text;
    if (same) {
      const budget = desired.meta.runtime?.budget;
      const previous = taskContextMeta(live.findLast(e => taskContextMeta(e.data)?.runtime?.budget)?.data)?.runtime.budget;
      if (!budget?.every || !previous || budget.rounds - previous.rounds < budget.every) return undefined;
      const runtime = { ...desired.meta.runtime, text: budget.text };
      return session.append('user/message', { ...createUserMessage({ content: [{ type: 'text', text: budget.text }], source: { kind: 'plugin:trisoul-x:tasks' } }),
        [TASK_CONTEXT_META]: { todoText: null, runtime, budgetOnly: true } }, { surfaceOp: 'append' });
    }
    const msg = { ...createUserMessage({ content: [{ type: 'text', text: desired.text }], source: { kind: 'plugin:trisoul-x:tasks' } }), [TASK_CONTEXT_META]: desired.meta };
    return session.append('user/message', msg, { surfaceOp: 'append' });
  }

  return { execTaskMap, execCheck, execVerifyLink, releaseSummary, gateState, unresolvedText, unqualifiedText, textReviewText, textReviewLinkIds, markTextReviewed, maintainInjection, turnControl, resetTurnControl: session => turnControls.delete(session), snapshot: session => clone(getRec(session)) }
}
