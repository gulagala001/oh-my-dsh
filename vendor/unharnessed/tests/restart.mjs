import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { SessionId } from '@deepseek-ai/dsh-session'
import { readFileSync } from 'node:fs'
import YAML from 'yaml'

const ctx = new Context(), mode = process.argv[2]
await ctx.plugin(Loader, { baseUrl: import.meta.url })
ctx.loader.builtins.group = (await import('@deepseek-ai/cordis-plugin-loader')).Group
for (const name of ['dsh-system-prompt','dsh-tools','dsh-tool-executor-native','dsh-session','dsh-session-projection','dsh-agent','dsh-llm','dsh-agent-loop','dsh-goal','dsh-commands','dsh-fs-local','dsh-working-directory','dsh-subprocess-local','dsh-sandbox-local','dsh-sandbox-policy','dsh-token-meter','dsh-agent-preset-registry']) {
  const mod = await import('@deepseek-ai/' + name)
  await ctx.plugin(mod.default || mod, name === 'dsh-agent-preset-registry' ? { default: 'unharnessed' } : name === 'dsh-sandbox-policy' ? { mode: 'read-only' } : {})
}
const definition = YAML.parse(readFileSync('node_modules/dsh-unharnessed/cordis.patch.yml', 'utf8'))[0].insert[0].config
await ctx.agentPresets.register(definition)
const handle = await ctx.agents.create({ sessionId: SessionId(mode === 'fork' ? 'restart-child' : 'restart-fixture'), meta: { cwd: process.cwd() }, setup: c => ctx.agentPresets.mount(c, 'unharnessed').then(() => undefined) })
const agent = handle.agent
async function cell(code) { return ctx.tools.get('ipython', agent).execute({ code }, { agent, signal: new AbortController().signal }) }
try {
  if (mode === 'write') {
    assert.match(await cell('persisted = 41\nhelper = lambda x: x + persisted\ndef answer(): return helper(1)\nanswer()'), /42/)
    assert.match(await cell('task = asyncio.create_task(asyncio.sleep(100))\nanswer()'), /42/)
  } else if (mode === 'read') {
    const result = await cell('answer()')
    assert.match(result, /python-state-restored/)
    assert.match(result, /42/)
    assert.match(await cell('persisted = 50\nanswer()'), /51/)
    assert.match(await cell("'task' in globals()"), /False/)
  } else if (mode === 'fork') assert.match(await cell("'persisted' in globals()"), /False/)
  else if (mode === 'corrupt') {
    const result = await cell("'persisted' in globals()")
    assert.match(result, /checksum mismatch/)
    assert.match(result, /False/)
  } else if (mode === 'metadata') {
    const result = await cell("'persisted' in globals()")
    assert.match(result, /metadata is damaged/)
    assert.match(result, /False/)
  }
} finally { await handle.dispose(); await ctx.fiber.dispose() }
console.log('PASS restart fixture', mode)
