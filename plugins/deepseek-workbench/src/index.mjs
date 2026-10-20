import { Context, Service } from '@deepseek-ai/cordis';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { ConversationImporter, MAX_IMPORT_BYTES } from './import.mjs';
import { saveAccountProbe } from './account-probe.mjs';

export const name = 'deepseek-workbench';
export const inject = ['agents', 'sessions', 'llm', 'webServer', 'connection'];
export const VERSION = '0.1.0-dsh.0.2.1-rc.2';

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > MAX_IMPORT_BYTES) throw Error('迁移请求超过 48 MiB 上限（含附件编码）'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Host-owned migration service, shared by the independent bundle and OMD integration. */
export class DeepSeekWorkbench extends Service {
  constructor(ctx) {
    super(ctx, 'deepseekWorkbench');
    this.enabled = true;
    if (process.env.DSW_ACCOUNT_DIAGNOSTICS === '1') ctx.inject(['deepseekAccount'], scope => {
      void saveAccountProbe(scope.deepseekAccount, resolve(process.env.DSH_HOME || resolve(homedir(), '.dsh'), 'deepseek-workbench'));
    });
    this.importer = new ConversationImporter({ ctx, directory: resolve(process.env.DSH_HOME || resolve(homedir(), '.dsh'), 'deepseek-workbench', 'imports') });
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/deepseek-workbench/api', handler: async (req, res) => {
      const denied = ctx.connection.requestRejection(req);
      if (denied !== undefined) { res.writeHead(denied); res.end(); return; }
      const path = new URL(req.url, 'http://localhost').pathname;
      try {
        if (path === '/deepseek-workbench/api/state' && req.method === 'GET') { send(res, 200, { enabled: this.enabled, version: VERSION, accountDiagnostics: process.env.DSW_ACCOUNT_DIAGNOSTICS === '1', demoOpen: process.env.DSW_DEMO_OPEN === '1', demoVerify: process.env.DSW_DEMO_VERIFY === '1' }); return; }
        if (path === '/deepseek-workbench/api/verification-result' && req.method === 'POST' && process.env.DSW_DEMO_VERIFY === '1') {
          const value = await body(req);
          const directory = resolve(process.env.DSH_HOME || resolve(homedir(), '.dsh'), 'deepseek-workbench');
          await mkdir(directory, { recursive: true });
          await writeFile(resolve(directory, 'real-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(),
            phase: ['sent','reply','imported','failed'].includes(value.phase) ? value.phase : 'unknown',
            sessionId: typeof value.sessionId === 'string' ? value.sessionId : undefined, error: typeof value.error === 'string' ? value.error.slice(0,300) : undefined }, null, 2), { mode: 0o600 });
          send(res, 200, { ok: true }); return;
        }
        if (path === '/deepseek-workbench/api/host-capabilities' && req.method === 'POST' && process.env.DSW_ACCOUNT_DIAGNOSTICS === '1') {
          const value = await body(req);
          const directory = resolve(process.env.DSH_HOME || resolve(homedir(), '.dsh'), 'deepseek-workbench');
          await mkdir(directory, { recursive: true });
          await writeFile(resolve(directory, 'native-ui-capabilities.json'), JSON.stringify({ checkedAt: new Date().toISOString(), frontendLoaded: true,
            persistentProfiles: value.persistentProfiles === true, downloads: value.downloads === true, nativeAccountView: value.nativeAccountView === true }, null, 2), { mode: 0o600 });
          send(res, 200, { ok: true }); return;
        }
        if (path === '/deepseek-workbench/api/login-state' && req.method === 'POST' && process.env.DSW_ACCOUNT_DIAGNOSTICS === '1') {
          const value = await body(req);
          const directory = resolve(process.env.DSH_HOME || resolve(homedir(), '.dsh'), 'deepseek-workbench');
          await mkdir(directory, { recursive: true });
          await writeFile(resolve(directory, 'web-login-state.json'), JSON.stringify({ checkedAt: new Date().toISOString(),
            ready: value.ready === true, signIn: value.signIn === true }, null, 2), { mode: 0o600 });
          send(res, 200, { ok: true }); return;
        }
        if (path === '/deepseek-workbench/api/import' && req.method === 'POST') { send(res, 200, await this.importer.import(await body(req))); return; }
        send(res, path === '/deepseek-workbench/api/state' || path === '/deepseek-workbench/api/import' ? 405 : 404, { error: '此请求不可用' });
      } catch (error) { send(res, 400, { error: error.message }); }
    } }));
    ctx.effect(() => () => { this.enabled = false; });
  }
}

const ownership = Symbol.for('dsh.deepseek-workbench.backend');
function reconcile(shared) {
  shared.pending = shared.pending.catch(() => {}).then(async () => {
    if (shared.owners.size && !shared.fiber) {
      const fiber = shared.host.plugin({ name: 'deepseek-workbench-service', inject, apply: scope => { new DeepSeekWorkbench(scope); } });
      shared.fiber = fiber;
      try { await fiber; }
      catch (error) { await fiber.dispose(); shared.fiber = null; throw error; }
    } else if (!shared.owners.size && shared.fiber) {
      await shared.fiber.dispose();
      shared.fiber = null;
    }
  });
  return shared.pending;
}

/** The Host owns the service fiber; bundles own leases, not one another's API. */
export async function apply(ctx) {
  const root = ctx.root;
  root[Context.isolate].deepseekWorkbench ??= Symbol('deepseekWorkbench');
  const scopes = root[ownership] ??= new Map();
  const label = ctx[Context.isolate].deepseekWorkbench;
  let shared = scopes.get(label);
  if (!shared) {
    shared = { host: root.extend({ [Context.isolate]: ctx[Context.isolate] }), owners: new Set(), fiber: null, pending: Promise.resolve() };
    scopes.set(label, shared);
  }
  const owner = ctx.fiber;
  if (shared.owners.has(owner)) { await shared.pending; return; }
  ctx.effect(() => {
    shared.owners.add(owner);
    return async () => {
      shared.owners.delete(owner);
      await reconcile(shared);
      if (!shared.owners.size && scopes.get(label) === shared) scopes.delete(label);
    };
  });
  await reconcile(shared);
}
