import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Context, Service } from '@deepseek-ai/cordis';
import { LlmRuntime, createMessage, createUserMessage, createToolResultMessage, markAgentLoopRequest, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { normalizeResponsesReasoning, installResponsesReasoningCompatibility } from '../src/responses-reasoning-compat.mjs';
const provider = 'fixture', model = 'deepseek/deepseek-v4.1-flash';
function assistant(content = [{ type: 'tool-call', id: 'call_1', name: 'read', arguments: '{}' }]) {
  return createMessage({ role: 'assistant', content, source: { kind: 'model', provider, model, replayState: {
    response: { kind: 'pi-ai', version: 2, api: 'openai-responses', provider, model, stopReason: 'toolUse' },
    blocks: content.map(b => ({ type: b.type, ...(b.type === 'reasoning' ? { thinkingSignature: JSON.stringify({ type: 'reasoning', summary: [{ type: 'summary_text', text: b.text }] }) } : {}) })),
  } } });
}
const request = message => Object.freeze({ provider, model, messages: Object.freeze([
  createUserMessage({ content: [{ type: 'text', text: 'Read then answer.' }], source: { kind: 'user' } }),
  message,
  createToolResultMessage({ callId: 'call_1', content: [{ type: 'text', text: 'Read done.' }], isError: false }),
]) });

test('tool-only native replay gets empty reasoning without mutating history, IDs or request branding', () => {
  const message = assistant(), options = markAgentLoopRequest(request(message)), before = JSON.stringify(options);
  const fixed = normalizeResponsesReasoning(options), updated = fixed.messages[1];
  assert.equal(isAgentLoopRequest(fixed), true);
  assert.equal(Object.isFrozen(fixed), true);
  assert.deepEqual(updated.content, [{ type: 'reasoning', text: '' }, ...message.content]);
  assert.deepEqual(updated.source.replayState.blocks.slice(1), message.source.replayState.blocks);
  assert.equal(updated.id, message.id);
  assert.equal(fixed.messages[2], options.messages[2]);
  assert.equal(JSON.stringify(options), before);
  assert.equal(normalizeResponsesReasoning(fixed), fixed);
});

test('existing reasoning, foreign models, other APIs and malformed/failed replay remain untouched', () => {
  const reasoned = request(assistant([{ type: 'reasoning', text: 'Exact original.' }, { type: 'tool-call', id: 'call_1', name: 'read', arguments: '{}' }]));
  assert.equal(normalizeResponsesReasoning(reasoned), reasoned);
  for (const change of [
    o => { o.provider = 'other'; }, o => { o.model = 'gpt-5'; },
    o => { delete o.messages[1].source.replayState; },
    o => { o.messages[1].source.replayState.response.api = 'openai-completions'; },
    o => { o.messages[1].source.replayState.response.stopReason = 'aborted'; },
    o => { o.messages[1].source.replayState.blocks = []; },
    o => { o.messages[1].source.replayState.blocks = [null]; },
  ]) {
    const options = structuredClone(request(assistant())); change(options);
    assert.equal(normalizeResponsesReasoning(options), options);
  }
});

const gateway = { api: 'openai-responses', baseURL: 'https://api.commandcode.ai/provider/v1' };
test('CommandCode summary-only reasoning is replayed as exact reasoning_text, without altering other gateways or opaque content', () => {
  const options = request(assistant([{ type: 'reasoning', text: 'Exact original.\nQuotes: "a" \\ b' }, { type: 'tool-call', id: 'call_1', name: 'read', arguments: '{}' }]));
  const before = JSON.stringify(options), fixed = normalizeResponsesReasoning(options, gateway);
  const original = JSON.parse(options.messages[1].source.replayState.blocks[0].thinkingSignature);
  const item = JSON.parse(fixed.messages[1].source.replayState.blocks[0].thinkingSignature);
  assert.deepEqual(item, { ...original, content: [{ type: 'reasoning_text', text: options.messages[1].content[0].text }] });
  assert.deepEqual(fixed.messages[1].content, options.messages[1].content);
  assert.equal(JSON.stringify(options), before);
  assert.equal(normalizeResponsesReasoning(fixed, gateway), fixed);
  for (const profile of [undefined, { ...gateway, api: 'openai-completions' }, { ...gateway, baseURL: 'https://api.openai.com/v1' }, { ...gateway, baseURL: 'https://api.commandcode.ai.other.invalid/v1' }]) assert.equal(normalizeResponsesReasoning(options, profile), options);
  for (const mutate of [
    i => { i.encrypted_content = 'opaque'; },
    i => { i.content = [{ type: 'reasoning_text', text: 'Authoritative content' }]; },
    i => { i.summary[0].text = 'Different summary'; },
  ]) {
    const candidate = structuredClone(options), i = JSON.parse(candidate.messages[1].source.replayState.blocks[0].thinkingSignature);
    mutate(i); candidate.messages[1].source.replayState.blocks[0].thinkingSignature = JSON.stringify(i);
    assert.equal(normalizeResponsesReasoning(candidate, gateway), candidate);
  }
});

test('real pi-ai serializer: reproduce missing field, repair direct/prepared calls and restore on unload', async t => {
  const ctx = new Context(), runtime = new LlmRuntime(ctx);
  class Credentials extends Service {
    constructor() { super(ctx, 'credentials'); }
    async resolve() { return { value: 'fixture' }; }
    async readRecord() {}
    async listRecords() { return []; }
  }
  new Credentials();
  const host = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
  const pi = await import(pathToFileURL(host.resolve('@deepseek-ai/dsh-llm-pi-ai')).href);
  await ctx.plugin(pi, { providers: { [provider]: { api: 'openai-responses', baseURL: 'https://fixture.invalid/v1', apiKeyEnv: 'FIXTURE', models: [{ id: model, input: ['text'], contextWindow: 100000, maxTokens: 1024 }] } } });
  const fetch = globalThis.fetch, bodies = [];
  t.after(() => { globalThis.fetch = fetch; });
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    const reasoning = body.input.find(i => i.type === 'reasoning');
    if (!reasoning?.content?.some(c => c.type === 'reasoning_text')) return Response.json({ error: { message: 'The `reasoning_text` in the thinking mode must be passed back to the API.' } }, { status: 400 });
    const item = { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] };
    const events = [
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp_1', status: 'completed', model, output: [item], usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 } } },
    ];
    return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  };
  const options = request(assistant());
  const send = async (prepared, input = options) => {
    const target = prepared ? await runtime.prepareCall({ provider, model }) : runtime;
    return Array.fromAsync(target.stream(prepared ? { ...input, ...target.config } : input));
  };
  assert.equal((await send()).at(-1).reason.kind, 'error');
  let dispose;
  const reasoned = request(assistant([{ type: 'reasoning', text: 'Exact reasoning.' }, { type: 'tool-call', id: 'call_1', name: 'read', arguments: '{}' }]));
  assert.equal((await send(false, reasoned)).at(-1).reason.kind, 'error', 'the first hotfix still fails on summary-only reasoning');
  installResponsesReasoningCompatibility({ llm: runtime, settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { [provider]: gateway } } }] }, effect(fn) { dispose = fn(); } });
  t.after(() => dispose());
  for (const prepared of [false, true]) {
    const chunks = await send(prepared);
    assert.equal(chunks.at(-1).reason.kind, 'stop');
    const input = bodies.at(-1).input;
    assert.equal(input.find(i => i.type === 'reasoning').content[0].text, '');
    assert.equal(input.find(i => i.type === 'function_call').call_id, input.find(i => i.type === 'function_call_output').call_id);
  }
  assert.equal((await send(true, reasoned)).at(-1).reason.kind, 'stop');
  assert.equal(bodies.at(-1).input.find(i => i.type === 'reasoning').content[0].text, 'Exact reasoning.');
  dispose();
  assert.equal((await send()).at(-1).reason.kind, 'error');
});
