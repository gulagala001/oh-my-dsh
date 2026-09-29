import test from 'node:test';
import assert from 'node:assert/strict';
import { presentDreamRead } from '../src/dream/api.mjs';

function fixture() {
  const sources = {
    global: { kind: 'memory', key: 'global', revision: 2 },
    project: { kind: 'memory', key: 'project:/工作/夏季发布', revision: 3 },
    session: { kind: 'memory', key: 'session:session-one', revision: 4 },
    decision: { kind: 'summary', sessionId: 'session-one', identity: 'decision:old:8:quote', originalSeqs: [8], text: '用户决定：保留旧项目目录。' },
    summary: { kind: 'summary', sessionId: 'session-one', originalSeqs: [21, 8, 13], text: '🧠'.repeat(130) },
    raw: { kind: 'raw', sessionId: 'session-one', seq: 0, speaker: 'tool' },
    withdrawn: { kind: 'withdrawn', sessionId: 'private-session', text: '不可展示的缓存内容' },
  };
  const calls = [];
  return { calls, hub: { dream: { store: {
    source: id => sources[id],
    session: id => { calls.push(['session', id]); return id === 'session-one' ? { title: '确认新版交付清单' } : { title: '不可展示的私有标题' }; },
    memory: (key, revision) => { calls.push(['memory', key, revision]); return { summary: `固定版本 ${revision} 的短记忆。` }; },
  } } } };
}

test('web source presentation identifies immutable memory versions and human session names without changing recall data', () => {
  const { hub, calls } = fixture();
  const input = { kind: 'global', reference: 'global', key: 'global', revision: 2, text: '当前页原文', sources: ['project', 'session'].map(reference => ({ reference, kind: 'memory' })) };
  const before = structuredClone(input), output = presentDreamRead(hub, input);
  assert.deepEqual(input, before);
  assert.equal(output.text, input.text);
  assert.equal(output.presentation.title, '全局记忆');
  assert.deepEqual(output.sources.map(s => s.presentation.title), ['夏季发布', '确认新版交付清单']);
  assert.equal(output.sources[0].presentation.preview, '固定版本 3 的短记忆。');
  assert.ok(calls.some(c => c[0] === 'memory' && c[1] === 'project:/工作/夏季发布' && c[2] === 3));
  assert.equal('presentation' in before.sources[0], false);
});

test('web source cards use captured summaries, event ranges and bounded Unicode previews', () => {
  const { hub } = fixture();
  const output = presentDreamRead(hub, { kind: 'sources', reference: 'global', entries: ['decision', 'summary', 'raw'].map(reference => ({ reference, kind: 'summary' })) });
  assert.equal(output.entries[0].presentation.detail, '用户决定 · 事件 #8');
  assert.equal(output.entries[0].presentation.preview, '用户决定：保留旧项目目录。');
  assert.equal(output.entries[1].presentation.detail, '会话摘要 · 事件 #8–21');
  assert.equal(output.entries[1].presentation.preview, '🧠'.repeat(120) + '…');
  assert.equal(output.entries[2].presentation.detail, '工具记录 · 事件 #0');
  assert.equal(output.entries[2].presentation.preview, '');
});

test('withdrawn references never receive cached previews or session metadata', () => {
  const { hub, calls } = fixture();
  const output = presentDreamRead(hub, { kind: 'sources', reference: 'global', entries: [{ kind: 'summary', reference: 'withdrawn' }] });
  assert.deepEqual(output.entries[0].presentation, { title: '已退出共享', detail: '保留原始引用，按需回查', preview: '' });
  assert.ok(!calls.some(c => c[0] === 'session' && c[1] === 'private-session'));
  assert.doesNotMatch(JSON.stringify(output), /不可展示/);
});

test('empty and ungenerated reads do not look up an undefined session', () => {
  const hub = { dream: { store: { source: () => null, session: () => { throw Error('No session lookup expected'); } } } };
  const value = { kind: 'not_generated', message: '尚未生成。', target: 'global' };
  const output = presentDreamRead(hub, value, { memory: 'global' });
  assert.equal(output.message, value.message);
  assert.equal(output.presentation.preview, '');
});
