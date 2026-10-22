import { acquireShared } from './shared.mjs';
import { answer, sideMessages, validateQuestion } from './context.mjs';
import { readSnapshot } from './snapshot.mjs';

export const name = 'dsh-btw';
export const inject = ['sessions', 'llm', 'sessionController', 'webServer', 'connection'];
const API = '/api/dsh-btw/ask';

async function readBody(req, signal) {
  let size = 0;
  const chunks = [];
  const abort = () => req.destroy(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) throw Error('旁聊请求过大');
      chunks.push(chunk);
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

export function install(ctx) {
  const running = new Map();
  const controllers = new Set();
  let disposed = false;
  ctx.effect(() => () => {
    disposed = true;
    for (const controller of controllers) controller.abort(Error('旁聊插件已停用'));
    controllers.clear();
    running.clear();
  });
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: API,
    async handler(req, res) {
      const rejection = ctx.connection.requestRejection(req);
      if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
      if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); res.end(); return; }
      if (disposed) { res.writeHead(503); res.end(); return; }
      const controller = new AbortController();
      controllers.add(controller);
      const disconnect = () => controller.abort(Error('旁聊连接已关闭'));
      res.once('close', disconnect);
      let key, timer, heartbeat;
      const emit = event => {
        if (res.destroyed || res.writableEnded) return;
        if (res.writableLength > 1024 * 1024) throw Error('旁聊连接无法及时接收回答');
        res.write(JSON.stringify(event) + '\n');
      };
      try {
        const data = await readBody(req, controller.signal);
        if (typeof data.sessionId !== 'string' || !data.sessionId || data.sessionId.length > 256
          || typeof data.clientId !== 'string' || !/^[\w-]{1,64}$/.test(data.clientId)) throw Error('无效会话');
        validateQuestion(data.question);
        const requestKey = `${data.clientId}:${data.sessionId}`;
        if (running.has(requestKey)) throw Error('这个会话的旁聊正在回答，请先停止或等待完成');
        key = requestKey;
        running.set(key, controller);
        timer = setTimeout(() => controller.abort(Error('旁聊请求超时，请重试')), 660000);
        timer.unref?.();
        const snapshot = await readSnapshot(ctx, data.sessionId, controller.signal);
        controller.signal.throwIfAborted();
        const messages = sideMessages(snapshot.messages, data.question, data.history, snapshot.config);
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
        emit({ type: 'meta', provider: snapshot.config.provider, model: snapshot.config.model });
        heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded) res.write('\n'); }, 15000);
        heartbeat.unref?.();
        await answer(ctx.llm, snapshot, messages, controller.signal, emit);
      } catch (error) {
        if (!res.destroyed && !res.writableEnded) {
          if (!res.headersSent) res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          const message = controller.signal.aborted ? controller.signal.reason?.message : error.message;
          res.end(JSON.stringify({ type: 'error', error: message || '旁聊请求失败' }) + '\n');
        }
      } finally {
        clearTimeout(timer); clearInterval(heartbeat);
        res.off('close', disconnect);
        controller.abort();
        controllers.delete(controller);
        if (key && running.get(key) === controller) running.delete(key);
        if (!res.destroyed && !res.writableEnded) res.end();
      }
    },
  }));
}

export const apply = ctx => acquireShared(ctx, 'server', { name, inject, apply: install });
