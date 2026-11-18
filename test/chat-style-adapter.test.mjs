import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { readComposerStats, buildChatStyleFactory } from '../scripts/chat-style-adapter.mjs';

const raw = await readFile(new URL('../vendor/dsh/ui-chat/lib/client.js', import.meta.url), 'utf8');
const pin = JSON.parse(await readFile(new URL('../vendor/dsh/ui-chat.json', import.meta.url), 'utf8'));
const assets = {};
for (const path of Object.keys(pin.files).filter(path => path.startsWith('lib/assets/'))) {
  const key = 'plugins/@deepseek-ai/dsh-client-ui-chat/' + path.slice(4).split('/').map(encodeURIComponent).join('/');
  assets[key] = 'data:image/png;base64,' + (await readFile(new URL('../vendor/dsh/ui-chat/' + path, import.meta.url))).toString('base64');
}
const source = { commit: pin.commit, sha256: pin.files['lib/client.js'] };
const expected = [{ id: 'activity', order: 0 }, { id: 'usage', order: 1 }];
const fixture = second => `ctx.slots.register({ name: 'conversation.composer.dock', id: 'activity', order: 0 }, A); ${second}`;
const usage = properties => `ctx.slots.register({ name: 'conversation.composer.dock', ${properties} }, B);`;

test('reviewed factory exports native composer metadata without executing the host', async () => {
  assert.deepEqual(readComposerStats(raw), expected);
  const { code } = buildChatStyleFactory(raw, source, assets);
  const factory = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  assert.deepEqual(factory.composerStats, expected);
  assert.equal(typeof factory.createChat, 'function');
  assert.throws(() => buildChatStyleFactory(raw, source), /missing native asset/);
  assert.match(code, /data:image\/png;base64,/);
});

test('composer extraction tolerates quotes, whitespace, field order and signed order', () => {
  assert.deepEqual(readComposerStats(`
    ctx['slots']['register']({order: -2, 'id': 'activity', name : 'conversation.composer.dock'}, A);
    ctx.slots.register({id: 'usage', order: +1, name: 'conversation.composer.dock'}, B);
  `), [{ id: 'activity', order: -2 }, { id: 'usage', order: 1 }]);
});

test('missing, duplicate, unknown or dynamic registrations fail closed', () => {
  for (const second of ['', usage("id: 'activity', order: 1"), usage("id: 'other', order: 1"),
    usage("id: 'usage', order: nextOrder"), usage("id: 'usage', order: '1'"),
    usage("id: 'usage', order: 1, order: 2"), usage("id: 'usage', order: 1, ...extra"),
    "const decoy = { name: 'conversation.composer.dock', id: 'usage', order: 1 };",
    "// ctx.slots.register({ name: 'conversation.composer.dock', id: 'usage', order: 1 }, B);"])
    assert.throws(() => readComposerStats(fixture(second)), /Chat style adapter format gate/);
  assert.throws(() => readComposerStats(''), /expected exactly one activity/);
});

test('format tolerance never bypasses the upstream source fingerprint', () => {
  assert.throws(() => buildChatStyleFactory(raw.replace('name: "conversation.composer.dock"', 'name : "conversation.composer.dock"'), source), /SHA-256 differs/);
  assert.throws(() => buildChatStyleFactory(raw, { ...source, commit: 'unreviewed' }), /unsupported upstream source/);
});

test('the native process renderer groups split summaries and keeps the reply and real tool boundaries', () => {
  const { code } = buildChatStyleFactory(raw, source, assets);
  const render = bundle => {
    const fn = bundle.slice(bundle.indexOf('function AssistantMarkdown({'), bundle.indexOf('function ProcessReasoning(')).trim().slice(0, -2);
    const element = (type, props) => ({ type, ...props });
    return runInNewContext('(' + fn + ')', { react: { useMemo: f => f() }, react_jsx_runtime: { jsx: element, jsxs: element },
      markdownLabels: () => ({}), AssistantMarkdown_module_css_default: {}, ProcessReasoning: 'process', ReasoningRow: 'think',
      _deepseek_ai_dsh_client_ui_primitives: { MarkdownText: 'text' } });
  };
  const blocks = ['summary A', 'progress', 'summary B'].map((text, i) => ({ kind: i === 1 ? 'text' : 'reasoning', text }));
  const rows = (fn, part, sequence, streaming) => fn({ blocks: sequence, groupPart: part, streaming }).children.children[0];
  assert.equal(rows(render(raw), 'reasoning', blocks, false).length, 2);
  const adapted = render(code);
  for (const streaming of [true, false]) {
    const [row, ...extra] = rows(adapted, 'reasoning', blocks, streaming);
    assert.equal(extra.length, 0);
    assert.equal(row.children.text, 'summary A\n\nsummary B');
    assert.equal(row.children.running, streaming);
    assert.equal(rows(adapted, 'response', blocks, streaming)[0].text, 'progress');
    assert.equal(rows(adapted, 'reasoning', [...blocks, { kind: 'tool-call' }, blocks[0]], streaming).length, 2);
  }
});
