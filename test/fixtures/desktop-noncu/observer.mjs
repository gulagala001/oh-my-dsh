// Read-only observations of the official Loader/Session/ToolRuntime. No host
// services, provider implementations or tool execution functions are replaced.
export const inject = ['loader', 'webServer', 'connection', 'tools', 'agents', 'sessions'];
export function apply(ctx, config) {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/__desktop-noncu', async handler(req, res) {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost'), id = url.searchParams.get('session');
      const entries = [...ctx.loader.entries()];
      const nativeEntry = entries.find(row => row.options.name === '@deepseek-ai/dsh-api-session-controller' && row.fiber);
      if (!nativeEntry) throw Error('Actual public SessionController entry missing');
      const native = await nativeEntry.parent.tree.import('@deepseek-ai/dsh-tools');
      const cordis = await nativeEntry.parent.tree.import('@deepseek-ai/cordis');
      const owners = {};
      for (const entry of entries.filter(row => row.fiber && (row.options.name === 'trisoul_x' || row.options.name?.startsWith('trisoul_x/')))) {
        const peers = owners[entry.options.name] = {};
        for (const name of config.peers) peers[name] = await entry.parent.tree.import(name) === await nativeEntry.parent.tree.import(name);
      }
      const agent = id && ctx.agents.get(id);
      const inspection = id && await ctx.get('sessionController').inspect(id);
      const schemas = ctx.tools.schemas(agent || undefined);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ entries: entries.map(row => ({ name: row.options.name, active: Boolean(row.fiber) })), owners,
        nativeToolRuntime: (ctx.tools[cordis.symbols.original] || ctx.tools) instanceof native.ToolRuntime,
        agent: agent ? { id: agent.id, status: agent.status } : null,
        header: inspection?.meta, events: inspection?.events ?? [], tools: schemas,
        computerUseEnabled: ctx.get('trisoulX')?.config?.().computerUseEnabled ?? null }));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message }));
    }
  } }));
}
