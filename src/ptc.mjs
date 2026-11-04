import { setPresentedExecutor } from './host/prompt-provider.mjs';
import { projectToolDeclarations } from './cc-adaptation/adapter.mjs';
import { readFile } from 'node:fs/promises';
import { loadHostModule } from './host-component.mjs';
import { createModule } from '../lib/host/ptc-native.factory.mjs';
import { isPtcControl } from './ptc-control-compat.mjs';
export const name = 'omd-ptc-presentation';
export const inject = ['tools', 'systemPrompt', 'ptcRuntime', 'omd', 'loader'];

// Keep the reviewed native batch scheduler, transport, language SDK,
// cancellation and tool-set admission. Only direct controls are added.
export function installPtcPresentation(ctx, Executor, directTools, scopes) {
  const owner = scopes.scopeOf(ctx), sampled = new WeakMap();
  if (owner === undefined) throw Error('PTC requires its owning preset scope');
  const owns = agent => agent !== undefined && scopes.scopeChainOf(agent).includes(owner);

  const sample = (agent, toolSet) => {
    const requested = directTools(agent).filter(isPtcControl);
    const visible = new Map(ctx.tools.definitions(agent, toolSet).map(tool => [tool.name, tool]));
    const entries = requested.filter(name => visible.has(name)).map(name => [name, visible.get(name)]);
    sampled.set(agent, new Map(entries));
    return new Set(['run_code', ...entries.map(([name]) => name)]);
  };
  ctx.tools.guard(exec => {
    if (!owns(exec.agent) || exec.parent !== undefined || exec.name === 'run_code') return;
    const admitted = sampled.get(exec.agent);
    if (admitted?.has(exec.name) && admitted.get(exec.name) === ctx.tools.get(exec.name, exec.agent, exec.toolSet)) return;
    return `unknown tool "${exec.name}": use run_code and the tools SDK to call this tool`;
  });
  const delegate = new Executor(ctx);
  setPresentedExecutor(ctx, delegate, (model, definitions, context) => {
    const agent = context.agent ?? context.scope, names = sample(agent, context.toolSet);
    const projected = projectToolDeclarations(ctx, { ...model, schemas: model.schemas.filter(tool => names.has(tool.name)) }, definitions, context);
    const timeout = ctx.get('ptcRuntime')?.timeout;
    if (timeout && ctx.omd.config().ptcAdaptiveBudgets !== false) projected.schemas = projected.schemas.map(tool => tool.name === 'run_code' && tool.parameters?.properties?.timeoutMs
      ? { ...tool, parameters: { ...tool.parameters, properties: { ...tool.parameters.properties, timeoutMs: { ...tool.parameters.properties.timeoutMs,
        description: `When omitted, the ${timeout.defaultMs}ms default can extend for nested tool budgets up to ${timeout.maxMs}ms; an explicit timeoutMs remains a hard limit. Cancellation and cleanup stay active.` } } } } : tool);
    return projected;
  });
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembly = await next(), agent = context?.agent ?? context?.scope;
    if (!owns(agent)) return assembly;
    const controls = [...(sampled.get(agent)?.keys() ?? [])];
    const text = controls.length
      ? `Use run_code and the tools SDK for business operations. These control tools are also callable directly: ${controls.join(', ')}. All other tools require run_code.`
      : '`run_code` is the only tool you can call directly. Reach other tools through the program SDK.';
    return { ...assembly, sections: assembly.sections.map(section => section.name === 'tools:ptc-only' ? { ...section, text } : section) };
  });
  return { sample };
}
export async function apply(ctx) {
  const entry = [...ctx.loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-tools');
  if (!entry) throw Error('The matching native tool registry is missing');
  const specs = JSON.parse(await readFile(new URL('../lib/host/ptc-native.dependencies.json', import.meta.url), 'utf8'));
  const { PtcExecutor } = await loadHostModule(ctx, 'tools', createModule, specs);
  const scopes = await entry.parent.tree.import('@deepseek-ai/dsh-scope');
  installPtcPresentation(ctx, PtcExecutor, agent => {
    ctx.omd.prepareBackground(agent);
    return ctx.omd.backgroundOptions(agent).interruptibleWait ? ['job_output', 'job_list', 'job_kill', 'runtime_status'] : [];
  }, scopes);
}
