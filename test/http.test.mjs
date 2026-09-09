import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../src/server.mjs';

test('HTTP → real SDK streaming → native file tool → final prose; no response-format lock', async t => {
  const root = mkdtempSync(join(tmpdir(), 'trisoul-x-http-'));
  const requests = [];
  const provider = createServer(async (req, res) => {
    let data = ''; for await (const chunk of req) data += chunk;
    const payload = JSON.parse(data); requests.push(payload);
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(payload.response_format, undefined);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, reason = null) => res.write(`data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`);
    if (payload.tools?.some(t => t.function.name === 'save_context')) {
      chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'save', type: 'function', function: { name: 'save_context', arguments: JSON.stringify({ digest: 'Wrote out.txt.', pin: [], status: 'Done.', compactable: true, nowCompactable: [], ops: [] }) } }] }, 'tool_calls');
    } else if (!payload.messages.some(m => m.role === 'tool')) {
      chunk({ role: 'assistant', content: '开始写入。' });
      chunk({ tool_calls: [{ index: 0, id: 'write-1', type: 'function', function: { name: 'write', arguments: '{"file_path":"out.txt",' } }] });
      chunk({ tool_calls: [{ index: 0, function: { arguments: '"content":"real file content"}' } }] }, 'tool_calls');
    } else { chunk({ role: 'assistant', content: '已完成。' }, 'stop'); }
    res.end('data: [DONE]\n\n');
  });
  await new Promise(done => provider.listen(0, '127.0.0.1', done));
  const app = createApp({ dataDir: join(root, 'data') });
  await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  t.after(async () => { await app.close(); await new Promise(done => provider.close(done)); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = async (path, data) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.ok(r.ok, await r.clone().text()); return r.json();
  };
  const settings = await post('/api/settings', { main: { model: 'test', api: 'openai-completions', baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, apiKey: 'test-secret' } });
  assert.equal(settings.main.hasKey, true);
  assert.equal(JSON.stringify(settings).includes('test-secret'), false);
  const unchanged = await post('/api/settings', { main: { model: 'test' } });
  assert.equal(unchanged.main.hasKey, true);
  const session = await post('/api/sessions', { cwd: root });
  await post(`/api/sessions/${session.id}/chat`, { text: 'Create the file.' });
  while (app.agent.running.has(session.id)) await new Promise(done => setTimeout(done, 10));
  while (app.agent.context.jobs.has(session.id)) await app.agent.context.jobs.get(session.id);
  assert.equal(readFileSync(join(root, 'out.txt'), 'utf8'), 'real file content');
  const snapshot = await (await fetch(`${base}/api/sessions/${session.id}`)).json();
  assert.equal(snapshot.running, false);
  assert.ok(snapshot.events.some(e => e.message?.content?.some?.(b => b.text === '已完成。')));
  const followup = requests.find(p => p.messages.some(m => m.role === 'tool'));
  assert.match(followup.messages.find(m => m.role === 'tool').content, /Written out.txt/);
  assert.equal(snapshot.events.filter(e => e.type === 'digest').length, 1);
  const html = await (await fetch(base)).text();
  assert.match(html, /message-input/);
});
