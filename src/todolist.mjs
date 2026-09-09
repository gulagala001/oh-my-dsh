// Task ledger adapted from trisoul 4189f90: preserve excerpts, anchors, item operations and evidence.
// DSH V3 events and a unified model-facing tool are wired in tasks.mjs.
import { execFile } from 'node:child_process'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { accessSync, constants, realpathSync } from 'node:fs'
import { resolve as resolvePath, extname } from 'node:path'

/** 对齐官（align）专属：todo list 结构工具名 */
export const TASK_MAP_TOOL = 'task_map'
/** 实证官（empiric）专属：验证链接工具名 */
export const VERIFY_LINK_TOOL = 'verify_link'
/** 三魂共用完成态工具名（宿主注册，actions 栏可用；顶替原装 todo_write） */
export const TODO_TOOL = 'todo'
/** 清单快照事件类型（持久化 + UI 投影共用一份事件源）。用原装 todo_write 的事件类型而不自造：dsh 读日志只认它
 *  生成的 KNOWN_SESSION_EVENT_TYPES 清单，未知类型须带 ignorable 标记，而 session.append 的信封没有该字段可打——
 *  自造类型写得进读不出（08-29 病例：跑过 task_map 的会话 resume 时整条日志被拒）。data 带原装形
 *  todos:[{content,status}] 兼容宿主/Web 镜像，自家字段 excerpts/tasks/next* 并列；恢复与投影按 data.tasks 认自家快照。 */
export const TODOLIST_EVENT = 'todo/write'
/** 自家快照判别：原装 todo_write 事件只有 todos，自家快照带 tasks 数组（顶位前的旧日志里可能有原装事件，不认） */
export const isTodoSnapshot = (e) => e?.type === TODOLIST_EVENT && Array.isArray(e.data?.tasks)
/** 任务有跑绿的 test 链接（真正靠运行过关） */
const passedTest = (t) => (t.links ?? []).some(l => l.kind === 'test' && l.lastRun?.pass === true)
/** 只靠文字过关：没有跑绿的 test、却挂着 text（I6 追问对象 / I7 分型计数 / UI ⚠ 后缀共用一把尺） */
export const textOnly = (t) => !passedTest(t) && (t.links ?? []).some(l => l.kind === 'text')
/** 原装 wire 形：title→content、done→completed|pending（两态，不加 in_progress——用户拍板）；
 *  只靠文字过关的条目 content 尾加 ⚠ text-only（I7 放行可见，同 wire 格式 UI 零改，08-29(3) 拍板） */
export const todosOf = (tasks) => (Array.isArray(tasks) ? tasks : []).map(t => ({ content: textOnly(t) ? `${t.title} ⚠ text-only` : t.title, status: t.done ? 'completed' : 'pending' }))
/** I1：用户发言时随 A 请求注入的提醒（spec I1 逐字） */
export const TODO_NUDGE = '[todo list] The user has posted new instructions — the todo list may need updating.'
/** I5 空清单提醒文案（拍板 08-29）：事实—弱建议同 I1 家族，多一个豁免句（此条是「我们猜你忘了」，须给台阶） */
export const TODO_EMPTY_NUDGE = "[todo list] The task has progressed but the todo list is still empty — if the remaining work is multi-step, consider capturing it with task_map. Just a gentle reminder; ignore if this task doesn't need one."
/** I2 换代注入消息的 id 前缀（canvas 遮蔽/钉最新按 [todo list] 文本头识别，id 前缀供本插件回收计数） */
export const TODO_INJECTION_ID_PREFIX = 'trisoul-todolist-'
/** run 失败输出尾巴长度（回执 output tail 的截取；「tail」语义是拍板文案自带的，非预算限制） */
const RUN_TAIL_CHARS = 2000
/** 单个测试文件的执行上限（对齐本仓 run_verify 前例 tsc 300s；防挂死拖住取证轮） */
const RUN_TIMEOUT_MS = 300_000

// ---------- 工具 schema（lookup 栏；描述/参数逐字取自 spec 2.1/2.2、4.1/4.2） ----------

export function taskMapSchema() {
  return {
    name: TASK_MAP_TOOL,
    description: "Creates and edits the todo list anchored to the user's own wording — a clear, complete todo list greatly raises the completion rate in medium-to-large tasks. Use it when the task takes three or more distinct steps, when the user lists several things at once, or when new instructions arrive mid-task — capture them right away. Skip it for single-step work and plain conversation — a list there is overhead, not help. op:excerpt copies a block of the user's own words in as the raw material the todo list is parsed from — quote its opening and closing words verbatim ({from, to}) — together with the tasks that cover it (`tasks:[...]` in the same call). Tasks are added, edited and removed through op:add/edit/remove. Keep the list honest as work progresses: remove tasks that are no longer relevant or turn out impossible from the list entirely (op:remove), and rewrite a task overtaken by newer instructions into what can actually be done (op:edit) — say why in your draft. Each task selects a sub-range within an excerpt as its `anchor` ({from, to}). op:transcript returns the verbatim list of user messages in this session, numbered [1], [2], … — you only need it when a quote appears in more than one message: check the numbering and add msg to the excerpt. op:view returns the full todo list including excerpts. (To check tasks off, use the todo tool; editing a task itself clears its checkmark and verification links.)",
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['excerpt', 'add', 'edit', 'remove', 'view', 'transcript'], description: 'Operation kind' },
        from: { type: 'string', description: 'Required for excerpt: opening words of the block, verbatim, unique within its message' },
        to: { type: 'string', description: 'Required for excerpt: closing words of the block, verbatim, unique within its message' },
        msg: { type: 'integer', description: 'Only for excerpt when the quote appears in more than one user message: which message, using the [n] numbering from op:transcript' },
        tasks: { type: 'array', description: 'Required for excerpt/add/edit: each entry is {"id": edit only — the task to change, "title": one line stating what the task requires, "anchor": {"excerpt": excerpt id — only needed when the quote appears in more than one excerpt, "from": opening words of the sub-range, verbatim, "to": closing words, verbatim}}.', items: { type: 'object' } },
        ids: { type: 'array', items: { type: 'string' }, description: 'Required for remove: ids of the tasks to delete' },
      },
      required: ['op'],
    },
  }
}

export function verifyLinkSchema() {
  return {
    name: VERIFY_LINK_TOOL,
    description: `The tasks' verification-link tool, used to raise the real completion rate of the todo list. A task counts as verified only through what is linked here.\n\nWhen to link: link the evidence the moment a task is done — not in one sweep after everything is built.\n\nHow a test earns its place: start from the task's own words — if that sentence is true, what must be observable? The test asserts exactly that, in the same scope as the sentence — no narrower, and no premises the user never stated. It must exercise the changed code path against real behavior — the repository's own test runner, real dependencies, not mocks of the thing under test. A test the implementation cannot fail proves nothing. Prefer the repository's own test command (cmd) over a hand-made script.\n\nWhat does not count: a test written from the implementation instead of from the task's words; a green run whose test never reaches the changed path; a scenario narrower or easier than the one the user described; a text note that restates the task title.\n\nEvidence ranks, strongest first: (1) a real-environment run doing what the user would do; (2) an automated end-to-end test; (3) a targeted probe of the exact code path; (4) a smoke check that it starts and responds; (5) a text record. Link the highest rung you can actually run here; a lower rung only when every higher one is genuinely impossible — and reason must say why. A "text" note must name its evidence — the command run, the output seen, or the file and place inspected.\n\nOps: op:link attaches evidence to a task — a test file (kind "test") or a text record (kind "text"). op:run runs the linked tests — with cmd, the command as given; without it, the file bare by extension — and reports PASS / FAIL / TIMEOUT with the output tail. op:unlink withdraws links that no longer hold (the files themselves are untouched). op:view returns every task with its completion state and evidence.`,
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['link', 'run', 'unlink', 'view'], description: 'Operation kind' },
        links: { type: 'array', description: 'Required for link: each entry is {"task": task id, "kind": "test" or "text", "path": for test — the test file path (relative to the session working directory); for text — optional supporting file, "note": for text — one line naming what was observed (command, output, or file and place), "reason": for text — one line on why no higher rung of the evidence ladder is runnable here, "cmd": for test — optional; the exact command that runs this test the way the repository runs it (e.g. "npx vitest run tests/x.test.ts", "go test ./pkg/...", "cargo test alias"); without cmd the file is run bare by its extension (node / pytest / bash)}', items: { type: 'object' } },
        tasks: { type: 'array', items: { type: 'string' }, description: "Optional for run: which tasks' linked tests to execute (default: every task with test links)" },
        ids: { type: 'array', items: { type: 'string' }, description: 'Required for unlink: link ids to withdraw' },
      },
      required: ['op'],
    },
  }
}

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

/** op:transcript 输出（spec 2.3：单一顺序号，弃用旧双编号格式） */
export function transcriptText(session) {
  const items = userMessages(session)
  return items.length
    ? `Verbatim user messages in this session (newest last):\n${items.map(m => `[${m.n}] ${m.text}`).join('\n')}`
    : '(No user messages in this session yet)'
}

// ---------- 引文定位（M11 唯一命中；08-30 ④ 用户拍板：引文匹配忽略标点与空白，覆盖校验 M7 撤销——
//   0829 批 kea/superjson/pwntools 病例：标点不一致、excerpt 未铺满连拒数次后弃建账本） ----------

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
  if (f.length > 1) return { err: 'multi', field: 'from', count: f.length }
  const t = nt ? findAll(h.out, nt) : []
  if (t.length === 0) return { err: 'none', field: 'to' }
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

// ---------- 渲染（spec 2.3 / 4.3 / I2 / I4） ----------

const box4 = (done) => done ? '[done]' : '[    ]'
/** 含节选原文的完整树（op:view 与变更回执共用） */
function renderTree(rec) {
  if (!rec.excerpts.length && !rec.tasks.length) return 'Todo list is empty.'
  const lines = ['Todo list (E = excerpt, T = task):']
  for (const ex of rec.excerpts) {
    lines.push(`${ex.id} [msg ${ex.msg}] "${ex.text}"`)
    for (const t of rec.tasks.filter(t => t.anchor?.excerpt === ex.id)) {
      lines.push(`  ${t.id} ${box4(t.done)} ${t.title} ← "${ex.text.slice(t.anchor.start, t.anchor.end)}"`)
    }
  }
  for (const t of rec.tasks.filter(t => !t.anchor)) lines.push(`  ${t.id} ${box4(t.done)} ${t.title} — legacy task; add its original-wording anchor with op:edit`);
  return lines.join('\n')
}
/** 单条链接的视图行体（4.3：test 显示跑没跑/结果，text 带 ⚠ 分型标记） */
/** test 链接的运行态三态（08-29(4)）：TIMEOUT 单列——没跑完不是没过，C 要收窄命令而不是换证据 */
const runState = (l) => l.lastRun ? (l.lastRun.timedOut ? 'TIMEOUT' : l.lastRun.pass ? 'PASS' : 'FAIL') : 'not run yet'
/** test 链接的标识：路径 +（有 cmd 时）命令原文，跑了什么留痕 */
const testLabel = (l) => `${l.path}${l.cmd ? ` (${l.cmd})` : ''}`
const linkLine = (l) => l.kind === 'text'
  ? `${l.id} text — "${l.note}" ⚠ text evidence${l.reason ? ` — reason: "${l.reason}"` : ''}`
  : `${l.id} test ${testLabel(l)} — ${runState(l)}`
/** 含验证态的视图（op:view / op:run 回执尾部） */
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
/** I2 裸版注入正文：[todo list] 标签 + 逐行 [ ]/[x]（无任何框架语；仅任务树+完成态） */
function renderInjection(rec) {
  // 08-30 P14：删空后的一版要把画布钉着的旧清单换掉，正文明说已清空（画布按 [todo list] 前缀认最新一版）
  if (!rec.tasks.length) return '[todo list]\n(empty — all tasks were removed)'
  return ['[todo list]', ...rec.tasks.map(t => `${t.done ? '[x]' : '[ ]'} ${t.id} ${t.title}`)].join('\n')
}
// ---------- 测试运行器（op:run 真执行；按扩展名定运行器，py 走 pytest→裸跑级联） ----------

/** 扩展名 → 运行器族：'node' | 'python' | 'bash' | null（null = 只认可执行文件） */
export function runnerFor(p) {
  const ext = extname(String(p ?? '')).toLowerCase()
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'node'
  if (ext === '.py') return 'python'
  if (ext === '.sh') return 'bash'
  return null
}
/** Resolve a linked file relative to the session workspace. */
function existingPath(cwd, p) {
  try {
    const real = realpathSync(resolvePath(cwd, p))
    return real
  } catch { return null }
}
/** 超时 / 上游中止 / 失败三分（08-29(4) + 08-30 P1/P15）：
 *  - 超时：自管计时器，到点杀**整个进程组**（子进程用 detached 起成组长）——bash -c 复合命令会 fork，只杀 bash 会留孤儿测试进程；
 *    SIGTERM 两秒不退再 SIGKILL。timedOut 由自己的标记判，不再靠 execFile 的 killed+SIGTERM 猜（旧 `!signal?.aborted` 守卫恒真）。
 *  - 上游中止（用户点停止）：同样杀组，但结果标 aborted——它与测试本身无关，调用方不得记成 FAIL。
 *  - 其余：exit 0 = ok。win32 无进程组语义，退回只杀直接子进程。 */
const execP = (cmd, args, cwd, signal, timeoutMs) => new Promise((res) => {
  if (signal?.aborted) return res({ ok: false, aborted: true, timedOut: false, out: '' })
  const grouped = process.platform !== 'win32'
  let child, timedOut = false, aborted = false, killTimer, forceTimer
  const killGroup = (sig) => {
    if (!child?.pid) return
    if (grouped) { try { process.kill(-child.pid, sig); return } catch { /* 组已不在，退回单杀 */ } }
    try { child.kill(sig) } catch { /* 已退出 */ }
  }
  const stop = () => { killGroup('SIGTERM'); forceTimer = setTimeout(() => killGroup('SIGKILL'), 2000) }
  const onAbort = () => { aborted = true; stop() }
  try {
    child = execFile(cmd, args, { cwd, maxBuffer: 64 * 1024 * 1024, detached: grouped }, (err, stdout, stderr) => {
      clearTimeout(killTimer); clearTimeout(forceTimer); signal?.removeEventListener?.('abort', onAbort)
      res({ ok: !err && !timedOut && !aborted, code: err?.code, aborted, timedOut: timedOut && !aborted, out: `${stdout ?? ''}${stderr ?? ''}`.trim() })
    })
    killTimer = setTimeout(() => { timedOut = true; stop() }, timeoutMs)
    signal?.addEventListener?.('abort', onAbort, { once: true })
  } catch (e) { clearTimeout(killTimer); res({ ok: false, aborted: false, timedOut: false, out: String(e?.message ?? e) }) }
})
/** 跑一条已链接的 test：有 cmd 按仓库自己的命令跑（bash -c，cwd = 会话目录）；无 cmd 按扩展名裸跑。exit 0 = PASS。
 *  py 先 pytest（-x -q）；pytest 缺席或收不到测试（exit 5）再裸跑 */
async function runTestLink(link, real, cwd, signal, timeoutMs) {
  if (link.cmd) return execP('bash', ['-c', link.cmd], cwd, signal, timeoutMs)
  const path = link.path
  const kind = runnerFor(path)
  if (kind === 'node') return execP('node', [real], cwd, signal, timeoutMs)
  if (kind === 'bash') return execP('bash', [real], cwd, signal, timeoutMs)
  if (kind === 'python') {
    const r = await execP('python3', ['-m', 'pytest', '-x', '-q', real], cwd, signal, timeoutMs)
    if (r.ok || r.timedOut || r.aborted) return r
    if (r.code === 5 || /No module named pytest/i.test(r.out)) return execP('python3', [real], cwd, signal, timeoutMs)
    return r
  }
  try { accessSync(real, constants.X_OK); return execP(real, [], cwd, signal, timeoutMs) } catch {}
  return { ok: false, timedOut: false, out: `No runner for ${path} — give cmd (the repository's own test command for this file), or link a .js/.mjs/.cjs/.py/.sh file.` }
}

// ---------- 清单存储（会话持久：每次变更 append 快照事件，重启从事件恢复） ----------

export function createTodoStore({ runTimeoutMs = RUN_TIMEOUT_MS } = {}) {
  /** sessionId → 记录（内存态权威副本；快照事件是持久层与投影源） */
  const sessions = new Map()
  const recordOf = (sid) => {
    let r = sessions.get(sid)
    if (!r) {
      r = { excerpts: [], tasks: [], nextE: 1, nextT: 1, nextL: 1, rev: 0, injectedRev: -1, lastInjSeq: -1, injCounter: 0, nudgedSeq: -1, emptyNudgedSeq: -1, adopted: false }
      sessions.set(sid, r)
    }
    return r
  }
  /** 会话 resume（新进程内存态已丢）：从事件日志恢复最新快照 + 注入位点 */
  const adopt = (session, r) => {
    r.adopted = true
    let last, lastSnapSeq = -1
    for (const e of session.snapshotEvents()) {
      // quiet 快照（I6 问过标记）= 模型面无变化：不涨 rev、不算变更位点（否则 resume 后白注一版清单）
      if (isTodoSnapshot(e) || (e.type === TODOLIST_EVENT && Array.isArray(e.data?.todos))) { last = e; if (!e.data.quiet) { r.rev++; lastSnapSeq = e.seq } }
      else if (e.type === 'user/message' && e.data?.source?.plugin === 'trisoul-x:tasks') {
        r.lastInjSeq = Math.max(r.lastInjSeq, e.seq)
        const m = e.data.id.match(/-(\d+)$/)
        if (m) r.injCounter = Math.max(r.injCounter, Number(m[1]))
      }
    }
    if (last?.data) {
      const d = last.data
      r.excerpts = structuredClone(d.excerpts ?? [])
      r.tasks = structuredClone(d.tasks ?? (d.todos ?? []).map((t, i) => ({ id: `T${i + 1}`, title: t.content, done: t.status === 'completed', anchor: null, links: [], legacySource: t.source ?? '', ...(t.verification ? { legacyVerification: t.verification } : {}) })))
      r.nextE = d.nextE ?? r.excerpts.length + 1
      r.nextT = d.nextT ?? r.tasks.length + 1
      r.nextL = d.nextL ?? 1
    }
    // 注入位点：最后一版注入晚于最后一次变更 → 视为同步；否则欠一版（下个 pre-step 补注）
    r.injectedRev = r.lastInjSeq > lastSnapSeq ? r.rev : (r.lastInjSeq >= 0 ? r.rev - 1 : -1)
  }
  const getRec = (session) => {
    const r = recordOf(session.id)
    if (!r.adopted) { try { adopt(session, r) } catch { r.adopted = true } }
    return r
  }
  /** Commit the durable V3 snapshot before advancing the in-memory ledger. */
  const commit = (session, r, next) => {
    session.append(TODOLIST_EVENT, { todos: todosOf(next.tasks), excerpts: next.excerpts, tasks: next.tasks, nextE: next.nextE, nextT: next.nextT, nextL: next.nextL })
    r.excerpts = next.excerpts; r.tasks = next.tasks
    r.nextE = next.nextE; r.nextT = next.nextT; r.nextL = next.nextL
    r.rev++
  }
  const clone = (r) => structuredClone({ excerpts: r.excerpts, tasks: r.tasks, nextE: r.nextE, nextT: r.nextT, nextL: r.nextL })
  const err = (text) => ({ text, isError: true })

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
    if (hits.length === 1) return { excerpt: hits[0].ex.id, start: hits[0].r.start, end: hits[0].r.end }
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
    // 查重（2026-08-29 补拍板，病例 session-395ba755）：同 title + 同框选区间 = 纯重复，硬拒指回已有任务
    const dup = next.tasks.find(t => t.title === title && t.anchor?.excerpt === a.excerpt && t.anchor.start === a.start && t.anchor.end === a.end)
    if (dup) return `Rejected: task "${title}" with the same anchor already exists as ${dup.id}.`
    next.tasks.push({ id: `T${next.nextT++}`, title, anchor: a, done: false, links: [] })
    return undefined
  }

  /** task_map（A 专属，lookup 当场执行）：整调用原子——任何错误零写入 */
  const execTaskMap = (session, args) => {
    const rec = getRec(session)
    const op = args?.op
    if (op === 'transcript') return { text: transcriptText(session) }
    if (op === 'view') return { text: renderTree(rec) }
    if (op === 'excerpt') {
      const msgs = userMessages(session)
      if (typeof args.from !== 'string' || !args.from || typeof args.to !== 'string' || !args.to) {
        return err('Rejected: op:excerpt requires from and to.')
      }
      // 直引（08-29(2) 拍板）：msg 缺省时引文在全部用户消息里唯一命中即成——镜像 resolveAnchor 的
      // 「引文全局唯一定位，撞车才要 id」哲学；跨消息歧义硬拒要 msg，transcript 只剩对坐标一个用途
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
        if (hits.length === 1) { m = hits[0].m; loc = hits[0].r }
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
      // 查重（2026-08-29 补拍板）：同 (msg,from,to) 三元组已入账 = 同一节选，整调用拒——
      // 被拒 rev 不涨，同参重发才落得回取证循环 seenEvidence 防抖网（evKey 带 ledgerRev）
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
      for (const entry of entries) {
        const e = buildTask(next, entry, ex)
        if (e) return err(e)
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
          if (hasTitle) t.title = entry.title.trim()
          if (hasAnchor) {
            const r = resolveAnchor(next.excerpts, entry.anchor)
            if (r.error) return err(r.error)
            t.anchor = { excerpt: r.excerpt, from: entry.anchor.from, to: entry.anchor.to, start: r.start, end: r.end }
          }
          // M9 编辑即连坐：动过本体（措辞或 anchor）→ 勾选归零、链接全清（测试文件本身不动）
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

  /** todo（三魂共用，actions 栏）：编辑完成态 + 任务消除（2026-08-31 拍板下放；与 task_map op:remove 同语义——原子、未知 id 整拒）；整调用原子 */
  const execTodo = (session, updates, removeIds) => {
    const rec = getRec(session)
    const ups = Array.isArray(updates) ? updates : []
    const rms = Array.isArray(removeIds) ? removeIds : []
    if (!ups.length && !rms.length) return err('Rejected: updates or remove must be a non-empty array.')
    const next = clone(rec)
    const seen = []
    for (const u of ups) {
      if (typeof u?.id !== 'string' || typeof u?.done !== 'boolean') return err('Rejected: every update needs id and done.')
      const t = next.tasks.find(x => x.id === u.id)
      if (!t) return err(`Rejected: unknown task id ${u.id}.`)
      t.done = u.done
      seen.push([t.id, u.done])
    }
    for (const id of rms) {
      if (typeof id !== 'string' || !id) return err('Rejected: remove entries must be task ids.')
      const i = next.tasks.findIndex(t => t.id === id)
      if (i < 0) return err(`Rejected: unknown task id ${id}.`)
      next.tasks.splice(i, 1)
    }
    commit(session, rec, next)
    const parts = []
    if (seen.length) parts.push(`Updated: ${seen.map(([id, d]) => `${id} → ${d ? 'done' : 'open'}`).join(', ')}.`)
    if (rms.length) parts.push(`Tasks removed: ${rms.join(', ')}.`)
    return { text: `${parts.join(' ')} Tasks: ${rec.tasks.filter(t => t.done).length}/${rec.tasks.length} done.` }
  }

  /** verify_link（C 专属，lookup 当场执行）：link/run/unlink/view */
  const execVerifyLink = async (session, args, cwd, signal) => {
    const rec = getRec(session)
    const op = args?.op
    if (op === 'view') return { text: renderVerifyView(rec) }
    if (op === 'link') {
      const next = clone(rec)
      const entries = Array.isArray(args.links) ? args.links : []
      if (!entries.length) return err('Rejected: op:link requires links.')
      const staged = []
      for (const e of entries) {
        const t = next.tasks.find(x => x.id === e?.task)
        if (!t) return err(`Rejected: unknown task id ${e?.task}.`)
        if (e.kind !== 'test' && e.kind !== 'text') return err('Rejected: kind must be "test" or "text".')
        if (e.kind === 'test' && (typeof e.path !== 'string' || !e.path.trim())) return err('Rejected: kind "test" requires path.')
        if (e.kind === 'text' && (typeof e.note !== 'string' || !e.note.trim())) return err('Rejected: kind "text" requires note.')
        // 08-29(3) 拍板：text 必填 reason（为什么阶梯上更高一级在此地跑不了）——追问步（I6）原话引回，糊弄要对着自己的理由再来一次
        if (e.kind === 'text' && (typeof e.reason !== 'string' || !e.reason.trim())) return err('Rejected: kind "text" requires reason — why no higher rung on the evidence ladder is runnable here.')
        if (typeof e.path === 'string' && e.path.trim() && !existingPath(cwd, e.path.trim())) return err(`Rejected: no such file ${e.path.trim()}.`)
        const cmd = e.kind === 'test' && typeof e.cmd === 'string' && e.cmd.trim() ? e.cmd.trim() : null
        staged.push({ task: t, kind: e.kind, path: typeof e.path === 'string' && e.path.trim() ? e.path.trim() : null, note: typeof e.note === 'string' && e.note.trim() ? e.note.trim() : null, reason: e.kind === 'text' ? e.reason.trim() : null, cmd })
      }
      const made = []
      for (const s of staged) {
        const link = { id: `L${next.nextL++}`, kind: s.kind, path: s.path, note: s.note, reason: s.reason, lastRun: null, ...(s.kind === 'test' ? { cmd: s.cmd } : {}) }
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
      const results = []
      let aborted = false
      for (const { t, l } of jobs) {
        // 08-30 P1：上游中止（用户点停止）不是测试结果——被掐断的这条和没轮到的都不改写，旧证据原样保留
        if (signal?.aborted) { aborted = true; break }
        const real = existingPath(cwd, l.path)
        const r = real ? await runTestLink(l, real, cwd, signal, runTimeoutMs) : { ok: false, timedOut: false, out: `no such file ${l.path}` }
        if (r.aborted) { aborted = true; break }
        l.lastRun = { pass: r.ok, timedOut: Boolean(r.timedOut), tail: (r.out ?? '').slice(-RUN_TAIL_CHARS) }
        results.push({ t, l, pass: r.ok, timedOut: l.lastRun.timedOut, tail: l.lastRun.tail })
      }
      if (results.length) commit(session, rec, next)
      // FAIL 是合法结果不是工具错误：C 要拿着尾巴修测试/修实现，isError 会让取证轮误判通道坏了
      // 08-29(4)：PASS 也带尾巴（跑了什么留痕，cmd:"true" 与真套件的 PASS 不再同形）；TIMEOUT 单列并明说不是失败
      const ran = results.length ? `Ran ${results.length} linked test${results.length === 1 ? '' : 's'}: ${results.map(r =>
        r.timedOut ? `${testLabel(r.l)} TIMEOUT after ${Math.round(runTimeoutMs / 1000)}s (${r.t.id} — did not finish; this is not a test failure. Narrow the command to the tests that cover this task.)`
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

  /** I1 领取：本会话出现更新的用户消息 → 发一次提醒（随 A 的请求注入，阅后即焚） */
  const takeNudge = (session) => {
    const rec = getRec(session)
    const items = userMessages(session)
    const seq = items.length ? items.at(-1).seq : -1
    if (seq <= rec.nudgedSeq) return false
    rec.nudgedSeq = seq
    return true
  }
  /** I5 领取：状态区已换代（canvas 注入出现过 = 任务已复杂到有状态可记）而清单仍空 → 提醒 A 一次。
   * 08-29(4)：随状态区每次换代再提一次（同一代只提一次，按最新画布注入 seq 记账）——DeepSWE adaptix 病例：
   * 终身一次的提醒落在 STEP 5 一份 0 票落选的 A 稿里，此后 24 步无人再提；建过单即闭嘴（nextT>1，建后清空不再提）；
   * 与 I1 的撞车让路在调用侧（同步命中只发 I1，本条留待后续步）。 */
  const takeEmptyNudge = (session) => {
    const rec = getRec(session)
    if (rec.tasks.length || rec.nextT > 1) return false
    let latest = -1
    for (const e of session.snapshotEvents()) {
      if (e.type === 'user/message' && e.data?.source?.kind === 'plugin' && e.data.source.plugin === 'trisoul-x:state') latest = Math.max(latest, e.seq ?? -1)
    }
    if (latest < 0 || latest <= rec.emptyNudgedSeq) return false
    rec.emptyNudgedSeq = latest
    return true
  }
  /** I2 换代注入（pre-step 边界调用，机制同画布状态区 P2-2）：变更后 / 状态区更新后 append 一版新清单 */
  const maintainInjection = (session) => {
    const rec = getRec(session)
    // 08-30 P14：从未注入过的空清单无事可钉；被删空的清单要再发一版「已清空」换掉画布钉着的旧版——只发一次（版本没变不重发），不跟画布换代
    if (!rec.tasks.length && (rec.lastInjSeq < 0 || rec.injectedRev === rec.rev)) return undefined
    let canvasSeq = -1
    for (const e of session.snapshotEvents()) {
      if (e.type === 'user/message' && e.data?.source?.kind === 'plugin' && e.data.source.plugin === 'trisoul-x:state' && e.seq > canvasSeq) canvasSeq = e.seq
    }
    const stale = rec.injectedRev !== rec.rev || rec.lastInjSeq < 0 || (rec.tasks.length > 0 && canvasSeq > rec.lastInjSeq)
    if (!stale) return undefined
    const msg = createUserMessage({ content: [{ type: 'text', text: renderInjection(rec) }], source: { kind: 'plugin', plugin: 'trisoul-x:tasks' } })
    const ev = session.append('user/message', msg, { surfaceOp: 'append' })
    rec.injectedRev = rec.rev
    rec.lastInjSeq = ev.seq
    return ev
  }
  const revOf = (session) => getRec(session).rev

  return { execTaskMap, execTodo, execVerifyLink, takeNudge, takeEmptyNudge, maintainInjection, revOf, snapshot: session => clone(getRec(session)) }
}

// ---------- todo 宿主工具定义（ctx.tools.register 用；描述/参数逐字 spec 3.1/3.2） ----------

export function todoToolDefinition(store) {
  return {
    name: TODO_TOOL,
    description: "The todo list's completion marker. Decide how a task will be verified before building it, and check it off the moment it is fully done — one at a time, as you go, not all of them at the end. Never check off a task while its tests are failing, the implementation is partial, or an error on it is unresolved; when several are checked together, that must hold for every one of them. Uncheck a task that turns out not to be done. Remove a task (remove:[ids]) only when it no longer belongs on the list — irrelevant, impossible, or overtaken by newer instructions — never because it is hard; say why in your draft.",
    parameters: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          description: 'Each entry is {"id": task id, "done": true or false}',
          items: { type: 'object', properties: { id: { type: 'string' }, done: { type: 'boolean' } }, required: ['id', 'done'], additionalProperties: false },
        },
        remove: { type: 'array', items: { type: 'string' }, description: 'Task ids to delete from the list entirely' },
      },
      required: [],
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      const session = exec?.agent?.session
      if (!session) throw new Error('todo requires an owning agent session')
      const r = store.execTodo(session, args?.updates, args?.remove)
      if (r.isError) throw new Error(r.text)
      return { text: r.text }
    },
    presentCall: (args) => ({ card: 'generic', title: 'Update todo list', kind: 'other', rawInput: args }),
  }
}
