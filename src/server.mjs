import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, projectOf } from './store.mjs';
import { Agent } from './agent.mjs';
import { APIS } from './llm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('请求需要 application/json');
  let text = '';
  for await (const chunk of req) text += chunk;
  return JSON.parse(text);
}

export function createApp({ dataDir = join(ROOT, 'data'), model } = {}) {
  const store = new Store(dataDir);
  const listeners = new Map(), live = new Map();
  const send = (res, value) => { if (!res.destroyed) res.write(`data: ${JSON.stringify(value)}\n\n`); };
  const notify = (id, event) => {
    const partial = live.get(id) ?? { text: '', thinking: '', tool: null };
    if (event.type === 'step') { partial.text = ''; partial.thinking = ''; }
    if (event.type === 'text_delta') partial.text += event.delta;
    if (event.type === 'thinking_delta') partial.thinking += event.delta;
    if (event.type === 'message') { partial.text = ''; partial.thinking = ''; }
    if (event.type === 'tool_start') partial.tool = event.call;
    if (event.type === 'tool_end') partial.tool = null;
    if (event.type === 'status') { partial.state = event.state; partial.error = event.state === 'error' ? event.message : ''; }
    if (event.type === 'maintenance') partial.maintenance = event;
    live.set(id, partial);
    for (const res of listeners.get(id) ?? []) send(res, event);
  };
  const agent = new Agent(store, { model, notify });
  const snapshot = (session) => ({
    type: 'snapshot', session: store.info(session), events: session.events,
    running: agent.running.has(session.id), live: live.get(session.id) ?? null,
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    try {
      if (path === '/api/settings') {
        if (req.method === 'GET') return json(res, 200, { ...store.publicSettings(), apis: APIS });
        if (req.method === 'POST') return json(res, 200, store.saveSettings(await body(req)));
      }
      if (path === '/api/sessions') {
        if (req.method === 'GET') return json(res, 200, store.list().map(s => ({ ...s, running: agent.running.has(s.id) })));
        if (req.method === 'POST') {
          const input = await body(req);
          const cwd = resolve(input.cwd || store.settings().cwd);
          if (!(await stat(cwd)).isDirectory()) throw new Error('工作目录不存在');
          return json(res, 201, store.info(store.create(cwd)));
        }
      }
      if (path === '/api/memories') {
        const session = url.searchParams.has('session') ? store.get(url.searchParams.get('session')) : null;
        const project = session?.events[0].project ?? projectOf(store.settings().cwd);
        if (req.method === 'GET') return json(res, 200, store.memories(project));
        if (req.method === 'POST') {
          const input = await body(req);
          return json(res, 200, store.memoryOps(project, [input], 'user'));
        }
      }
      const match = path.match(/^\/api\/sessions\/([a-f0-9-]+)(?:\/(events|chat|stop|compact))?$/);
      if (match) {
        const session = store.get(match[1]);
        const action = match[2];
        if (!action && req.method === 'GET') return json(res, 200, snapshot(session));
        if (action === 'events' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          const set = listeners.get(session.id) ?? new Set();
          set.add(res); listeners.set(session.id, set);
          send(res, snapshot(session));
          const timer = setInterval(() => { if (!res.destroyed) res.write(': keepalive\n\n'); }, 15000);
          timer.unref();
          res.on('close', () => { clearInterval(timer); set.delete(res); if (!set.size) listeners.delete(session.id); });
          return;
        }
        if (action === 'chat' && req.method === 'POST') {
          const { text } = await body(req);
          if (typeof text !== 'string' || !text.trim()) throw new Error('消息不能为空');
          if (agent.running.has(session.id)) return json(res, 409, { error: '这个对话还在执行中' });
          const route = store.settings().main;
          if (!route.model || !route.baseUrl) throw new Error('先在设置中填写模型和 API 地址。');
          void agent.start(session, text.trim()).catch(error => { console.error(error); notify(session.id, { type: 'status', state: 'error', message: error.message }); });
          return json(res, 202, { ok: true });
        }
        if (action === 'stop' && req.method === 'POST') { agent.stop(session.id); return json(res, 200, { ok: true }); }
        if (action === 'compact' && req.method === 'POST') {
          if (agent.running.has(session.id)) return json(res, 409, { error: '等待当前执行结束后再整理' });
          const changed = await agent.context.compact(session, true);
          return json(res, 200, { changed });
        }
      }
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      if (req.method === 'GET' && files[path]) {
        const [file, type] = files[path];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
        res.end(await readFile(join(ROOT, 'web', file))); return;
      }
      json(res, 404, { error: '找不到这个接口' });
    } catch (error) {
      if (!res.headersSent) json(res, 400, { error: error.message });
      else res.end();
    }
  });
  return { server, store, agent, close: async () => {
    const closed = new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
    for (const id of agent.running.keys()) agent.stop(id);
    agent.context.dispose();
    for (const set of listeners.values()) for (const res of set) res.end();
    await Promise.allSettled([...agent.runs.values(), ...agent.context.jobs.values()]);
    await closed;
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp({ dataDir: process.env.TRISOUL_X_DATA || join(ROOT, 'data') });
  const port = Number(process.env.PORT || 3082);
  app.server.listen(port, '127.0.0.1', () => console.log(`trisoul_x → http://127.0.0.1:${port}`));
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await app.close(); process.exit(0); };
  process.on('SIGINT', close); process.on('SIGTERM', close);
}
