import { hash } from './evidence.mjs';
const optional = name => /^mcp__/.test(name) && !/codegraph_explore$/.test(name) || /^opencu_/.test(name);
export function installCatalog(ctx, hub) {
  const loaded = new WeakMap();
  const chosen = agent => { if (!loaded.has(agent)) loaded.set(agent, new Set()); return loaded.get(agent); };
  ctx.tools.register({ name: 'tool_find', description: 'Discover scoped optional MCP and computer diagnostic tools by name or purpose. Returns their exact schemas and enables them for the next request. Normal tools and the PTC SDK remain available.',
    parameters: { type: 'object', additionalProperties: false, properties: { query: { type: 'string', maxLength: 256 }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 8 } }, required: ['query'] },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute({ query, offset = 0, limit = 4 }, { agent }) {
      if (typeof query !== 'string' || !query.trim() || query.length > 256 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 8) throw Error('需要有效 query、offset 和 limit');
      const terms = query.toLowerCase().split(/\s+/), schemas = ctx.tools.schemas(agent).filter(t => optional(t.name));
      const matched = schemas.filter(t => terms.every(term => (t.name + ' ' + t.description).toLowerCase().includes(term)));
      const tools = matched.slice(offset, offset + limit), names = chosen(agent);
      for (const tool of tools) names.add(tool.name);
      return JSON.stringify({ available: schemas.length, matched: matched.length, tools, ...(offset + limit < matched.length ? { nextOffset: offset + limit } : {}) });
    },
  });
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    const assembly = await next(), agent = context?.agent;
    if (!agent || !hub.optimization?.enabled(agent.session) || ctx.tools.modeFor(agent) !== 'native') return assembly;
    const names = chosen(agent), base = assembly.tools.filter(t => !optional(t.name)), extras = [];
    for (const name of names) { const tool = assembly.tools.find(t => t.name === name); if (tool) extras.push(tool); }
    const tools = [...base, ...extras], admitted = new Set(tools.map(t => t.name));
    const hidden = assembly.tools.filter(t => !admitted.has(t.name));
    if (!hidden.length) return assembly;
    hub.optimization.schemaSavings.set(hash(tools), Math.max(0, Math.floor((Buffer.byteLength(JSON.stringify(assembly.tools)) - Buffer.byteLength(JSON.stringify(tools)) - 400) / 3)));
    if (hub.optimization.schemaSavings.size > 128) hub.optimization.schemaSavings.delete(hub.optimization.schemaSavings.keys().next().value);
    return { ...assembly, tools, sections: [...assembly.sections.filter(s => !s.name.startsWith('tool:') || !hidden.some(t => s.name === 'tool:' + t.name)),
      { name: 'omd:tool-discovery', order: 81, text: `${hidden.length} optional tools are discoverable with tool_find(query). Search by service name or task. Discovery returns exact current schemas; permissions and tool execution are unchanged.`, interpolate: false }] };
  });
}
