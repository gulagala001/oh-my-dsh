import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { splitSource } from '../src/dream/core.mjs';
import { DreamSources } from '../src/dream/sources.mjs';

const source = await readFile(new URL('../src/dream/sources.mjs', import.meta.url), 'utf8');
const from = source.indexOf('const requestTextBytes ='), to = source.indexOf('const userText =', from);
const requestTextBytes = runInNewContext(source.slice(from, to) + ';requestTextBytes;', { Buffer });
const previous = text => Buffer.byteLength(JSON.stringify(JSON.stringify(text))) - 6;

test('Dream escaped source byte counts preserve BMP, supplementary and malformed UTF16 behavior', () => {
  for (let code = 0; code <= 0xffff; code++) { const text = String.fromCharCode(code); assert.equal(requestTextBytes(text), previous(text)); }
  for (let code = 0x10000; code <= 0x10ffff; code += 997) { const text = String.fromCodePoint(code); assert.equal(requestTextBytes(text), previous(text)); }
  for (const text of ['', 'quotes \" and path \\ here', '中文🙂', String.fromCharCode(0xd800) + 'x']) assert.equal(requestTextBytes(text), previous(text));
  const text = Array.from({ length: 5000 }, (_, index) => String.fromCharCode(index % 256)).join('') + '中文🙂'.repeat(300);
  for (const maxBytes of [1, 7, 1700, 5000]) assert.deepEqual(splitSource(text, maxBytes, requestTextBytes), splitSource(text, maxBytes, previous));
});

test('raw and summary manifests preserve escaped budgets, offsets and source identities', async () => {
  const text = ('Original \"quote\" \\path ' + String.fromCharCode(0, 8, 9, 10, 12, 13, 31, 0xd800) + ' 中文🙂').repeat(200);
  const event = { seq: 0, type: 'assistant/message', data: { message: { id: 'source', role: 'assistant', content: [{ type: 'text', text }] } } };
  const metadata = { id: 'source-session', generation: 'fixed', activity: 1 };
  const archive = { records: [{ id: 'record', summary: text, originalSeqs: [0], createdAt: 0 }] };
  const owner = { inspect: async () => ({ metadata, events: [event], inherited: 0 }),
    ctx: { agents: { get() {} } }, hub: { context: { store: { peek: () => archive } } }, store: { now: () => 10000 } };
  const manifest = await DreamSources.prototype.manifest.call(owner, metadata.id, { deepAgeMs: 0 });
  const expected = splitSource(text, 5000, previous);
  for (const kind of ['raw', 'summary']) {
    const items = manifest.items.filter(item => item.source.kind === kind);
    assert.equal(items.length, expected.length);
    for (let index = 0; index < items.length; index++) {
      const { from, to } = items[index].source, part = expected[index];
      assert.equal(from, part.from); assert.equal(to, part.to);
      assert.ok(items[index].text.endsWith(part.text)); assert.ok(items[index].source.id.startsWith('source:'));
      assert.ok(previous(part.text) <= 5000);
    }
  }
});
