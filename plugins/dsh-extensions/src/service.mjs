import { Service } from '@deepseek-ai/cordis';
import { ExtensionError, errorText, fail, homes } from './common.mjs';
import { Skills } from './skills.mjs';
import { Mcp } from './mcp.mjs';
import { Instructions, MAX_INSTRUCTION_BYTES } from './instructions.mjs';
import { Commands } from './commands.mjs';
import { Hooks } from './hooks.mjs';

export const VERSION = '0.1.1-dsh.0.2.1-rc.2';
export const API = '/dsh-extensions/api';
const MAX_BODY = 1024 * 1024 + 65536;

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req, limit = MAX_BODY) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail('too-large', 'Request is too large', {}, 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { fail('invalid-json', 'Request body must be JSON'); }
}

/** Host side of the Plugins page tabs: one service shared by every installed copy. */
export class Extensions extends Service {
  constructor(ctx) {
    super(ctx, 'dshExtensions');
    this.enabled = true;
    this.homes = homes();
    this.skills = new Skills(ctx);
    this.mcp = new Mcp(ctx, this.homes);
    this.instructions = new Instructions(ctx, this.homes);
    this.commands = new Commands(ctx, this.homes);
    this.hooks = new Hooks(ctx, this.homes);
    this.commands.start();
    this.hooks.start();
    ctx.effect(() => {
      void this.mcp.start().catch(error => ctx.logger?.warn?.(`dsh-extensions: MCP: ${errorText(error)}`));
      return () => { this.enabled = false; };
    });
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: API, handler: (req, res) => this.handle(req, res) }));
  }
  scopes() {
    const registry = this.ctx.get('workspaceRegistry');
    let list = [];
    try { list = registry?.list?.() ?? []; } catch {}
    return list.map(item => ({ id: item.id, title: item.title, path: item.path }));
  }
  scope(id) {
    if (!id || id === 'global') return { id: 'global' };
    const found = this.scopes().find(item => item.id === id);
    if (!found) fail('unknown-scope', 'This workspace is no longer available', {}, 404);
    return { id: found.id, title: found.title, cwd: found.path };
  }
  async handle(req, res) {
    const denied = this.ctx.connection.requestRejection(req);
    if (denied !== undefined) { res.writeHead(denied); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname.slice(API.length) || '/';
    const controller = new AbortController();
    const disconnect = () => controller.abort(new Error('Extensions request disconnected'));
    res.once('close', disconnect);
    try {
      if (!this.enabled) fail('service-missing', 'Extensions service is stopped', {}, 503);
      if (req.method === 'GET') send(res, 200, await this.read(route, url.searchParams, controller.signal));
      // JSON may encode one content byte as six bytes (for example \\u0000).
      else if (req.method === 'POST') send(res, 200, await this.write(route, await body(req,
        route === '/instructions' ? MAX_INSTRUCTION_BYTES * 6 + 65536 : MAX_BODY), controller.signal));
      else send(res, 405, { error: 'Method not allowed', code: 'method' });
    } catch (error) {
      const known = error instanceof ExtensionError || error?.code === 'invalid-frontmatter';
      if (!res.destroyed && !res.writableEnded) send(res, known ? error.status ?? 400 : 500, { error: errorText(error), code: known ? error.code : 'internal', params: error.params ?? {} });
    } finally { res.off('close', disconnect); }
  }
  async read(route, query, signal) {
    const scope = () => this.scope(query.get('scope'));
    switch (route) {
      case '/state': return { version: VERSION, scopes: this.scopes(), homes: this.homes };
      case '/skills': return this.skills.list(scope());
      case '/skills/file': return this.skills.read(scope(), query.get('key') ?? query.get('path'));
      case '/mcp': return this.mcp.list();
      case '/mcp/server': return this.mcp.server(query.get('name'));
      case '/instructions': return this.instructions.list(scope(), signal);
      case '/instructions/file': return this.instructions.read(scope(), query.get('path'), signal);
      case '/commands': return this.commands.list(scope());
      case '/commands/file': return this.commands.read(scope(), query.get('location'), query.get('name'));
      case '/hooks': return this.hooks.list();
      default: fail('not-found', 'Not found', {}, 404);
    }
  }
  async write(route, input, signal) {
    signal?.throwIfAborted();
    if (!this.enabled) fail('service-missing', 'Extensions service is stopped', {}, 503);
    const scope = () => this.scope(input.scope);
    const done = (value = {}) => ({ ok: true, ...value });
    switch (`${route}#${input.action}`) {
      case '/skills#create': return done({ path: await this.skills.create(scope(), input) });
      case '/skills#import': return done({ path: await this.skills.import(scope(), input) });
      case '/skills#save': await this.skills.save(scope(), input.path, input.content); return done();
      case '/skills#invocation': await this.skills.invocation(scope(), input.path, input); return done();
      case '/skills#delete': await this.skills.remove(scope(), input.path); return done();
      case '/mcp#save': await this.mcp.save(input); return done();
      case '/mcp#delete': await this.mcp.remove(input.name); return done();
      case '/mcp#enable': await this.mcp.setEnabled(input.name, input.enabled === true); return done();
      case '/mcp#tool': await this.mcp.setTool(input.name, input.tool, input.enabled === true); return done();
      case '/mcp#import': return done({ names: await this.mcp.importJson(input.json) });
      case '/mcp#reconnect': await this.mcp.reconnect(input.name); return done();
      case '/mcp#managed': return done({ result: await this.mcp.setManaged(input.entryId, input.enabled === true) });
      case '/instructions#save': await this.instructions.save(scope(), input.path, input.content, signal); return done();
      case '/instructions#delete': await this.instructions.remove(scope(), input.path, signal); return done();
      case '/commands#save': await this.commands.save(scope(), input); return done();
      case '/commands#delete': await this.commands.remove(scope(), input.location, input.name); return done();
      case '/hooks#save': await this.hooks.save(input); return done();
      case '/hooks#delete': await this.hooks.remove(input.id, input.expected); return done();
      case '/hooks#enable': await this.hooks.setEnabled(input.id, input.expected, input.enabled === true); return done();
      case '/hooks#all': await this.hooks.setAll(input.enabled === true); return done();
      case '/hooks#test': return done({ run: await this.hooks.test(input, signal) });
      default: fail('not-found', 'Unknown action', {}, 404);
    }
  }
}
