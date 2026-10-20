import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime, LlmAdapter, createUserMessage, markAgentLoopRequest, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { createBtwCompatibility } from '../src/btw-compat.mjs';
import { cacheUsageText } from '../src/btw-policy.mjs';

const collect = async stream => { for await (const _ of stream) {} };

test('/btw keeps child lifecycle and uses the parent Codex cache key at the real adapter dispatch', async t => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  await ctx.plugin(LlmRuntime);
  const sent = [], seen = [], guarded = [];
  class Adapter extends LlmAdapter {
    async *stream(options) { sent.push(options); yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 4096 } }; yield { type: 'finish', reason: { kind: 'stop' } }; }
  }
  ctx.llm.registerAdapter(['codex', 'other'], new Adapter());
  const parent = { id: 'parent', header: {}, snapshotEvents: () => [] };
  const sessions = new Map([[parent.id, parent]]);
  ctx.reflect.provide('sessions', { get: id => sessions.get(id) });
  ctx.reflect.provide('tools', { guard(fn) { guarded.push(fn); return () => guarded.splice(guarded.indexOf(fn), 1); } });
  let command, child, activation, direct = false;
  ctx.reflect.provide('commands', { register(value) { command = value; return () => {}; } });
  ctx.reflect.provide('subagents', {
    getProvider: () => ({ inheritsParentContext: true }),
    async startActivation(spec) {
      activation = spec;
      child = { id: 'child', inheritedEventCount: 0, header: { origin: 'subagent', parentSession: parent.id }, snapshotEvents: () => [] };
      sessions.set(child.id, child);
      ctx.emit('agent/created', { agent: { session: child } });
      const result = (async () => {
        const options = Object.freeze({ ...reference, sessionId: child.id,
          messages: Object.freeze([createUserMessage({ source: { kind: 'user' }, content: spec.request.prompt })]) });
        if (direct) await collect(ctx.llm.stream(markAgentLoopRequest(options)));
        else {
          const prepared = await ctx.llm.prepareCall({ provider: reference.provider, model: reference.model });
          await collect(prepared.stream(markAgentLoopRequest(options)));
        }
        ctx.emit('session/event', child, { type: 'assistant/message', data: { usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 4096 } } });
        return { stopReason: 'completed', output: [{ type: 'text', text: '回答' }] };
      })();
      return { childId: child.id, result, dispose: async () => {} };
    },
  });
  let compatibility;
  const owner = ctx.plugin({ inject: ['llm', 'sessions', 'tools', 'commands', 'subagents'], apply(scope) { compatibility = createBtwCompatibility(scope); } });
  await owner;
  const { apply } = await import('../vendor/dsh-btw/lib/index.js');
  apply(compatibility.facade, { provider: 'fork' });
  ctx.on('llm/stream', (options, next) => { seen.push(options.sessionId); assert.equal(isAgentLoopRequest(options), true); return next(); }, { global: true });
  let reference = Object.freeze({ provider: 'codex', model: 'fixture', sessionId: parent.id,
    messages: Object.freeze([createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '主问题' }] })]) });
  await collect(ctx.llm.stream(markAgentLoopRequest(reference)));
  const invoke = () => command.handler({ rawInput: '侧问', agent: { session: parent }, signal: new AbortController().signal });
  const result = await invoke();
  assert.equal(result.kind, 'success');
  assert.match(result.text, /缓存读取：4096 tokens/);
  assert.equal(activation.provider, 'fork');
  assert.equal(activation.delivery, 'caller', '答案只回到指令结果，不进入父会话上下文');
  assert.match(activation.label, /^omd-btw:v1:/);
  assert.deepEqual(seen, ['parent', 'child']);
  assert.deepEqual(sent.map(options => options.sessionId), ['parent', 'parent']);
  assert.deepEqual(sent[1].messages.slice(0, reference.messages.length), reference.messages);
  assert.equal(child.id, 'child');
  assert.equal(guarded[0]({ agent: { session: child } }).includes('拒绝'), true);
  assert.equal(Object.isFrozen(reference), true);
  direct = true;
  assert.equal((await invoke()).kind, 'success');
  assert.equal(sent.at(-1).sessionId, 'parent', 'direct and prepared calls share the parent cache key');
  assert.equal(seen.at(-1), 'child');
  reference = Object.freeze({ ...reference, provider: 'other' });
  await collect(ctx.llm.stream(markAgentLoopRequest(reference)));
  assert.equal((await invoke()).kind, 'success');
  assert.equal(sent.at(-1).sessionId, 'child', 'unrelated providers keep independent transport sessions');
  await owner.dispose();
  assert.equal(Object.hasOwn(ctx.llm, 'forAdapter'), false, 'unload restores native adapter projection');
});

test('/btw reports real zero and undisclosed cache usage distinctly', () => {
  assert.equal(cacheUsageText([{ cacheReadTokens: 0 }]), '缓存读取：0 tokens（未命中）');
  assert.match(cacheUsageText([{}]), /未知/);
  assert.match(cacheUsageText([{ cacheReadTokens: 4096 }, {}]), /未知/);
});
