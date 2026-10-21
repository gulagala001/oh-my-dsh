import { sendJson } from './http.mjs';

// Preserve the first exception, its native paths and causes. Do not include
// configuration, environment, request bodies or user conversations.
export function startupError(error, seen = new Set(), depth = 0) {
  if (depth > 5 || seen.has(error)) return { message: '[truncated cause]' };
  if (error === null || typeof error !== 'object') return { message: String(error) };
  seen.add(error);
  return {
    name: String(error.name ?? 'Error'), message: String(error.message ?? error),
    ...(error.code !== undefined ? { code: String(error.code) } : {}),
    ...(error.stack ? { stack: String(error.stack).slice(0, 16000) } : {}),
    ...(error.cause !== undefined ? { cause: startupError(error.cause, seen, depth + 1) } : {}),
    ...(Array.isArray(error.errors) ? { errors: error.errors.slice(0, 8).map(cause => startupError(cause, seen, depth + 1)) } : {}),
  };
}

export function mountStartup(ctx) {
  let snapshot = { status: 'loading', error: null };
  let active = true;
  ctx.effect(() => () => { active = false; });
  ctx.inject(['webServer', 'connection'], scope => scope.effect(() => scope.webServer.register({
    kind: 'exact', path: '/oh-my-dsh/startup', handler(req, res) {
      const denied = scope.connection.requestRejection(req);
      if (denied !== undefined) { res.writeHead(denied, { 'Cache-Control': 'no-store' }); res.end(); return; }
      if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
      sendJson(res, 200, snapshot);
    },
  })));
  return {
    ready() { if (active) snapshot = { status: 'ready', error: null }; },
    fail(error) { if (!active) return false; snapshot = { status: 'error', error: startupError(error) }; return true; },
  };
}
