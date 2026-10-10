import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { HarnessError, createUserMessage } from '@deepseek-ai/dsh-llm';
import { installToolCancellationPresentation } from '../src/tool-cancellation.mjs';

function fixture(t, execute) {
  const ctx = new Context();
  ctx.provide('systemPrompt', { tools() {} });
  new ToolRuntime(ctx, {});
  installToolCancellationPresentation(ctx);
  ctx.tools.register({ name: 'foreign', description: 'Independent plugin', parameters: {type:'object',properties:{}},
    output: {schema:{type:'string'},render: (_args,value) => [{type:'text',text:value}]}, execute });
  t.after(() => ctx.fiber.dispose());
  const controller = new AbortController();
  return { ctx, controller, invoke: () => ctx.tools.execute({name:'foreign',arguments:{},callId:'cancel-contract',signal:controller.signal}) };
}
const contextMessage = text => createUserMessage({content:[{type:'text',text}],source:{kind:'user'}});

test('cancellation preserves a foreign structured failure and healthy canonical values', async t => {
  const healthy = fixture(t, async () => 'foreign result');
  const success = await healthy.invoke();
  assert.equal(success.isError,false); assert.equal(success.value,'foreign result');
  assert.deepEqual(success.content,[{type:'text',text:'foreign result'}]);
  assert(Object.isFrozen(success));
  let failing;
  failing = fixture(t, async () => {failing.controller.abort({kind:'user'}); throw new HarnessError('foreign disk failure','EIO');});
  const result = await failing.invoke();
  assert.equal(result.error.info.code,'EIO'); assert.equal(result.error.message,'foreign disk failure');
});

test('cancellation cannot replace post-policy exceptions or blocking decisions', async t => {
  for (const kind of ['throw','block']) {
    const f = fixture(t, async () => 'body result');
    f.ctx.on('tools/post-execute', () => {
      f.controller.abort({kind:'user'});
      if (kind === 'throw') throw new HarnessError('foreign policy failure','POLICY_FAILURE');
      return {kind:'block',feedback:[{type:'text',text:'foreign policy block'}]};
    }, {global:true});
    const result = await f.invoke();
    assert.equal(result.isError,true);
    assert.equal(result.error.message, kind === 'throw' ? 'foreign policy failure' : 'foreign policy block');
    if (kind === 'throw') assert.equal(result.error.info.code,'POLICY_FAILURE');
  }
});

test('late cancellation retains body and accepted policy contexts through native finalization', async t => {
  const body = contextMessage('body context'), post = contextMessage('policy context');
  const f = fixture(t, async (_args,exec) => {exec.deferContext(body); return 'body result';});
  f.ctx.on('tools/post-execute', () => {
    f.controller.abort({kind:'user'});
    return {kind:'accept',additionalContexts:[post]};
  }, {global:true});
  const result = await f.invoke();
  assert.equal(result.error.info.code,'ABORTED');
  assert.deepEqual(result.additionalContexts,[body,post]);
});

test('a short-circuit wrapper cancelled in post-policy keeps the native before-dispatch identity', async t => {
  let bodies = 0;
  const post = contextMessage('short-circuit policy context');
  const f = fixture(t, async () => {bodies++; return 'not called';});
  f.ctx.on('tools/execute', () => ({isError:false,value:'wrapper result',content:[]}), {global:true});
  f.ctx.on('tools/post-execute', () => {
    f.controller.abort({kind:'user'});
    return {kind:'accept',additionalContexts:[post]};
  }, {global:true});
  const result = await f.invoke();
  assert.equal(bodies,0);
  assert.equal(result.error.info.code,'ABORTED_BEFORE_DISPATCH');
  assert.deepEqual(result.additionalContexts,[post]);
});

test('a native cancelled body retains the readable cause without changing cancellation metadata', async t => {
  let f;
  f = fixture(t, async () => {f.controller.abort({kind:'user'}); return 'completed during cancellation';});
  const result = await f.invoke();
  assert.deepEqual(result.error.info,{name:'AbortError',code:'ABORTED'});
  assert.match(result.error.message,/cancelled by user/);
});
