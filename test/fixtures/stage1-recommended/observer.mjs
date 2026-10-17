// Read only published native registries. AgentRegistry.get is the alpha.2 live
// registry peek, not SessionController.resolveAgent or persistence write-open.
export const inject = ['loader', 'webServer', 'connection', 'tools', 'agents', 'sessions'];
export function apply(ctx, config) {
  const created = [], modelAttempts = [];
  ctx.on('agent/created', ({ agent }) => { created.push(agent.id); }, { global: true });
  // Record before the shared fixture's model guard: even a refused/unconfigured
  // model attempt is activity, never a successful zero-request cold read.
  ctx.on('llm/stream', (request, next) => { modelAttempts.push({ sessionId: request.sessionId, provider: request.provider, model: request.model }); return next(); }, { global: true, prepend: true });
  const peek = id => id ? ctx.agents.get(id) : undefined;
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/stage1-recommended-observer', async handler(req, res) {
    const rejected = ctx.connection.requestRejection(req);
    if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    const send = value => { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const query = new URL(req.url, 'http://localhost').searchParams, id = query.get('session'), hub = ctx.get('trisoulX');
      if (query.has('browser')) { send({ origin: 'http://' + req.headers.host, cookie: req.headers.cookie }); return; }
      if (query.has('settled') && hub?.dream) { await hub.dream.ready; await hub.dream.ticking; await hub.dream.draining; }
      const agent = peek(id), session = agent?.session ?? (id ? ctx.sessions.get(id) : undefined);
      const residency = { sessionId: id, agentAttached: Boolean(agent), sessionAttached: Boolean(session), created: [...created], modelAttempts: [...modelAttempts],
        omdStored: Boolean(id && hub?.store.peek(id)), omdCacheHas: Boolean(id && hub?.store.states.has(id)),
        contextCacheHas: Boolean(id && hub?.context.store.cache.has(id)) };
      // No tool/skill scope resolution, Controller inspection or hidden session
      // hydration is allowed in this branch used before and after cold HTTP reads.
      if (query.has('residency')) { send(residency); return; }
      const entries = [...ctx.loader.entries()], hostEntry = entries.find(row => row.options.name === '@deepseek-ai/dsh-tools');
      if (!hostEntry) throw Error('Actual native tools loader entry is missing');
      const native = await hostEntry.parent.tree.import('@deepseek-ai/dsh-tools'), cordis = await hostEntry.parent.tree.import('@deepseek-ai/cordis');
      const owners = {};
      for (const owner of config.owners) {
        const matches = entries.filter(row => row.options.name === owner.name || row.options.name?.startsWith(owner.name + '/') || owner.entryIds?.includes(row.options.id));
        owners[owner.name] = await Promise.all(matches.map(async entry => {
          const peers = {};
          for (const peer of config.peers) {
            try { peers[peer] = { namespaceEqual: await entry.parent.tree.import(peer) === await hostEntry.parent.tree.import(peer) }; }
            catch (error) { peers[peer] = { error: error.message }; }
          }
          return { entry: entry.options.name, id: entry.options.id, peers };
        }));
      }
      const skills = ctx.get('skills') ?? ctx.get('skill'), lookup = { cwd: session?.header.cwd, scope: agent };
      const catalog = skills?.list ? await skills.list(lookup) : [], definitions = {};
      // Full invocation-neutral metadata stays intact. Only an explicit warm
      // body-read query loads definitions; neither cold residency nor discovery
      // can execute a skill or manufacture its model/user invocation evidence.
      if (query.has('definitions')) {
        if (!agent || !session) throw Error('Skill definition observation requires an intentionally active native session');
        const sdk = await hostEntry.parent.tree.import('@deepseek-ai/dsh-skill');
        const names = JSON.parse(query.get('definitions'));
        if (!Array.isArray(names) || names.some(name => typeof name !== 'string')) throw Error('Invalid skill definition observation request');
        for (const name of names) {
          const summary = catalog.find(row => row.name === name);
          if (!summary) throw Error('Actual skill summary missing: ' + name);
          if (!sdk.isModelInvocable(summary) && !sdk.isUserInvocable(summary)) continue;
          const definition = await skills.get(name, lookup);
          if (!definition) throw Error('Actual skill definition missing: ' + name);
          definitions[name] = { ...definition, canonical: sdk.renderSkillContent(definition) };
        }
      }
      send({ ...residency, nativeToolRuntime: (ctx.tools[cordis.symbols.original] || ctx.tools) instanceof native.ToolRuntime,
        owners, entries: entries.map(row => ({ name: row.options.name, id: row.options.id })), tools: ctx.tools.schemas(agent), skills: catalog, skillDefinitions: definitions,
        services: Object.fromEntries(config.services.map(name => [name, Boolean(ctx.get(name))])),
        agent: agent && { id: agent.id, status: agent.status }, header: session?.header, events: session?.snapshotEvents() ?? [],
        omdDirectory: hub?.store.dir ?? null, persistenceDirectory: ctx.get('sessionPersistence')?.root ?? null });
    } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  } }));
}
