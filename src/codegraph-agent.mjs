import { checkedTool } from './tool-contract.mjs';
import { currentDirectory } from './working-directory.mjs';
import { codegraphCatalogOwner } from './codegraph-agent-lifecycle.mjs';

export const inject = ['omd', 'tools', 'systemPrompt'];
export const CODEGRAPH_GUIDE = `The current project is indexed automatically; a first query may wait for preparation. Use mcp__codegraph__codegraph_explore for symbol/call-path questions, mcp__codegraph__codegraph_search for search, and mcp__codegraph__codegraph_files to locate files when declared. codegraph_index refreshes or rebuilds the project's .codegraph index; no global CLI setup is needed. Relative projectPath defaults to the session directory. If indexing or a query fails, report the error and use ordinary file/search tools. Saved symbols do not replace current-file reads before editing.`;
export const CODEGRAPH_DISABLED_GUIDE = 'CodeGraph is disabled in component settings. Use the ordinary file and search tools. Do not start or query CodeGraph unless the user enables it.';

const exploreRead = 'For read-only questions, use the displayed symbols without reopening them. Before modifying source, follow the read requirements of the file tool you will use; indexed symbols are not an exact current file snapshot.';
// Replace only the known upstream advisory lines, never text inside a source block.
export function exploreResult(result) {
  if (result?.isError || !Array.isArray(result?.content)) return result;
  return { ...result, content: result.content.map(block => {
    if (block.type !== 'text') return block;
    let fence = '';
    const text = block.text.split('\n').map(line => {
      const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (delimiter && delimiter[1].startsWith(fence) && /^[ \t]*$/.test(delimiter[2])) fence = '';
        return line;
      }
      if (delimiter && (delimiter[1][0] === '~' || !delimiter[2].includes('`'))) { fence = delimiter[1]; return line; }
      if (line.startsWith('> The code below is the **verbatim, current on-disk source**') && line.includes('do not Read a file shown here')) return '> ' + exploreRead;
      if (/^> \*\*Complete source for \d+ files? is included above/.test(line) && line.includes('do NOT re-read')) return '> Use the displayed symbols for exploration. For file changes follow the read requirements in the tool declaration.';
      return line;
    }).join('\n');
    return text === block.text ? block : { ...block, text };
  }) };
}

export async function apply(ctx) {
  const runtime = ctx.omd.codegraph, owner = codegraphCatalogOwner(ctx);
  if (!owner.active()) return;
  ctx.tools.register(checkedTool({
    name: 'codegraph_index',
    description: 'Refresh or rebuild a local CodeGraph index. The current project is prepared automatically by default. Existing indexes are incrementally synchronized. Queries then synchronize edits automatically. Uses the bundled runtime; no global installation needed.',
    parameters: { type: 'object', properties: { projectPath: { type: 'string', description: 'Project directory, defaults to the session working directory.' } } },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute: (args, { agent, signal }) => {
      if (runtime.enabled === false) throw new Error('CodeGraph 已关闭。');
      return runtime.index(args, { cwd: currentDirectory(ctx, agent.session), signal });
    },
  }));
  let loaded = false, attempted = -1, loading;
  const registered = new Set();
  const load = () => {
    if (!owner.active() || loaded) return;
    if (loading) return loading;
    if (attempted === runtime.catalogRevision || !runtime.status().installed) return;
    const revision = runtime.catalogRevision;
    attempted = revision;
    loading = owner.track((async () => {
      let tools, createMcpToolDefinition;
      try { ({ tools, createMcpToolDefinition } = await owner.wait(runtime.catalog())); }
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
          description: tool.name === 'codegraph_explore' ? 'Explore relevant source symbols and their call paths by question, symbol or filename. ' + exploreRead : tool.description, inputSchema: parameters, outputSchema: tool.outputSchema,
          async call(args, { agent, signal }) {
            const result = await runtime.call(tool.name, args, { cwd: currentDirectory(ctx, agent.session), signal,
              sessionKey: ctx.omd.optimization?.graphScope(agent) ?? agent.session.id });
            return tool.name === 'codegraph_explore' ? exploreResult(result) : result;
          },
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
  ctx.systemPrompt.section({ name: 'oh-my-dsh:codegraph', order: 80, interpolate: false,
    text: CODEGRAPH_GUIDE });
  if (!owner.active()) return;
  ctx.on?.('system-prompt/assemble', async (_initial, _context, next) => {
    const assembly = await next();
    if (runtime.enabled !== false) return assembly;
    return { ...assembly, sections: assembly.sections.map(section => section.name === 'oh-my-dsh:codegraph'
      ? { ...section, text: CODEGRAPH_DISABLED_GUIDE } : section) };
  });
  // Disabled presets still acquire metadata/guide, but cold session creation
  // and ordinary disabled steps never wait for the optional catalog process.
  if (runtime.enabled === false) void load();
  else await refresh();
}
