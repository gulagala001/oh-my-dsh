import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { errorText, fail, tilde, writeAtomic } from './common.mjs';

export const MCP_MODULE = '@deepseek-ai/dsh-mcp-client';
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/;
const prefix = name => `mcp__${name}__`;
const strings = (value, label) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(item => typeof item !== 'string')) fail('invalid-server', `${label} must map names to text values`);
  return { ...value };
};

/** Accept the common `mcpServers` entry shape used by MCP server READMEs. */
export function normalizeServer(name, raw) {
  if (!SERVER_NAME.test(name)) fail('invalid-server-name', 'Server names use 1-32 letters, digits, hyphens or underscores', { name });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('invalid-server', `Server ${name} must be an object`, { name });
  const type = raw.type ?? raw.transport ?? (raw.url ? 'http' : 'stdio');
  const transport = type === 'stdio' ? 'stdio' : ['http', 'streamable-http', 'streamableHttp'].includes(type) ? 'streamable-http' : type === 'sse' ? 'sse' : null;
  if (!transport) fail('invalid-transport', `Unknown transport ${type}`, { name, type: String(type) });
  const server = { name, transport, enabled: raw.disabled !== true,
    disabledTools: Array.isArray(raw.disabledTools) ? raw.disabledTools.filter(item => typeof item === 'string') : [],
    timeoutMs: Number.isFinite(raw.timeout) && raw.timeout > 0 ? raw.timeout : undefined };
  if (transport === 'stdio') {
    if (typeof raw.command !== 'string' || !raw.command.trim()) fail('command-required', `Server ${name} needs a command`, { name });
    if (raw.args !== undefined && (!Array.isArray(raw.args) || raw.args.some(item => typeof item !== 'string'))) fail('invalid-server', 'args must be a list of text values', { name });
    Object.assign(server, { command: raw.command.trim(), args: raw.args ?? [], env: strings(raw.env, 'env') ?? {}, cwd: typeof raw.cwd === 'string' ? raw.cwd : '' });
  } else {
    if (typeof raw.url !== 'string' || !/^https?:\/\//i.test(raw.url.trim())) fail('url-required', `Server ${name} needs an http(s) URL`, { name });
    Object.assign(server, { url: raw.url.trim(), headers: strings(raw.headers, 'headers') ?? {} });
  }
  return server;
}

export function serializeServer(server) {
  const out = server.transport === 'stdio'
    ? { command: server.command, ...server.args?.length ? { args: server.args } : {}, ...Object.keys(server.env ?? {}).length ? { env: server.env } : {}, ...server.cwd ? { cwd: server.cwd } : {} }
    : { type: server.transport === 'sse' ? 'sse' : 'http', url: server.url, ...Object.keys(server.headers ?? {}).length ? { headers: server.headers } : {} };
  if (server.timeoutMs) out.timeout = server.timeoutMs;
  if (server.enabled === false) out.disabled = true;
  if (server.disabledTools?.length) out.disabledTools = [...new Set(server.disabledTools)];
  return out;
}

const clientConfig = server => ({
  serverName: server.name, failOnStartupError: true,
  ...server.timeoutMs ? { toolCallTimeoutMs: server.timeoutMs } : {},
  ...server.transport === 'stdio'
    ? { transport: 'stdio', command: server.command, args: server.args, env: server.env, cwd: server.cwd }
    : { transport: 'streamable-http', url: server.url, headers: server.headers },
});
const launchKey = server => JSON.stringify(clientConfig(server));

/** MCP servers from `$DSH_HOME/mcp.json`, each running as a native dsh-mcp-client instance. */
export class Mcp {
  constructor(ctx, homes) {
    this.ctx = ctx;
    this.file = join(homes.dsh, 'mcp.json');
    this.cacheFile = join(homes.dsh, 'dsh-extensions', 'mcp-tools.json');
    this.records = new Map(); this.servers = new Map(); this.toolCache = new Map(); this.restrictions = new Map();
    this.fileError = null; this.mtime = undefined; this.queue = Promise.resolve();
    ctx.effect(() => () => this.close());
  }
  async start() {
    const cached = await readFile(this.cacheFile, 'utf8').then(JSON.parse).catch(() => ({}));
    this.toolCache = new Map(Object.entries(cached && typeof cached === 'object' && !Array.isArray(cached) ? cached : {})
      .filter(([, tools]) => Array.isArray(tools))
      .map(([name, tools]) => [name, tools.filter(tool => tool && typeof tool.name === 'string' && typeof tool.description === 'string')]));
    if (this.closed) return;
    this.ctx.effect(() => this.ctx.on('tools/change', () => { this.observeTools(); this.applyRestriction(); }));
    this.ctx.effect(() => this.ctx.on('agent/created', ({ agent }) => this.restrictAgent(agent)));
    this.ctx.effect(() => this.ctx.on('agent/disposed', ({ agent }) => { this.restrictions.get(agent)?.dispose(); this.restrictions.delete(agent); }));
    await this.sync({ force: true });
  }
  serial(task) { return this.queue = this.queue.catch(() => {}).then(task); }
  async readDocument() {
    let text;
    try { text = await readFile(this.file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return { mcpServers: Object.create(null) }; throw error; }
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('mcp.json must contain an object');
    value.mcpServers ??= {};
    if (typeof value.mcpServers !== 'object' || Array.isArray(value.mcpServers)) throw Error('mcpServers must be an object');
    value.mcpServers = Object.assign(Object.create(null), value.mcpServers);
    return value;
  }
  /** Reload when the file changed; unchanged servers keep their connection. */
  sync({ force = false } = {}) {
    return this.serial(async () => {
      if (this.closed) return;
      const mtime = await stat(this.file).then(info => info.mtimeMs, () => null);
      if (!force && mtime === this.mtime) return;
      this.mtime = mtime;
      const next = new Map();
      try {
        const document = await this.readDocument();
        for (const [name, raw] of Object.entries(document.mcpServers)) {
          try { next.set(name, normalizeServer(name, raw)); }
          catch (error) { next.set(name, { name, invalid: error.message, enabled: false, disabledTools: [] }); }
        }
        this.fileError = null;
      } catch (error) { this.fileError = errorText(error); return; }
      this.servers = next;
      for (const [name, record] of this.records) {
        const server = next.get(name);
        if (!server || server.invalid || !server.enabled || launchKey(server) !== record.key) await this.stop(name);
      }
      for (const server of next.values()) if (!server.invalid && server.enabled && !this.records.has(server.name)) this.launch(server);
      this.applyRestriction();
    });
  }
  conflict(name) {
    const tools = this.ctx.get('tools');
    return tools?.schemas().some(schema => schema.name.startsWith(prefix(name))) ?? false;
  }
  launch(server) {
    if (this.closed) return;
    const record = { key: launchKey(server), status: 'starting', error: null, fiber: null, startedAt: Date.now() };
    this.records.set(server.name, record);
    if (server.transport === 'sse') { Object.assign(record, { status: 'failed', error: 'unsupported-transport' }); return; }
    if (this.conflict(server.name)) { Object.assign(record, { status: 'failed', error: 'name-in-use' }); return; }
    record.ready = (async () => {
      try {
        const module = await import(MCP_MODULE);
        if (this.closed || this.records.get(server.name) !== record) return;
        // The import yields: another provider may have claimed this namespace.
        if (this.conflict(server.name)) { Object.assign(record, { status: 'failed', error: 'name-in-use' }); return; }
        record.fiber = this.ctx.plugin(module, clientConfig(server));
        await record.fiber;
        if (!this.closed && this.records.get(server.name) === record) {
          record.status = 'connected'; record.connectedAt = Date.now(); this.observeTools(); this.applyRestriction();
        }
      } catch (error) {
        record.status = 'failed'; record.error = errorText(error);
        const fiber = record.fiber; record.fiber = null;
        try { await fiber?.dispose(); } catch (failure) { this.ctx.logger?.warn?.(`dsh-extensions: stopping MCP ${server.name}: ${errorText(failure)}`); }
      }
    })();
  }
  async stop(name) {
    const record = this.records.get(name);
    this.records.delete(name);
    this.applyRestriction();
    if (record?.fiber) {
      try { await record.fiber.dispose(); await record.fiber.await(); }
      catch (error) { this.ctx.logger?.warn?.(`dsh-extensions: stopping MCP ${name}: ${errorText(error)}`); }
    }
    await record?.ready;
  }
  async close() {
    this.closed = true;
    clearTimeout(this.cacheTimer);
    for (const entry of this.restrictions.values()) entry.dispose();
    this.restrictions.clear();
    await this.queue.catch(() => {});
    await Promise.all([...this.records.keys()].map(name => this.stop(name)));
    if (this.cacheTimer) await this.saveToolCache();
    else await this.cacheWrite;
  }
  visibleTools(name) {
    const schemas = this.ctx.get('tools')?.schemas() ?? [];
    return schemas.filter(schema => schema.name.startsWith(prefix(name)))
      .map(schema => ({ name: schema.name.slice(prefix(name).length), description: schema.description ?? '' }));
  }
  /** Preserve descriptions for disconnected servers; live tools come from the host. */
  observeTools() {
    if (this.closed) return;
    let changed = false;
    for (const [name, record] of this.records) {
      if (record.status !== 'connected') continue;
      const visible = this.visibleTools(name), hidden = new Set(this.servers.get(name)?.disabledTools ?? []);
      const known = (this.toolCache.get(name) ?? []).filter(tool => hidden.has(tool.name) && !visible.some(item => item.name === tool.name));
      const next = [...visible, ...known].sort((a, b) => a.name.localeCompare(b.name));
      if (JSON.stringify(next) !== JSON.stringify(this.toolCache.get(name))) { this.toolCache.set(name, next); changed = true; }
    }
    if (changed) {
      clearTimeout(this.cacheTimer);
      this.cacheTimer = setTimeout(() => void this.saveToolCache(), 500);
      this.cacheTimer.unref?.();
    }
  }
  saveToolCache() {
    clearTimeout(this.cacheTimer); this.cacheTimer = undefined;
    const text = JSON.stringify(Object.fromEntries(this.toolCache), null, 2);
    return this.cacheWrite = Promise.resolve(this.cacheWrite).then(() => writeAtomic(this.cacheFile, text))
      .catch(error => this.ctx.logger?.warn?.(`dsh-extensions: MCP tool cache: ${errorText(error)}`));
  }
  /** Switched-off tools that are registered now; DSH rejects restrictions naming unknown tools. */
  denied() {
    const known = new Set((this.ctx.get('tools')?.schemas() ?? []).map(schema => schema.name));
    const deny = [];
    for (const server of this.servers.values()) {
      if (!server.enabled || this.records.get(server.name)?.status !== 'connected') continue;
      for (const tool of server.disabledTools ?? []) if (known.has(prefix(server.name) + tool)) deny.push(prefix(server.name) + tool);
    }
    return deny.sort();
  }
  /** DSH only accepts tool restrictions per agent, so each session gets its own. */
  applyRestriction() {
    if (this.closed) return;
    const deny = this.denied();
    for (const agent of this.ctx.get('agents')?.list?.() ?? []) this.restrictAgent(agent, deny);
  }
  restrictAgent(agent, deny = this.denied()) {
    const key = deny.join('\n'), current = this.restrictions.get(agent);
    if (this.closed || current?.key === key) return;
    // Removing the old restriction also emits tools/change. Publish the new
    // decision first, so neither removal nor registration can re-enter a swap.
    const entry = { key, dispose: () => {} };
    this.restrictions.set(agent, entry);
    current?.dispose();
    if (!deny.length || !agent?.ctx) { this.restrictions.delete(agent); return; }
    try {
      const fiber = agent.ctx.inject(['tools'], scope => { scope.tools.restrict({ deny }); });
      entry.dispose = () => { try { (typeof fiber === 'function' ? fiber : fiber?.dispose)?.call(fiber); } catch {} };
    } catch (error) { this.restrictions.delete(agent); this.ctx.logger?.warn?.(`dsh-extensions: restricting MCP tools: ${errorText(error)}`); }
  }
  async managed() {
    const manager = this.ctx.get('pluginManager');
    if (!manager) return [];
    const rows = (await manager.listPlugins()).filter(row => row.moduleName === MCP_MODULE);
    let configs = [];
    try { configs = this.ctx.get('configEditor')?.configuration() ?? []; } catch {}
    return rows.map(row => {
      const found = configs.find(item => item.entry?.options?.id === row.patchId);
      const config = found ? { ...found.inherited, ...found.override } : {};
      const name = typeof config.serverName === 'string' ? config.serverName : null;
      return { entryId: row.entryId, id: row.patchId ?? row.entryId, name, transport: config.transport ?? null,
        target: config.transport === 'stdio' ? [config.command, ...config.args ?? []].filter(Boolean).join(' ') : config.url ?? null,
        enabled: row.enabled, phase: row.fiberPhase, readOnly: !!row.readOnlyReason, tools: name ? this.visibleTools(name) : [] };
    });
  }
  async list() {
    await this.sync();
    const servers = [...this.servers.values()].map(server => {
      const record = this.records.get(server.name);
      const status = server.invalid ? 'invalid' : !server.enabled ? 'disabled' : record?.status ?? 'starting';
      const visible = record?.status === 'connected' ? this.visibleTools(server.name) : [];
      const hidden = new Set(server.disabledTools);
      const known = new Map((this.toolCache.get(server.name) ?? []).map(tool => [tool.name, tool]));
      for (const tool of visible) known.set(tool.name, tool);
      return { name: server.name, transport: server.transport ?? null, status, error: server.invalid ?? record?.error ?? null,
        target: server.transport === 'stdio' ? [server.command, ...server.args].join(' ') : server.url ?? null,
        envKeys: Object.keys(server.env ?? {}), headerKeys: Object.keys(server.headers ?? {}), timeoutMs: server.timeoutMs ?? null,
        connectedAt: record?.connectedAt ?? null,
        tools: [...known.values()].sort((a, b) => a.name.localeCompare(b.name)).map(tool => ({ ...tool, enabled: !hidden.has(tool.name) })) };
    });
    return { file: tilde(this.file), error: this.fileError, servers, managed: await this.managed().catch(() => []) };
  }
  async server(name) {
    await this.sync();
    const server = this.servers.get(name);
    if (!server) fail('server-missing', `No MCP server named ${name}`, { name }, 404);
    if (server.invalid) {
      const raw = (await this.readDocument()).mcpServers[name];
      return { name, raw };
    }
    return { name, raw: serializeServer(server) };
  }
  /** Read-modify-write the current file so hand edits made meanwhile survive. */
  edit(change) {
    if (this.closed) return Promise.reject(new Error('Extensions service is stopped'));
    return this.serial(async () => {
      let document;
      try { document = await this.readDocument(); }
      catch { fail('mcp-file-invalid', 'mcp.json cannot be parsed; fix or remove it first', { file: this.file }); }
      change(document.mcpServers);
      await writeAtomic(this.file, JSON.stringify(document, null, 2) + '\n');
    }).then(() => this.sync({ force: true }));
  }
  save({ name, previous, server }) {
    const normalized = normalizeServer(name, server);
    return this.edit(servers => {
      if (name !== previous && servers[name] !== undefined) fail('server-exists', `A server named ${name} already exists`, { name }, 409);
      const old = previous !== undefined && servers[previous] && typeof servers[previous] === 'object' ? servers[previous] : undefined;
      if (previous !== undefined && previous !== name) delete servers[previous];
      // The form edits the connection; the list switches stay as they were.
      servers[name] = serializeServer({ ...normalized, enabled: old ? old.disabled !== true : normalized.enabled,
        disabledTools: Array.isArray(old?.disabledTools) ? old.disabledTools : normalized.disabledTools });
    });
  }
  remove(name) { return this.edit(servers => { delete servers[name]; }); }
  setEnabled(name, enabled) {
    return this.edit(servers => {
      if (!servers[name]) fail('server-missing', `No MCP server named ${name}`, { name }, 404);
      if (enabled) delete servers[name].disabled; else servers[name].disabled = true;
    });
  }
  setTool(name, tool, enabled) {
    return this.edit(servers => {
      const entry = servers[name];
      if (!entry) fail('server-missing', `No MCP server named ${name}`, { name }, 404);
      const set = new Set(Array.isArray(entry.disabledTools) ? entry.disabledTools : []);
      if (enabled) set.delete(tool); else set.add(tool);
      if (set.size) entry.disabledTools = [...set].sort(); else delete entry.disabledTools;
    });
  }
  importJson(text) {
    let value;
    try { value = JSON.parse(text); } catch (error) { fail('invalid-json', `Invalid JSON: ${error.message}`); }
    const entries = value?.mcpServers && typeof value.mcpServers === 'object' ? value.mcpServers : value;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries) || !Object.keys(entries).length) fail('invalid-import', 'Paste an mcpServers object');
    const normalized = Object.entries(entries).map(([name, raw]) => normalizeServer(name, raw));
    return this.edit(servers => {
      for (const server of normalized) {
        if (servers[server.name] !== undefined) fail('server-exists', `A server named ${server.name} already exists`, { name: server.name }, 409);
      }
      for (const server of normalized) servers[server.name] = serializeServer(server);
    }).then(() => normalized.map(server => server.name));
  }
  async reconnect(name) {
    await this.serial(async () => {
      const server = this.servers.get(name);
      if (!server || server.invalid || !server.enabled) fail('server-missing', `No enabled MCP server named ${name}`, { name }, 404);
      await this.stop(name);
      this.launch(server);
    });
  }
  async setManaged(entryId, enabled) {
    const manager = this.ctx.get('pluginManager');
    if (!manager) fail('plugin-manager-unavailable', 'The DSH plugin manager is not available', {}, 503);
    return manager.setPluginEnabled(entryId, enabled === true);
  }
}
