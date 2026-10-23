import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PersonaStore, validateSessionId } from './store.mjs';
import { sessionPersonality, handlePersonalityApi } from './session.mjs';
import { applyPersonality, renderPersonality } from './shared/prompt.mjs';

export const name = 'dsh-persona-plugin';
export const inject = ['sessions', 'sessionProjections'];
const roots = globalThis[Symbol.for('dsh-persona-plugin.server.v1')] ??= new WeakMap();
export const API = '/api/dsh-persona';
export const personaService = ctx => roots.get(ctx.root)?.service;
const send = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 32 * 1024 * 1024) throw Error('人格设置过大'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function target(ctx, id) {
  validateSessionId(id);
  const agent = ctx.get('agents')?.get(id), session = agent?.session ?? ctx.get('sessions')?.get(id);
  if (session) return { found: true, session, agent };
  const controller = ctx.get('sessionController');
  if (!controller?.inspect) throw Error('当前宿主不能读取该会话');
  const inspection = await controller.inspect(id);
  if (inspection?.meta?.id !== id || !Array.isArray(inspection.events)) throw Error('会话不存在或不可读取');
  return { found: true, inspection };
}
export function acquirePersona(ctx, { legacy } = {}) {
  const root = ctx.root;
  let entry = roots.get(root);
  if (entry?.retiring) throw Error('Persona 正在停用，请稍后重试');
  if (!entry) {
    const profile = root.get('profileContext'), homeValue = root.get('dshHomePath');
    const home = profile?.home || (typeof homeValue === 'function' ? homeValue() : homeValue);
    if (!home) throw Error('Persona 无法读取宿主数据目录');
    const profileKey = createHash('sha256').update(profile?.dir || 'default').digest('hex').slice(0, 16);
    const store = new PersonaStore(join(home, 'dsh-persona-plugin', profileKey));
    if (legacy) store.migrateLegacy(legacy.config(), legacy.store.dir);
    const service = { store, config: () => store.config(), update: (patch, revision) => store.update(patch, revision),
      forSession: session => sessionPersonality(service, session), promptFor: session => renderPersonality(service.forSession(session).modules) };
    entry = { service, leases: new Set() }; roots.set(root, entry);
    entry.unprovide = root.provide('dshPersona', service);
    entry.offPrompt = root.on('system-prompt/assemble', async (_initial, context, next) => applyPersonality(await next(), context, service), { global: true, prepend: true });
    entry.api = root.inject(['webServer', 'connection'], scope => scope.effect(() => scope.webServer.register({ kind: 'prefix', path: API, async handler(req, res) {
      const denied = scope.connection.requestRejection(req);
      if (denied !== undefined) { res.writeHead(denied); res.end(); return; }
      try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === API + '/settings') {
          try {
            if (req.method === 'POST') {
              const patch = await readBody(req);
              const revision = req.headers['if-match'];
              if (typeof revision !== 'string' || !revision)
                throw Object.assign(Error('请重新读取人格设置后保存'), { statusCode: 428 });
              // Compare and persist synchronously, after the complete body is read.
              service.update(patch, revision);
            } else if (req.method !== 'GET') { send(res, 405, { error: '仅支持 GET 或 POST' }); return; }
            res.setHeader('ETag', store.revision());
            send(res, 200, service.config());
          } catch (error) {
            res.setHeader('ETag', store.revision());
            send(res, error.statusCode ?? 400, { error: error.message, config: service.config() });
          }
          return;
        }
        if (url.pathname === API + '/session') {
          const id = url.searchParams.get('session'), current = await target(root, id);
          await handlePersonalityApi({ hub: service, ctx: root, req, res, ...current, id, readBody, send, refreshSession: () => target(root, id) });
          return;
        }
        send(res, 404, { error: '接口不存在' });
      } catch (error) { send(res, error.statusCode ?? 400, { error: error.message }); }
    } })));
  }
  if (legacy) entry.service.store.migrateLegacy(legacy.config(), legacy.store.dir);
  const lease = {};
  entry.leases.add(lease);
  ctx.effect(() => async () => {
    entry.leases.delete(lease);
    if (entry.leases.size) return;
    entry.retiring = true;
    entry.service.store.close();
    try { await entry.api.dispose(); }
    finally { roots.delete(root); entry.offPrompt(); entry.unprovide(); }
  });
  return entry.service;
}
export function apply(ctx) { acquirePersona(ctx); }
