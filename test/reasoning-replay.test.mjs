import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { installCommandCodeCompatibility } from '../src/commandcode-compat.mjs';

const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
const adapterPath = host.resolve('@deepseek-ai/dsh-llm-pi-ai');
const { PiAiAdapter } = await import(adapterPath);
const apiDirectory = join(dirname(adapterPath), '../../../@earendil-works/pi-ai/dist/api');
const { convertResponsesMessages } = await import(pathToFileURL(join(apiDirectory, 'openai-responses-shared.js')));

for (const [provider, baseURL] of [['bailian-responses', 'https://example.test/v1'], ['cmdgoat-responses', 'https://api.commandcode.ai/v1']]) {
  test(`${provider}: native Responses replay preserves real reasoning without adding or rewriting it`, async t => {
    const model = { id: 'deepseek-fixture', provider, api: 'openai-responses', input: ['text'], reasoning: true, contextWindow: 1000000, thinkingLevelMap: { high: 'high' } };
    const items = [
      { id: 'reasoning-a', type: 'reasoning', summary: [], content: [{ type: 'reasoning_text', text: 'Synthetic checkpoint analysis.' }] },
      { id: 'reasoning-b', type: 'reasoning', summary: [{ type: 'summary_text', text: 'Synthetic provider summary.' }] },
    ];
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'Inspect the synthetic checkpoints.' }] }];
    for (let i = 0; i < 3; i++) {
      const content = [{ type: 'tool-call', id: `call-${i}`, name: 'checkpoint', arguments: '{}' }], blocks = [{ type: 'tool-call' }];
      if (items[i]) {
        content.unshift({ type: 'reasoning', text: (items[i].content ?? items[i].summary)[0].text });
        blocks.unshift({ type: 'reasoning', thinkingSignature: JSON.stringify(items[i]) });
      }
      messages.push({ role: 'assistant', content, source: { kind: 'model', provider, model: model.id,
        replayState: { response: { kind: 'pi-ai', version: 2, api: model.api, provider, model: model.id, stopReason: 'toolUse' }, blocks } } });
      messages.push({ role: 'tool', toolCallId: `call-${i}`, content: [{ type: 'text', text: 'Checkpoint complete.' }] });
    }
    const profile = { api: model.api, baseURL, modelErrors: new Map(), streamIdleTimeoutMs: 1000 };
    const payloads = [], snapshot = { profiles: new Map([[provider, profile]]), models: {
      getModel: () => model,
      async *streamSimple(_model, context) {
        payloads.push(convertResponsesMessages(model, context, new Set([provider])));
        yield { type: 'done', message: { ...model, model: model.id, role: 'assistant', content: [{ type: 'text', text: 'OK' }], stopReason: 'stop',
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 } } };
      },
    } };
    const adapter = new PiAiAdapter({ resolveApiKey: async () => 'synthetic-key', onReplayDegrade: reason => assert.fail(reason) });
    const runtime = { stream: options => adapter.streamWithSnapshot(options, snapshot), async prepareCall() { return { stream: options => adapter.streamWithSnapshot(options, snapshot) }; } };
    const cleanups = [], ctx = { llm: runtime, effect(fn) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
      settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { [provider]: profile } } }] } };
    t.after(() => { for (const cleanup of cleanups.reverse()) cleanup(); });
    installCommandCodeCompatibility(ctx);
    const original = structuredClone(messages), request = markAgentLoopRequest({ provider, model: model.id, reasoningEffort: 'high', messages });
    for await (const _ of runtime.stream(request)) {}
    for await (const _ of (await runtime.prepareCall()).stream(request)) {}
    assert.deepEqual(messages, original);
    assert.equal(payloads.length, 2);
    for (const payload of payloads) {
      assert.deepEqual(payload.filter(item => item.type === 'reasoning'), items);
      assert.equal(payload.filter(item => item.type === 'function_call').length, 3);
    }
  });
}
