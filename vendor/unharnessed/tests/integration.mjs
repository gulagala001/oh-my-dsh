// Failure-oriented integration checks: bad registration, state leakage, malformed
// output, runaway cells, stuck cancellation, stale callbacks and gate bypass.
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { readFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { gatesOf, GATE_MARKER, parseAutonomous } from './node_modules/dsh-unharnessed/lib/goals.js'

const ctx = new Context()
const checks = []
function pass(name) { checks.push(name); console.log('PASS',name) }
async function mount(pkg, config={}) { if(pkg==='dsh-agent-preset-registry') config={default:'unharnessed'}; const mod=await import('@deepseek-ai/'+pkg); const fork=ctx.plugin(mod.default??mod,config); await fork; return fork }
await ctx.plugin(Loader,{baseUrl:import.meta.url})
ctx.loader.builtins.group=(await import('@deepseek-ai/cordis-plugin-loader')).Group
for(const pkg of ['dsh-system-prompt','dsh-tools','dsh-tool-executor-native','dsh-session','dsh-session-projection','dsh-agent','dsh-llm','dsh-agent-loop','dsh-goal','dsh-commands','dsh-fs-local','dsh-working-directory','dsh-subprocess-local','dsh-sandbox-local','dsh-agent-preset-registry']) await mount(pkg)
await mount('dsh-sandbox-policy',{mode:'danger-full-access'})
await mount('dsh-token-meter')

const YAML=(await import('yaml')).default
const patch=YAML.parse(readFileSync('node_modules/dsh-unharnessed/cordis.patch.yml','utf8'))
const definition=patch[0].insert[0].config
// Keep cancellation and gate timeouts short in the disposable test composition.
definition.plugins.find(x=>x.id==='unharnessed').config.cellTimeoutMs=800
definition.plugins.find(x=>x.id==='unharnessed').config.gateTimeoutMs=500
definition.plugins.find(x=>x.id==='unharnessed').config.snapshotVariableBytes=4096
definition.plugins.find(x=>x.id==='compaction').config.find(x=>x.id==='compaction-basic').config={retainTokens:100,headroomTokens:1000,maxTokens:1000}
await ctx.agentPresets.register(definition)
console.log('roster',JSON.stringify(await ctx.agentPresets.list()))

const composition={setup:agentCtx=>ctx.agentPresets.mount(agentCtx,'unharnessed').then(()=>undefined)}
const aHandle=await ctx.agents.create({sessionId:SessionId('integration-a'),meta:{cwd:process.cwd(),agentPreset:'unharnessed'},setup:composition.setup})
const bHandle=await ctx.agents.create({sessionId:SessionId('integration-b'),meta:{cwd:process.cwd(),agentPreset:'unharnessed'},setup:composition.setup})
const a=aHandle.agent??aHandle, b=bHandle.agent??bHandle
// Direct-cell fixtures inspect pending input; real driver delivery is covered
// by notifications.mjs with a controlled model, without paid model requests.
a.steer = message => a.inbox.append('next-step', message)
b.steer = message => b.inbox.append('next-step', message)
console.log('agent',a.id,!!a.ctx,ctx.tools.schemas(a).map(x=>x.name))
assert.deepEqual(ctx.tools.schemas(a).map(x=>x.name),['ipython'])
pass('preset loads in the real DSH registry and exposes exactly ipython')

const signal=()=>new AbortController().signal
async function cell(agent,code,control=signal()) {
 const tool=ctx.tools.get('ipython',agent)
 return tool.execute({code},{agent,signal:control,callId:randomUUID(),name:'ipython',arguments:{code},deferContext(){},concludeTurn(){}})
}
try {
 const noShellDefinition=structuredClone(definition)
 noShellDefinition.id='unharnessed-no-shell'
 noShellDefinition.plugins.find(x=>x.id==='unharnessed').config.bashCommand=resolve('fixture-missing-shell')
 await ctx.agentPresets.register(noShellDefinition)
 const noShellHandle=await ctx.agents.create({sessionId:SessionId('integration-no-shell'),meta:{cwd:process.cwd(),agentPreset:noShellDefinition.id},setup:scope=>ctx.agentPresets.mount(scope,noShellDefinition.id).then(()=>undefined)})
 try {
  const noShell=noShellHandle.agent
  assert.match(await cell(noShell,'import sys\nshell_independent = 42\nshell_independent'),/42/)
  assert.match(await cell(noShell,"bash('printf must-not-run')"),/Configured bashCommand.*unavailable/)
  assert.match(await cell(noShell,'shell_independent'),/42/)
  assert.match(await cell(noShell,"import os\nos.environ.get('UNHARNESSED_BASH_SHELL') == ''"),/True/)
  const reset=await ctx.commands.execute(noShell,'/unharnessed-reset',[],signal())
  assert.equal(reset.result.kind,'success')
  assert.match(await cell(noShell,'sum(range(10))'),/45/)
  pass('missing shell preserves real Python execution, variables and reset; shell calls report actionable errors')
 } finally { await noShellHandle.dispose() }
 assert.match(await cell(a,'x = 41\ndef answer(): return x + 1\nanswer()'),/42/)
 assert.match(await cell(a,'await asyncio.sleep(0)\nanswer()'),/42/)
 assert.match(await cell(b,"'x' in globals()"),/False/)
 pass('variables, functions and top-level await persist; sessions are isolated')
 assert.match(await cell(a,"raise ValueError('expected-fixture')"),/ValueError: expected-fixture/)
 assert.match(await cell(a,'answer()'),/42/)
 pass('Python exceptions preserve the running kernel')
 assert.match(await cell(a,"print('x' * 100000)"),/output clipped/)
 assert.match(await cell(a,"print('你好 😀')\nimport os\nos.write(1, b'raw-fd-output\\n')"),/你好/)
 assert.match(await cell(a,'answer()'),/42/)
 pass('large output, UTF-8 and raw fd writes preserve protocol framing')
 assert.match(await cell(a,"job = bash('printf shell-ok')\nresult = await job\n(result.exit_code, result.output)"),/shell-ok/)
 pass('real async shell handles return output and exit status')
 await assert.rejects(cell(a,'await asyncio.sleep(30)'),/exceeded/)
 assert.match(await cell(a,'answer()'),/42/)
 const controller=new AbortController(); setTimeout(()=>controller.abort(new Error('fixture cancellation')),100)
 await assert.rejects(cell(a,'await asyncio.sleep(30)',controller.signal),/fixture cancellation/)
 assert.match(await cell(a,'answer()'),/42/)
 pass('cell deadline and DSH cancellation interrupt without losing state')
 const completions=[]
 const originalSteer=a.steer.bind(a)
 a.steer=message=>{completions.push(message); a.inbox.append('next-step',message)}
 await cell(a,"bg = bash('sleep 0.1; printf background-ok')")
 await new Promise(r=>setTimeout(r,350))
 assert.equal(completions.filter(m=>m.content[0].text.startsWith('[bash-done')).length,1)
 assert.match(await cell(a,'bg.output()'),/background-ok/)
 await new Promise(r=>setTimeout(r,20))
 assert(!a.inbox.nextStep.some(m=>m.content[0].text.startsWith('[bash-done')))
 a.steer=originalSteer
 pass('background completion wakes once and consumed output withdraws stale notices')
 assert.match(await cell(a,'await goal.get()'),/None/)
 const goal=ctx.goals.create(a,{objective:'Synthetic native goal',maxGoalRounds:5})
 assert.match(await cell(a,'await goal.get()'),/Synthetic native goal/)
 assert.match(await cell(a,'await goal.block("fixture")'),/at least three/)
 assert.match(await cell(a,'await goal.complete()'),/complete/)
 assert.equal(ctx.goals.get(a).phase,'complete')
 pass('Python bridge mutates real native goals and enforces blocking threshold')
 const g=ctx.goals.create(a,{objective:'Gate-controlled fixture'+GATE_MARKER+JSON.stringify(['exit 1']),maxGoalRounds:5})
 assert.match(await cell(a,'await goal.complete()'),/cannot bypass|owned by the host gate runner/)
 assert.equal(ctx.goals.get(a).phase,'active')
 pass('autonomous goals cannot be self-completed through Python')
 ctx.emit(scopeTarget(a,a),'agent/status',{agent:a,status:'idle'})
 await a.whenIdle()
 assert.equal(ctx.goals.get(a).phase,'active')
 assert.equal(ctx.goals.get(a).activation,'armed')
 assert(a.inbox.nextStep.some(m=>m.source.kind==='unharnessed-gates'))
 pass('a failed real gate records feedback and rearms the native goal')
 const current=ctx.goals.get(a)
 ctx.goals.edit(a,{id:current.id,revision:current.revision},{objective:'Passing gates'+GATE_MARKER+JSON.stringify(['printf verified-gate'])})
 ctx.emit(scopeTarget(a,a),'agent/status',{agent:a,status:'idle'})
 await a.whenIdle()
 assert.equal(ctx.goals.get(a).phase,'complete')
 pass('a successful real gate completes the native goal')
 const before=a.session.seq
 const prompt=await ctx.systemPrompt.assemble({scope:a})
 assert.match(JSON.stringify(prompt),/Unharnessed/)
 assert.equal(a.session.seq,before)
 assert.match(await cell(a,'answer()'),/42/)
 pass('DSH prompt assembly does not reset or replay Python cells')
 const batch=await ctx.tools.execute({agent:a,signal:signal(),calls:[{type:'tool-call',id:randomUUID(),name:'ipython',arguments:JSON.stringify({code:'answer()'})}]})
 assert.equal(batch.results[0].result.isError,false)
 assert.match(batch.results[0].result.content[0].text,/42/)
 pass('ipython executes through the real DSH native tool pipeline')
 ctx.tools.register(defineTool({name:'fixture-global',description:'Synthetic fixture',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(){return 'fixture'}}))
 await ctx.agentPresets.register({id:'fixture',plugins:[]})
 const blankHandle=await ctx.agents.create({sessionId:SessionId('integration-blank'),meta:{cwd:process.cwd()},setup:agentCtx=>ctx.agentPresets.mount(agentCtx,'fixture').then(()=>undefined)})
 const blank=blankHandle.agent
 assert(ctx.tools.schemas(blank).some(t=>t.name==='fixture-global'))
 await ctx.agentPresets.select(blank,'unharnessed')
 assert.deepEqual(ctx.tools.schemas(blank).map(t=>t.name),['ipython'])
 await ctx.agentPresets.select(blank,'fixture')
 assert(ctx.tools.schemas(blank).some(t=>t.name==='fixture-global'))
 pass('switching a reused blank Session applies and removes the tool restriction')

 class FixtureAdapter extends LlmAdapter {
   async resolveModel(provider,model) { return {provider,id:model,name:model,contextWindow:1000000,maxTokens:4096} }
   async *stream(options) {
     const last=JSON.stringify(options.messages.at(-1))
     const history=JSON.stringify(options.messages)
     if(history.includes('fixture-autonomous-write')&&!history.includes('fixture_python_ran')) {
       const block={type:'tool-call',id:randomUUID(),name:'ipython',arguments:JSON.stringify({code:"from pathlib import Path\nfixture_python_ran = True\nPath('fixture-gate-result.txt').write_text('verified')"})}
       yield {type:'block-start',index:0,blockType:'tool-call'}
       yield {type:'tool-call-delta',index:0,id:block.id,name:block.name,argumentsDelta:block.arguments}
       yield {type:'block-end',index:0,block}
       yield {type:'finish',reason:{kind:'tool-calls'}}
       return
     }
     const text=last.includes('compaction engine')?'Fixture checkpoint: continue the synthetic task.':'Fixture acknowledgement.'
     yield {type:'block-start',index:0,blockType:'text'}
     yield {type:'text-delta',index:0,text}
     yield {type:'block-end',index:0,block:{type:'text',text}}
     yield {type:'usage',usage:{inputTokens:20,outputTokens:10}}
     yield {type:'finish',reason:{kind:'stop'}}
   }
 }
 ctx.llm.registerAdapter(['fixture'],new FixtureAdapter())
 const cHandle=await ctx.agents.create({sessionId:SessionId('integration-compact'),meta:{cwd:process.cwd(),agentPreset:'unharnessed'},setup:composition.setup,agentOptions:{provider:'fixture',model:'fixture'}})
 const c=cHandle.agent
 await cell(c,'checkpoint = 12345')
 await cell(c,"oversized_checkpoint_value = 'x' * 5000")
 for(let i=0;i<3;i++) { c.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Synthetic compaction fixture '+i+' '+('padding '.repeat(2000))}]})); await c.whenIdle() }
 const generation=c.session.surface.replaceGeneration
 const compact=await ctx.commands.execute(c,'/compact',[],signal())
 assert.equal(compact.result.kind,'success',JSON.stringify(compact))
 assert(c.session.surface.replaceGeneration>generation)
 assert.match(await cell(c,'checkpoint'),/12345/)
 assert.match(await cell(c,"'oversized_checkpoint_value' in globals()"),/False/)
 pass('actual DSH context compaction preserves the live Python namespace')
 const reset=await ctx.commands.execute(c,'/unharnessed-reset',[],signal())
 assert.equal(reset.result.kind,'success')
 assert.match(await cell(c,"'checkpoint' in globals()"),/False/)
 pass('native reset command creates a fresh Python namespace')
 const {setSandboxMode}=await import('@deepseek-ai/dsh-sandbox-policy')
 setSandboxMode(c.session,'read-only')
 const denied=await cell(c,"'checkpoint' in globals()")
 assert.match(denied,/Fresh Python kernel|started fresh/i)
 assert.match(await cell(c,"from pathlib import Path\nPath('read-only-must-not-exist.txt').write_text('denied')"),/PermissionError|Operation not permitted|Read-only/)
 assert(!existsSync('read-only-must-not-exist.txt'))
 pass('policy changes reset Python and the real DSH sandbox denies writes')
 await cHandle.dispose()
 await blankHandle.dispose()
 await mount('dsh-goal-round-driver')
 const dHandle=await ctx.agents.create({sessionId:SessionId('integration-full-loop'),meta:{cwd:process.cwd(),agentPreset:'unharnessed'},setup:composition.setup,agentOptions:{provider:'fixture',model:'fixture'}})
 const d=dHandle.agent
 async function until(predicate,timeout=5000) {const end=Date.now()+timeout;while(!predicate()){if(Date.now()>end)throw new Error('Integration condition timed out');await new Promise(r=>setTimeout(r,10))}}
 const automatic=await ctx.commands.execute(d,'/unharnessed-autonomous '+JSON.stringify({objective:'fixture-autonomous-write',gates:["test \"$(cat fixture-gate-result.txt)\" = verified"],maxRounds:4}),[],signal())
 assert.equal(automatic.result.kind,'success')
 await until(()=>ctx.goals.get(d)?.phase==='complete')
 await d.whenIdle()
 assert.equal(readFileSync('fixture-gate-result.txt','utf8'),'verified')
 assert(d.session.snapshotEvents(0).some(e=>e.type==='tool/result'))
 pass('native command, goal continuation, model tool call and host gates complete end to end')
 unlinkSync('fixture-gate-result.txt')
 await ctx.commands.execute(d,'/unharnessed-autonomous '+JSON.stringify({objective:'fixture-round-limit',gates:['exit 1'],maxRounds:2}),[],signal())
 await until(()=>ctx.goals.get(d)?.phase==='blocked')
 assert.equal(ctx.goals.get(d).roundsStarted,2)
 pass('failing autonomous work stops at the native round limit')
 await dHandle.dispose()
 await assert.rejects(cell(b,'import os\nos._exit(9)'),/kernel exited/)
 assert.match(await cell(b,"'x' in globals()"),/python-state-restored[\s\S]*False/)
 pass('an unexpected kernel exit is reported and the next cell recovers cleanly')
 await mount('dsh-attachment-local', {dshHome:process.env.DSH_HOME})
 const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGNQaDjwH4QZYAwAT7QJfdl8EOkAAAAASUVORK5CYII='
 writeFileSync('fixture-image.png',Buffer.from(png,'base64'))
 writeFileSync('fixture-file.txt','durable fixture content')
 assert.match(await cell(b,"await attach_image('fixture-image.png')"),/attachmentId/)
 assert.match(await cell(b,"await attach_file('fixture-file.txt')"),/attachmentId/)
 assert.match(await cell(b,"await display({'text/html':'<h1>fixture</h1>'}, name='fixture')"),/ok/)
 assert.match(await cell(b,`from rlm import emit\nemit({'image/png': '${png}'})`),/ok/)
 const media=b.inbox.nextStep.flatMap(m=>m.content).filter(x=>x.type==='image'||x.type==='file')
 assert(media.some(x=>x.type==='image'))
 assert(media.some(x=>x.type==='file'&&x.attachment.name==='fixture-file.txt'))
 const file=media.find(x=>x.type==='file'&&x.attachment.name==='fixture-file.txt')
 assert.equal(readFileSync(ctx.attachments.fileHostPath(file.attachment),'utf8'),'durable fixture content')
 assert(b.session.snapshotEvents(0).some(e=>JSON.stringify(e).includes(file.attachment.attachmentId)))
 pass('images, generic files and MIME display use durable DSH attachment references and session events')
 const assertOrigin = message => {
   assert.equal(message.content[0].type, 'text')
   assert.match(message.content[0].text, /unharnessed tool output/)
   assert.match(message.content[0].text, /not a new user message, a repeated request, or new authorization/)
   assert(message.content.slice(1).some(x => x.type === 'image' || x.type === 'file'))
 }
 const ownMedia = () => b.inbox.nextStep.filter(m => m.source.kind === 'unharnessed-attachment')
 assert.equal(ownMedia().length, 4)
 ownMedia().forEach(assertOrigin)
 // Detached display has no current cell; it must still be identifiable as tool output.
 await cell(b, `async def later_media():
    await asyncio.sleep(0.05)
    await attach_image('fixture-image.png')
    emit({'image/png': '${png}'})
media_task = asyncio.create_task(later_media())`)
 await until(() => ownMedia().length === 6)
 ownMedia().forEach(assertOrigin)
 const previousMedia = ownMedia().length
 const cancelledMedia = new AbortController(); cancelledMedia.abort(new Error('cancel media fixture'))
 await assert.rejects(cell(b, "await attach_image('fixture-image.png')", cancelledMedia.signal), /cancel media fixture/)
 assert.equal(ownMedia().length, previousMedia)
 pass('all four media entry points and detached output retain model-visible tool provenance; cancelled calls inject nothing')
 // Exercise MCP main output and plugin-deferred media through the native pipeline.
 const image = media.find(x => x.type === 'image')
 ctx.tools.register(defineTool({name:'mcp__fixture__media',description:'Synthetic mixed media',parameters:{},
   output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v},image,file]},
   async execute(_args,exec) {
     exec.deferContext(createUserMessage({source:{kind:'fixture-context'},content:[image,file]}))
     return 'media fixture'
   }}))
 const mixedBatch = await ctx.tools.execute({agent:b,signal:signal(),calls:[{type:'tool-call',id:randomUUID(),name:'ipython',arguments:JSON.stringify({code:"await mcp.call_tool('fixture', 'media')"})}]})
 assert.equal(mixedBatch.results[0].result.isError, false)
 assertOrigin(ownMedia().at(-1))
 assert.match(ownMedia().at(-1).content[0].text, /mcp__fixture__media/)
 assert.equal(mixedBatch.additionalContexts.length, 1)
 assertOrigin(mixedBatch.additionalContexts[0])
 assert.equal(mixedBatch.additionalContexts[0].source.kind, 'fixture-context')
 assert.deepEqual(mixedBatch.additionalContexts[0].content.slice(1), [image,file])
 pass('MCP image/file results and deferred media preserve references and provenance without altering source identity')

 assert.match(await cell(b,"await display({'image/png': 'not base64'})"),/RuntimeError|Error/)
 assert.match(await cell(b,"await attach_image('fixture-file.txt')"),/RuntimeError|Error/)
 pass('invalid images and malformed media payloads fail without fake attachments')
 await mount('dsh-mcp-client',{serverName:'fixture',transport:'stdio',command:process.execPath,args:[resolve('node_modules/dsh-unharnessed/tests/fixtures/mcp-server.mjs')],failOnStartupError:true})
 assert.deepEqual(ctx.tools.schemas(b).map(x=>x.name),['ipython'])
 assert.match(await cell(b,"await mcp.search_tools('Add')"),/mcp__fixture__add/)
 assert.match(await cell(b,"await mcp.call_tool('fixture', 'add', {'a': 40, 'b': 2})"),/42/)
 const rawName='long.name/with punctuation'.repeat(4)
 assert.match(await cell(b,`await mcp.call_tool('fixture', ${JSON.stringify(rawName)}, {})`),/long.name/)
 assert.match(await cell(b,"await mcp.call_tool('fixture', 'failure')"),/RuntimeError.*failure/s)
 assert.match(await cell(b,"await mcp.call_tool('fixture', 'add', {'a': 'bad', 'b': 2})"),/RuntimeError|Error/)
 pass('real MCP stdio discovery, hashed names, structured arguments and failures stay behind ipython')
 const guard=b.ctx.tools.guard(exec=>exec.name==='mcp__fixture__add'?{reason:'fixture policy denied',info:{code:'FIXTURE_DENIED'}}:undefined)
 assert.match(await cell(b,"await mcp.call_tool('fixture', 'add', {'a': 40, 'b': 2})"),/fixture policy denied/)
 guard()
 const restrict=b.ctx.tools.restrict({deny:['mcp__fixture__add']})
 assert.match(await cell(b,"await mcp.call_tool('fixture', 'add', {'a': 40, 'b': 2})"),/not available/)
 restrict()
 assert.deepEqual(ctx.tools.schemas(b).map(x=>x.name),['ipython'])
 const cancel=new AbortController();setTimeout(()=>cancel.abort(new Error('cancel MCP fixture')),100)
 await assert.rejects(cell(b,"await mcp.call_tool('fixture', 'wait')",cancel.signal),/cancel MCP fixture/)
 assert.match(await cell(b,'40+2'),/42/)
 pass('MCP honors native guards, other scoped restrictions and cancellation without exposing extra tools')
 const closingHandle=await ctx.agents.create({sessionId:SessionId('integration-close-mcp'),meta:{cwd:process.cwd()},setup:composition.setup})
 await cell(closingHandle.agent,'1')
 const closingCall=cell(closingHandle.agent,"await mcp.call_tool('fixture', 'wait')").then(()=>{throw new Error('MCP should have been cancelled')},error=>error)
 await new Promise(resolve=>setTimeout(resolve,100))
 await closingHandle.dispose()
 assert.match(String(await closingCall),/disposed|aborted/i)
 pass('disposing an Agent cancels an in-flight MCP call before final checkpoint cleanup')
 for(const mode of ['write','read','fork']) {
   const result=spawnSync(process.execPath,[resolve('node_modules/dsh-unharnessed/tests/restart.mjs'),mode],{cwd:process.cwd(),env:process.env,encoding:'utf8',timeout:30000})
   assert.equal(result.status,0,result.stdout+'\n'+result.stderr)
 }
 pass('read-only kernels checkpoint and restore variables, lambdas and live-global functions across real Node process restarts; forks start fresh')
 const checkpointRoot=join(process.env.DSH_UNHARNESSED_STATE_DIR,createHash('sha256').update('restart-fixture').digest('hex'))
 const manifest=JSON.parse(readFileSync(join(checkpointRoot,'latest.json'),'utf8'))
 const bytes=readFileSync(join(checkpointRoot,manifest.file));bytes[bytes.length-1]^=1;writeFileSync(join(checkpointRoot,manifest.file),bytes)
 const corrupt=spawnSync(process.execPath,[resolve('node_modules/dsh-unharnessed/tests/restart.mjs'),'corrupt'],{cwd:process.cwd(),env:process.env,encoding:'utf8',timeout:30000})
 assert.equal(corrupt.status,0,corrupt.stdout+'\n'+corrupt.stderr)
 writeFileSync(join(checkpointRoot,'latest.json'),'null')
 const metadata=spawnSync(process.execPath,[resolve('node_modules/dsh-unharnessed/tests/restart.mjs'),'metadata'],{cwd:process.cwd(),env:process.env,encoding:'utf8',timeout:30000})
 assert.equal(metadata.status,0,metadata.stdout+'\n'+metadata.stderr)
 pass('corrupt checkpoint bytes and invalid metadata are rejected before deserialization')
 await aHandle.dispose()
 assert.match(await cell(b,"'x' in globals()"),/False/)
 pass('disposing one Agent leaves another Agent usable')
} finally { await ctx.fiber.dispose() }
console.log(JSON.stringify({passed:checks.length,checks},null,2))
