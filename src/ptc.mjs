export const name = 'omd-ptc-presentation';
export const inject = ['tools', 'ptcRuntime', 'trisoulX'];
export function apply(ctx) {
  ctx.tools.presentAs('ptc', { directTools: agent => {
    ctx.trisoulX.prepareBackground(agent);
    return ctx.trisoulX.backgroundOptions(agent).interruptibleWait
      ? ['job_output', 'job_list', 'job_kill', 'runtime_status'] : [];
  } });
}
