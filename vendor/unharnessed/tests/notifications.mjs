import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import Loader, { Group } from '@deepseek-ai/cordis-plugin-loader'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import YAML from 'yaml'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { clearObsoleteNotifications } from './node_modules/dsh-unharnessed/lib/notifications.js'

const ctx = new Context(), checks = []
const pass = name => { checks.push(name); console.log('PASS', name) }
await ctx.plugin(Loader, { baseUrl: import.meta.url })
ctx.loader.builtins.group = Group
for (const name of ['system-prompt','tools','tool-executor-native','session','session-projection','agent','llm','agent-loop','goal','commands','fs-local','working-directory','subprocess-local','sandbox-local','token-meter']) {
  const mod = await import('@deepseek-ai/dsh-' + name); await ctx.plugin(mod.default ?? mod)
}
await ctx.plugin((await import('@deepseek-ai/dsh-sandbox-policy')).default, { mode: 'danger-full-access' })
await ctx.plugin((await import('@deepseek-ai/dsh-agent-preset-registry')).default, { default: 'unharnessed' })
const definition = YAML.parse(readFileSync('node_modules/dsh-unharnessed/cordis.patch.yml', 'utf8'))[0].insert[0].config
definition.plugins.find(row => row.id === 'unharnessed').config.snapshots = false
await ctx.agentPresets.register(definition)

async function makeAgent(respond) {
  const id = 'notice-' + randomUUID()
  class Adapter extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model, contextWindow: 100000, maxTokens: 1000 } }
    async *stream(options) {
      const code = await respond(options)
      const block = code === undefined ? { type: 'text', text: 'fixture complete' }
        : { type: 'tool-call', id: randomUUID(), name: 'ipython', arguments: JSON.stringify({ code }) }
      yield { type: 'block-start', index: 0, blockType: block.type }
      if (code === undefined) yield { type: 'text-delta', index: 0, text: block.text }
      else yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: { kind: code === undefined ? 'stop' : 'tool-calls' } }
    }
  }
  ctx.llm.registerAdapter([id], new Adapter())
  return ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: process.cwd(), agentPreset: 'unharnessed' },
    setup: scope => ctx.agentPresets.mount(scope, 'unharnessed').then(() => undefined), agentOptions: { provider: id, model: id } })
}
const start = agent => agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Run the notification fixture.' }] }))
async function cell(agent, code) {
  return ctx.tools.get('ipython', agent).execute({ code }, { agent, signal: new AbortController().signal,
    callId: randomUUID(), name: 'ipython', arguments: { code }, deferContext() {}, concludeTurn() {} })
}
const queued = agent => [...agent.inbox.nextStep, ...agent.inbox.nextTurn]
const bashNotice = message => message.content?.some(item => item.text?.startsWith('[bash-done'))
async function until(predicate) {
  const end = Date.now() + 5000
  while (!predicate()) { if (Date.now() > end) throw Error('Notification fixture timed out'); await new Promise(resolve => setTimeout(resolve, 10)) }
}

try {
  const requests = []
  const handle = await makeAgent(options => {
    requests.push(JSON.stringify(options.messages))
    if (requests.length === 1) return "background = bash('sleep 0.05; printf notification-ready')"
    if (requests.length === 2) return 'await asyncio.sleep(0.2)'
  })
  try {
    start(handle.agent); await handle.agent.whenIdle()
    assert.match(requests[2], /\[bash-done/, 'completion must reach the next request before the active turn finishes')
    assert.equal(handle.agent.session.snapshotEvents(0).filter(event => event.type === 'turn/start').length, 1)
    assert(!queued(handle.agent).some(bashNotice))
    pass('background completion reaches the next step in the same real DSH turn')
  } finally { await handle.dispose() }

  const consumedRequests = []
  const consumed = await makeAgent(options => {
    consumedRequests.push(JSON.stringify(options.messages))
    if (consumedRequests.length === 1) return "read_later = bash('sleep 0.1; printf consumed-output')"
    if (consumedRequests.length === 2) return 'await asyncio.sleep(0.25)\nprint(read_later.output())'
  })
  try {
    start(consumed.agent); await consumed.agent.whenIdle()
    assert(!consumedRequests[2].includes('[bash-done'))
    assert(consumedRequests[2].includes('consumed-output'))
    assert.equal(consumedRequests.length, 3)
    assert(!queued(consumed.agent).some(bashNotice))
    pass('reading a completed handle inside the active cell withdraws its notice before the next request')
  } finally { await consumed.dispose() }

  const idleRequests = []
  const idle = await makeAgent(options => { idleRequests.push(JSON.stringify(options.messages)) })
  try {
    await cell(idle.agent, "idle_background = bash('sleep 0.05; printf idle-ready')")
    await until(() => idleRequests.length === 1); await idle.agent.whenIdle()
    assert.match(idleRequests[0], /\[bash-done/)
    assert.equal(idle.agent.session.snapshotEvents(0).filter(event => event.type === 'turn/start').length, 1)
    pass('an idle completion wakes exactly one real DSH turn')
  } finally { await idle.dispose() }

  let stopRequests = 0, entered = false, release
  const held = new Promise(resolve => { release = resolve })
  const stopped = await makeAgent(async () => {
    stopRequests++
    if (stopRequests === 1) return "cancel_background = bash('sleep 0.15; printf cancel-ready')"
    if (stopRequests === 2) { entered = true; await held }
  })
  try {
    start(stopped.agent); await until(() => entered)
    stopped.agent.cancel({ kind: 'user' }); release(); await stopped.agent.whenIdle()
    await new Promise(resolve => setTimeout(resolve, 250))
    assert.equal(stopRequests, 2)
    assert(!queued(stopped.agent).some(bashNotice))
    start(stopped.agent); await stopped.agent.whenIdle(); assert.equal(stopRequests, 3)
    pass('a completion after native Stop neither queues stale input nor restarts the cancelled turn')
  } finally { release(); await stopped.dispose() }

  const identities = await makeAgent(() => undefined)
  identities.agent.steer = message => identities.agent.inbox.append('next-step', message)
  try {
    const send = async data => {
      const result = await cell(identities.agent, `from rlm.repl import host_request\nawait host_request(${JSON.stringify(data)})`)
      assert(!result.includes('Traceback'), result)
      return result
    }
    await send({ type: 'bash.completed', pid: 123, activityId: 'old-process', command: 'synthetic-command', exitCode: 0 })
    await send({ type: 'bash.completed', pid: 123, activityId: 'new-process', command: 'synthetic-command', exitCode: 0 })
    await send({ type: 'bash.consumed', pid: 123, activityId: 'old-process' })
    assert.equal(queued(identities.agent).filter(bashNotice).length, 1)
    await send({ type: 'bash.completed', pid: 123, activityId: 'new-process', command: 'synthetic-command', exitCode: 0 })
    assert.equal(queued(identities.agent).filter(bashNotice).length, 1)
    const human = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '[bash-done human text must stay]' }] })
    identities.agent.inbox.append('next-turn', human)
    const removed = [], originalRemove = identities.agent.inbox.remove.bind(identities.agent.inbox)
    identities.agent.inbox.remove = id => { removed.push(id); return originalRemove(id) }
    const reset = await ctx.commands.execute(identities.agent, '/unharnessed-reset', [], new AbortController().signal)
    assert.equal(reset.result.kind, 'success'); assert.deepEqual(queued(identities.agent), [human])
    await send({ type: 'bash.completed', pid: 123, activityId: 'after-reset', command: 'synthetic-command', exitCode: 0 })
    await identities.dispose()
    assert(!queued(identities.agent).some(bashNotice))
    assert(!removed.includes(human.id), 'notification cleanup must not remove human input; native disposal owns its inbox clear')
    pass('process UUIDs prevent PID reuse withdrawals; reset and disposal remove only owned pending notices')
  } finally { await identities.dispose() }

  const restored = await makeAgent(() => undefined)
  try {
    const old = createUserMessage({ source: { kind: 'unharnessed-notice' }, content: [{ type: 'text', text: '[bash-done pid:123 exit:0] old process' }] })
    const user = createUserMessage({ source: { kind: 'user' }, content: old.content })
    const goal = createUserMessage({ source: { kind: 'unharnessed-gates' }, content: [{ type: 'text', text: '[autonomous gates passed] preserved' }] })
    restored.agent.inbox.append('next-turn', old); restored.agent.inbox.append('next-step', user); restored.agent.inbox.append('next-step', goal)
    const editable = createUserMessage({ source: old.source, content: old.content })
    restored.agent.inbox.append('next-step', editable)
    const edited = { ...editable, content: [{ type: 'text', text: '[bash-done pid:123 exit:0] human edited this queued item' }] }
    restored.agent.inbox.replace(editable.id, edited)
    clearObsoleteNotifications(restored.agent)
    assert.deepEqual(queued(restored.agent), [user, goal, edited])
    pass('cold-load cleanup removes obsolete process notices while preserving human input, edited items and goal outcomes')
  } finally { await restored.dispose() }

  const crashRequests = []
  const crashed = await makeAgent(async options => {
    crashRequests.push(JSON.stringify(options.messages))
    if (crashRequests.length === 1) return 'import os\nasync def crash_later():\n    await asyncio.sleep(0.05)\n    os._exit(9)\ncrasher = asyncio.create_task(crash_later())'
    if (crashRequests.length === 2) await new Promise(resolve => setTimeout(resolve, 180))
  })
  try {
    start(crashed.agent); await crashed.agent.whenIdle()
    assert.match(crashRequests[2], /Python kernel stopped/)
    assert.equal(crashed.agent.session.snapshotEvents(0).filter(event => event.type === 'turn/start').length, 1)
    assert.match(await cell(crashed.agent, '6 * 7'), /42/)
    assert(!queued(crashed.agent).some(message => JSON.stringify(message).includes('Python kernel stopped')))
    pass('an idle kernel crash reaches the active turn, and recovery leaves no stale crash notice')
  } finally { await crashed.dispose() }

  await ctx.plugin((await import('@deepseek-ai/dsh-attachment-local')).default, { dshHome: process.env.DSH_HOME })
  const mediaRequests = []
  const media = await makeAgent(options => { mediaRequests.push(JSON.stringify(options.messages)) })
  try {
    await cell(media.agent, "async def media_later():\n    await asyncio.sleep(0.05)\n    await display({'text/html': '<p>background media fixture</p>'})\nmedia_task = asyncio.create_task(media_later())")
    await until(() => mediaRequests.length === 1); await media.agent.whenIdle()
    assert.match(mediaRequests[0], /unharnessed tool output/)
    assert(mediaRequests[0].includes('output.html') && mediaRequests[0].includes('unharnessed-attachment'))
    pass('detached media wakes idle delivery and preserves tool provenance')
  } finally { await media.dispose() }

  ctx.tools.register(defineTool({ name: 'mcp__notice__deferred', description: 'Synthetic deferred context', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      exec.deferContext(createUserMessage({ source: { kind: 'fixture-context' }, content: [{ type: 'text', text: 'detached MCP context fixture' }] }))
      return 'fixture result'
    } }))
  const deferredRequests = []
  const deferred = await makeAgent(options => { deferredRequests.push(JSON.stringify(options.messages)) })
  try {
    await cell(deferred.agent, "async def mcp_later():\n    await asyncio.sleep(0.05)\n    await mcp.call_tool('notice', 'deferred')\nmcp_task = asyncio.create_task(mcp_later())")
    await until(() => deferredRequests.length === 1); await deferred.agent.whenIdle()
    assert.match(deferredRequests[0], /detached MCP context fixture/)
    pass('detached MCP deferred context is delivered rather than dropped without an active tool call')
  } finally { await deferred.dispose() }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2))
} finally { await ctx.fiber.dispose() }
