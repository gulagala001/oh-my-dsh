import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';

export const inject = ['trisoulX', 'tools', 'systemPrompt'];
export const CODEGRAPH_GUIDE = `CodeGraph is bundled with Oh My DSH and enabled by default. The current project is indexed automatically in the background; a first query waits for preparation when needed. Use codegraph_index to refresh or rebuild a project's index. It creates the project's .codegraph directory; no global CLI installation or agent setup is needed. Query paths default to this session's working directory; relative projectPath values resolve against it. Indexed projects have live synchronization while connected; idle connections close and catch up on the next query. If indexing or a query fails, report the error and continue with the ordinary file/search tools where appropriate. Component status and switches are in the basic components settings.`;
export const CODEGRAPH_DISABLED_GUIDE = 'CodeGraph is disabled in component settings. Use the ordinary file and search tools. Do not start or query CodeGraph unless the user enables it.';

export async function apply(ctx) {
  const runtime = ctx.trisoulX.codegraph;
  ctx.tools.register({
    name: 'codegraph_index',
    description: 'Refresh or rebuild a local CodeGraph index. The current project is prepared automatically by default. Existing indexes are incrementally synchronized. Queries then synchronize edits automatically. Uses the bundled runtime; no global installation needed.',
    parameters: { type: 'object', properties: { projectPath: { type: 'string', description: 'Project directory, defaults to the session working directory.' } } },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute: (args, { agent, signal }) => runtime.index(args, { cwd: agent.session.header.cwd, signal }),
  });
  let loaded = false, attempted = -1, disposed = false;
  ctx.effect?.(() => () => { disposed = true; });
  const load = async () => {
    if (loaded || disposed || attempted === runtime.catalogRevision || !runtime.status().installed) return;
    attempted = runtime.catalogRevision;
    let tools;
    try { ({ tools } = await runtime.catalog()); }
    catch (error) { ctx.logger?.warn?.('CodeGraph: ' + error.message); return; }
    if (disposed) return;
    for (const tool of tools) {
    // The catalog probe has no default project, so upstream marks projectPath
    // required. Here the execution's session supplies that default instead.
    const parameters = { ...tool.inputSchema, required: (tool.inputSchema.required || []).filter(key => key !== 'projectPath') };
    ctx.tools.register(createMcpToolDefinition(ctx, {
      name: `mcp__codegraph__${tool.name}`, rawName: tool.name,
      description: tool.description, inputSchema: parameters, outputSchema: tool.outputSchema,
      call: (args, { agent, signal }) => runtime.call(tool.name, args, { cwd: agent.session.header.cwd, signal }),
    }));
    }
    loaded = true;
  };
  await load();
  ctx.on?.('agent/pre-step', async (_event, next) => { await load(); return next(); });
  ctx.systemPrompt.section({ name: 'trisoul-x:codegraph', order: 80, interpolate: false,
    text: CODEGRAPH_GUIDE });
  ctx.on?.('system-prompt/assemble', async (_initial, _context, next) => {
    const assembly = await next();
    if (runtime.enabled !== false) return assembly;
    return { ...assembly, sections: assembly.sections.map(section => section.name === 'trisoul-x:codegraph'
      ? { ...section, text: CODEGRAPH_DISABLED_GUIDE } : section) };
  });
}
