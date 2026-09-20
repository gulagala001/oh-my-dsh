import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage, createSystemMessage } from '@deepseek-ai/dsh-llm';
import { Hub, message } from '../src/hub.mjs';
import { HubStore, projectOf } from '../src/hub-store.mjs';
import { ensureSystemHead } from '../src/system-head.mjs';
import { Config } from '../src/config.mjs';
import { TASK_DESCRIPTION, VERIFICATION_DESCRIPTION } from '../src/tasks.mjs';
import { MAIN_PERSONA } from '../src/prompts.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'trisoul-x-core-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new HubStore(dir), config = Config({});
  const hub = Object.assign(Object.create(Hub.prototype), { store, getConfig: () => config });
  const session = Session.create('test', undefined, { version: 3, id: 'test', createdAt: 1, cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  return { store, hub, session, config, dir };
}

test('system slot precedes startup context and old sessions are repaired once without changing text', t => {
  const { session } = setup(t);
  assert.equal(ensureSystemHead(session, { turn: 1, step: 1 }), true);
  const slot = session.surface.nodes[0];
  session.append('user/message', message('Opening memory', 'memory'), { surfaceOp: 'append' });
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('Original system text.', '@deepseek-ai/dsh-system-prompt') }, { surfaceOp: { op: 'replace', startSeq: slot, endSeq: slot }, sourceEventSeqs: [slot] });
  assert.equal(session.deriveMessages()[0].role, 'system');
  const before = session.seq;
  assert.equal(ensureSystemHead(session, { turn: 1, step: 2 }), false);
  assert.equal(session.seq, before);

  const old = Session.create('old', undefined, { ...session.header, id: 'old' });
  for (const text of ['Todo reminder', 'Opening memory', 'Task memory']) old.append('user/message', message(text), { surfaceOp: 'append' });
  old.append('system/message', { turn: 1, step: 1, message: createSystemMessage('Original system text.', '@deepseek-ai/dsh-system-prompt') }, { surfaceOp: 'append' });
  old.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'User request' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  const original = old.deriveMessages();
  ensureSystemHead(old, { turn: 2, step: 1 });
  assert.deepEqual(old.deriveMessages(), [original[3], ...original.slice(0, 3), original[4]]);
  const repaired = old.seq;
  ensureSystemHead(old, { turn: 2, step: 2 });
  assert.equal(old.seq, repaired);
  assert.deepEqual(Session.create(old.id, old.snapshotEvents(), old.header).deriveMessages(), old.deriveMessages());
  old.append('system/message', { turn: 2, step: 2, message: createSystemMessage('Updated system text.', '@deepseek-ai/dsh-system-prompt') }, { surfaceOp: 'append' });
  const inHistory = [...old.surface.nodes];
  ensureSystemHead(old, { turn: 2, step: 3 });
  assert.deepEqual(old.surface.nodes, inHistory, 'later in-history system updates are not moved');
});

test('current main and task prompts retain their approved text', () => {
  const candidate = JSON.parse(readFileSync(new URL('./fixtures/cc-prompt-hashes.json', import.meta.url), 'utf8'));
  for (const [name, text] of Object.entries({ MAIN_PERSONA, TASK_DESCRIPTION, VERIFICATION_DESCRIPTION })) {
    assert.equal(createHash('sha256').update(text).digest('hex'), candidate[name], name);
  }
});

test('session scope binding is inherited by nested subagents and does not change with default', t => {
  const { hub, store, session, config } = setup(t); store.state(session.id).memoryScope = 'session';
  store.state('child').parentSession = session.id;
  const child = { id: 'grandchild', header: { parentSession: 'child', cwd: '/other' } };
  config.memoryScope = 'full'; assert.deepEqual(hub.scope(child), { mode: 'session', project: 'session:test' });
});

test('historical project memories remain readable without crossing project or private boundaries', t => {
  const { store, dir } = setup(t);
  const repo = join(dir, 'repo'), child = join(repo, 'src'), nested = join(repo, 'vendor/repo'), sibling = join(dir, 'repo-extra');
  for (const path of [repo, child, nested, sibling]) mkdirSync(path, { recursive: true });
  mkdirSync(join(repo, '.git')); writeFileSync(join(nested, '.git'), 'gitdir: ../somewhere');
  const entries = [
    { id: 'legacy', scope: 'project', project: child, text: 'Child fact.' },
    { id: 'root', scope: 'project', project: repo, text: 'Root fact.' },
    { id: 'old', scope: 'project', project: repo, text: 'Retired fact.', retired: true },
    { id: 'sibling', scope: 'project', project: sibling, text: 'Sibling fact.' },
    { id: 'private', scope: 'project', project: 'session:private', text: 'Private fact.' },
    { id: 'global', scope: 'global', text: 'Global fact.' },
  ];
  const file = join(dir, 'memory.json'), bytes = JSON.stringify(entries);
  writeFileSync(file, bytes);
  assert.equal(projectOf(child), repo); assert.equal(projectOf(nested), nested);
  assert.deepEqual(store.memories(repo, 'project', true).map(m => m.id), ['legacy', 'root', 'old']);
  assert.deepEqual(store.memories(nested, 'project', true), []);
  assert.deepEqual(store.memories('session:other', 'session', true), []);
  assert.equal(readFileSync(file, 'utf8'), bytes);
});
