import { installPtcControlCompatibility, isPtcControl } from './ptc-control-compat.mjs';

export const name = 'omd-ptc-presentation';
export const inject = ['tools', 'ptcRuntime', 'trisoulX', 'loader'];

// Keep the host's registry, SDK and scheduler. Only this preset's wire catalog
// and model-direct gate follow the matching host contract; nested SDK calls remain
// visible and execute through the original policy and hooks.
export function installPtcPresentation(ctx, directTools = () => [], mode = 'ptc', runtime = ctx.tools, scopes) {
  if (typeof scopes?.scopeOf !== 'function' || typeof scopes?.scopeChainOf !== 'function')
    throw new Error('The matching DSH scope component is required for PTC presentation');
  const owner = scopes.scopeOf(ctx);
  if (owner === undefined) throw new Error('PTC presentation requires its owning preset scope');
  const owns = agent => agent !== undefined && scopes.scopeChainOf(agent).includes(owner);
  const sampled = new WeakMap();
  const admitted = (agent, name) => owns(agent) && sampled.get(agent)?.has(name) === true
    && sampled.get(agent).get(name) === ctx.tools.get(name, agent);
  if (mode === 'ptc') installPtcControlCompatibility(ctx, runtime, admitted);
  ctx.tools.presentAs(mode);
  const sample = agent => {
    if (!owns(agent)) { sampled.delete(agent); return new Set(); }
    if (runtime.modeFor(agent) === 'native') {
      sampled.delete(agent);
      return new Set(ctx.tools.schemas(agent).map(tool => tool.name));
    }
    const requested = directTools(agent).filter(isPtcControl);
    const visible = new Set(ctx.tools.schemas(agent).map(tool => tool.name));
    const names = new Set(['run_code', ...requested.filter(name => visible.has(name))]);
    sampled.set(agent, new Map([...names].map(name => [name, ctx.tools.get(name, agent)])));
    if (runtime.modeFor(agent) === 'ptc') for (const name of names) {
      if (name === 'run_code' || runtime.collapses(name, agent, false) === false) continue;
      sampled.delete(agent);
      throw Object.assign(new Error(`The DSH tools component cannot present direct PTC control "${name}" in this agent scope`),
        { code: 'PTC_CONTROL_COMPAT_UNSUPPORTED' });
    }
    return names;
  };
  const reason = exec => !owns(exec.agent) || runtime.modeFor(exec.agent) === 'native' || exec.parent !== undefined || exec.name === 'run_code'
    || admitted(exec.agent, exec.name) ? undefined
    : `unknown tool "${exec.name}": use run_code and the tools SDK to call this tool`;
  // Reject before ordinary approval middleware; the monotonic guard also
  // keeps another pre-policy's short circuit from permitting a direct call.
  ctx.on('tools/pre-execute', (exec, next) => {
    const denied = reason(exec);
    return denied === undefined ? next() : { kind: 'deny', reason: denied, info: { code: 'UNKNOWN_TOOL' } };
  }, { prepend: true });
  ctx.tools.guard(reason);
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembly = await next();
    if (!context?.agent) return assembly;
    if (!owns(context.agent)) { sampled.delete(context.agent); return assembly; }
    if (runtime.modeFor(context.scope ?? context.agent) === 'native') {
      sampled.delete(context.agent);
      return assembly;
    }
    const names = sample(context.agent), controls = [...names].filter(name => name !== 'run_code');
    const schemas = new Map(assembly.tools.map(tool => [tool.name, tool]));
    for (const schema of ctx.tools.schemas(context.agent)) if (names.has(schema.name) && !schemas.has(schema.name)) schemas.set(schema.name, schema);
    const text = controls.length
      ? `Use run_code and the tools SDK for business operations. These control tools are also callable directly: ${controls.join(', ')}. All other tools require run_code.`
      : '`run_code` is the only tool you can call directly — a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.';
    return { ...assembly, tools: [...schemas.values()].filter(tool => names.has(tool.name)),
      sections: assembly.sections.map(section => section.name === 'tools:ptc-only' ? { ...section, text } : section) };
  });
  return { sample };
}

export async function apply(ctx) {
  const entry = [...ctx.loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-tools');
  if (!entry) throw new Error('The matching DSH tools component is missing');
  const module = await entry.parent.tree.import('@deepseek-ai/dsh-tools');
  const { symbols } = await entry.parent.tree.import('@deepseek-ai/cordis');
  const scopes = await entry.parent.tree.import('@deepseek-ai/dsh-scope');
  const runtime = ctx.tools[symbols.original] ?? ctx.tools;
  if (!(runtime instanceof (module.ToolRuntime ?? module.default))) throw new Error('The active tools registry does not match its DSH component');
  const modes = (module.ToolRuntime ?? module.default)?.Config?.dict?.mode?.list?.map(choice => choice.value);
  if (!Array.isArray(modes) || !modes.includes('native') || !modes.includes('ptc')) throw new Error('The DSH tools component did not expose its presentation modes');
  const mode = modes.includes('both') ? 'both' : 'ptc';
  installPtcPresentation(ctx, agent => {
    ctx.trisoulX.prepareBackground(agent);
    return ctx.trisoulX.backgroundOptions(agent).interruptibleWait
      ? ['job_output', 'job_list', 'job_kill', 'runtime_status'] : [];
  }, mode, runtime, scopes);
}
