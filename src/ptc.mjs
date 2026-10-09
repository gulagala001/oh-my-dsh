export const name = 'omd-ptc-presentation';
export const inject = ['tools', 'ptcRuntime', 'trisoulX'];

// Keep the host's registry, SDK and scheduler. Only this preset's wire catalog
// and model-direct gate differ from native `both`; nested SDK calls remain
// visible and execute through the original policy and hooks.
export function installPtcPresentation(ctx, directTools = () => []) {
  const sampled = new WeakMap();
  ctx.tools.presentAs('both');
  const sample = agent => {
    const requested = directTools(agent);
    const visible = new Set(ctx.tools.schemas(agent).map(tool => tool.name));
    const names = new Set(['run_code', ...requested.filter(name => visible.has(name))]);
    sampled.set(agent, names);
    return names;
  };
  const reason = exec => exec.parent !== undefined || exec.name === 'run_code'
    || sampled.get(exec.agent)?.has(exec.name) ? undefined
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
    const names = sample(context.agent), controls = [...names].filter(name => name !== 'run_code');
    const text = controls.length
      ? `Use run_code and the tools SDK for business operations. These control tools are also callable directly: ${controls.join(', ')}. All other tools require run_code.`
      : '`run_code` is the only tool you can call directly — a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.';
    return { ...assembly, tools: assembly.tools.filter(tool => names.has(tool.name)),
      sections: assembly.sections.map(section => section.name === 'tools:ptc-only' ? { ...section, text } : section) };
  });
  return { sample };
}

export function apply(ctx) {
  installPtcPresentation(ctx, agent => {
    ctx.trisoulX.prepareBackground(agent);
    return ctx.trisoulX.backgroundOptions(agent).interruptibleWait
      ? ['job_output', 'job_list', 'job_kill', 'runtime_status'] : [];
  });
}
