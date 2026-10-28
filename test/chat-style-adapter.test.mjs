import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readComposerStats, buildChatStyleFactory } from '../scripts/chat-style-adapter.mjs';

const raw = await readFile(new URL('../vendor/dsh/ui-chat/lib/client.js', import.meta.url), 'utf8');
const pin = JSON.parse(await readFile(new URL('../vendor/dsh/ui-chat.json', import.meta.url), 'utf8'));
const source = { commit: pin.commit, sha256: pin.files['lib/client.js'] };
const expected = [{ id: 'activity', order: 0 }, { id: 'usage', order: 1 }];
const fixture = second => `ctx.slots.register({ name: 'conversation.composer.dock', id: 'activity', order: 0 }, A); ${second}`;
const usage = properties => `ctx.slots.register({ name: 'conversation.composer.dock', ${properties} }, B);`;

test('reviewed factory exports native composer metadata without executing the host', async () => {
  assert.deepEqual(readComposerStats(raw), expected);
  const { code } = buildChatStyleFactory(raw, source);
  const factory = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  assert.deepEqual(factory.composerStats, expected);
  assert.equal(typeof factory.createChat, 'function');
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
