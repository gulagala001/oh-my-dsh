import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';

export const inject = ['trisoulX', 'tools', 'systemPrompt'];
export const CODEGRAPH_GUIDE = `CodeGraph is bundled with Oh My DSH. Use codegraph_index when the user requests an index for a project; no global CLI installation or agent setup is needed. It creates the project's .codegraph directory. Query paths default to this session's working directory; relative projectPath values resolve against it. Indexed projects have live synchronization while connected; idle connections close and catch up on the next query. If indexing or a query fails, report the error and continue with the ordinary file/search tools where appropriate.`;

export async function apply(ctx) {
  const runtime = ctx.trisoulX.codegraph;
  ctx.tools.register({
    name: 'codegraph_index',
    description: 'Initialize and build a local CodeGraph index when the user asks to index a project. Existing indexes are incrementally synchronized. Queries then synchronize edits automatically. Uses the bundled runtime; no global installation needed.',
    parameters: { type: 'object', properties: { projectPath: { type: 'string', description: 'Project directory, defaults to the session working directory.' } } },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute: (args, { agent, signal }) => runtime.index(args, { cwd: agent.session.header.cwd, signal }),
  });
  const { tools } = await runtime.catalog();
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
  ctx.systemPrompt.section({ name: 'trisoul-x:codegraph', order: 80, interpolate: false,
    text: CODEGRAPH_GUIDE });
}
