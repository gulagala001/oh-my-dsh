import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import { currentDirectory } from './working-directory.mjs';
import { codegraphCatalogOwner } from './codegraph-agent-lifecycle.mjs';

export const inject = ['trisoulX', 'tools', 'systemPrompt'];
export const CODEGRAPH_GUIDE = `CodeGraph is bundled with Oh My DSH and enabled by default. The current project is indexed automatically in the background; a first query waits for preparation when needed. Use codegraph_index to refresh or rebuild a project's index. It creates the project's .codegraph directory; no global CLI installation or agent setup is needed. Query paths default to this session's working directory; relative projectPath values resolve against it. Indexed projects have live synchronization while connected; idle connections close and catch up on the next query. If indexing or a query fails, report the error and continue with the ordinary file/search tools where appropriate. Component status and switches are in the basic components settings.`;
export const CODEGRAPH_DISABLED_GUIDE = 'CodeGraph is disabled in component settings. Use the ordinary file and search tools. Do not start or query CodeGraph unless the user enables it.';

export async function apply(ctx) {
  const runtime = ctx.trisoulX.codegraph, owner = codegraphCatalogOwner(ctx);
  if (!owner.active()) return;
  ctx.tools.register({
    name: 'codegraph_index',
    description: 'Refresh or rebuild a local CodeGraph index. The current project is prepared automatically by default. Existing indexes are incrementally synchronized. Queries then synchronize edits automatically. Uses the bundled runtime; no global installation needed.',
    parameters: { type: 'object', properties: { projectPath: { type: 'string', description: 'Project directory, defaults to the session working directory.' } } },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute: (args, { agent, signal }) => {
      if (runtime.enabled === false) throw new Error('CodeGraph 已关闭。');
      return runtime.index(args, { cwd: currentDirectory(ctx, agent.session), signal });
    },
  });
  let loaded = false, attempted = -1, loading;
  const registered = new Set();
  const load = () => {
    if (!owner.active() || loaded) return;
    if (loading) return loading;
    if (attempted === runtime.catalogRevision || !runtime.status().installed) return;
    const revision = runtime.catalogRevision;
    attempted = revision;
    loading = owner.track((async () => {
      let tools;
      try { ({ tools } = await owner.wait(runtime.catalog({ signal: owner.signal }))); }
      catch (error) { if (owner.active()) ctx.logger?.warn?.('CodeGraph: ' + error.message); return; }
      if (!owner.active() || runtime.catalogRevision !== revision) return;
      for (const tool of tools) {
        if (!owner.active()) return;
        if (registered.has(tool.name)) continue;
        // The catalog probe has no default project, so upstream marks projectPath
        // required. Here the execution's session supplies that default instead.
        const parameters = { ...tool.inputSchema, required: (tool.inputSchema.required || []).filter(key => key !== 'projectPath') };
        const definition = createMcpToolDefinition(ctx, {
          name: `mcp__codegraph__${tool.name}`, rawName: tool.name,
          description: tool.description, inputSchema: parameters, outputSchema: tool.outputSchema,
          call: (args, { agent, signal }) => runtime.call(tool.name, args, { cwd: currentDirectory(ctx, agent.session), signal }),
        });
        if (!owner.active()) return;
        ctx.tools.register(definition);
        registered.add(tool.name);
      }
      if (owner.active()) loaded = true;
    })().catch(error => { if (owner.active()) ctx.logger?.warn?.('CodeGraph: ' + error.message); })
      .finally(() => { loading = undefined; }));
    return loading;
  };
  const refresh = async () => {
    await load();
    // Re-enable/retry may invalidate an in-flight disabled metadata probe.
    if (owner.active() && runtime.enabled !== false && attempted !== runtime.catalogRevision) await load();
  };
  if (!owner.active()) return;
  ctx.on?.('agent/pre-step', async (_event, next) => {
    if (runtime.enabled !== false) await refresh();
    return next();
  });
  if (!owner.active()) return;
  ctx.systemPrompt.section({ name: 'trisoul-x:codegraph', order: 80, interpolate: false,
    text: CODEGRAPH_GUIDE });
  if (!owner.active()) return;
  ctx.on?.('system-prompt/assemble', async (_initial, _context, next) => {
    const assembly = await next();
    if (runtime.enabled !== false) return assembly;
    return { ...assembly, sections: assembly.sections.map(section => section.name === 'trisoul-x:codegraph'
      ? { ...section, text: CODEGRAPH_DISABLED_GUIDE } : section) };
  });
  // Disabled presets still acquire metadata/guide, but cold session creation
  // and ordinary disabled steps never wait for the optional catalog process.
  if (runtime.enabled === false) void load();
  else await refresh();
}
