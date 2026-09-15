import { readFileSync } from 'node:fs';

const root = new URL('./', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').trim();
const defaultBindings = JSON.parse(read('bindings.json'));
const defaultMain = read('prompts/MAIN.md');
const allowedModules = new Map(defaultBindings.map(item => [item.name, read('prompts/' + item.file)]));

/** Pure transform: never mutates a registered tool, parameters, or an input assembly. */
export function adaptAssembly(assembly, context, options = {}) {
  const { mainText = defaultMain, bindings = defaultBindings,
    moduleText = name => allowedModules.get(name), definitions = [],
    renderSdk, language, report = () => {} } = options;
  if (!context?.agent || context.agent.session?.header?.origin === 'subagent'
    || !assembly.sections.some(s => s.name === 'trisoul-x:persona')) return assembly;
  // A complete prompt has separate assembly semantics. Refuse an ambiguous
  // deployment instead of reporting a main-core override that cannot take effect.
  if (assembly.sections.some(s => s.complete && s.name !== 'trisoul-x:persona')) {
    throw new Error('Another complete system prompt is active; reconcile ownership before installing CC adaptation.');
  }
  const byName = new Map(bindings.map(b => [b.name, b]));
  const changed = new Set();
  function adaptTool(tool) {
    const b = byName.get(tool.name);
    // The reserved transport's runtime getter owns deadlines, cwd and grants.
    if (!b || tool.name === 'run_code') return tool;
    if (b.preserve_native) { report({ name: tool.name, status: 'native-upstream' }); return tool; }
    if (!b.baseline_descriptions.includes(tool.description)) {
      report({ name: tool.name, status: 'native-description-drift' }); return tool;
    }
    const description = moduleText(tool.name);
    if (!description) throw new Error('Missing adaptation module: ' + tool.name);
    changed.add(tool.name);
    report({ name: tool.name, status: 'adapted' });
    return { ...tool, description };
  }
  const tools = assembly.tools.map(adaptTool);
  let sections = assembly.sections.filter(s => s.name !== 'harness:identity').map(s => {
    if (s.name === 'trisoul-x:persona') return { ...s, text: mainText, interpolate: false };
    return s;
  });
  // PTC has its own model-facing SDK: native schema changes alone are not enough.
  // Rebuild with the installed renderer and live output contracts, never a stale SDK.
  if (sections.some(s => s.name === 'tools:sdk' && s.text)) {
    if (typeof renderSdk !== 'function') throw new Error('The installed SDK renderer is unavailable.');
    const sdkSchemas = definitions.filter(d => d.name !== 'run_code').map(d => {
      if (!d.output || !d.output.schema) throw new Error('Missing live output contract: ' + d.name);
      const t = adaptTool({ name: d.name, description: d.description, parameters: d.parameters });
      return { ...t, output: d.output.schema };
    });
    if (!sdkSchemas.length) throw new Error('Refusing to replace a populated SDK with an empty catalogue.');
    const text = renderSdk(sdkSchemas);
    sections = sections.map(s => s.name === 'tools:sdk' ? { ...s, text, interpolate: false } : s);
    report({ name: 'tools:sdk', status: 'rendered-from-current-runtime', language });
  }
  // Remove only a proven duplicate legacy tool section. A changed upstream
  // guidance string stays native so a new contract is not silently erased.
  sections = sections.filter(s => {
    if (!s.name.startsWith('tool:')) return true;
    const name = s.name.slice(5), b = byName.get(name);
    if (!b || !changed.has(name)) return true;
    if (b.baseline_descriptions.includes(s.text)) return false;
    report({ name: s.name, status: 'native-section-retained' });
    return true;
  });
  return { ...assembly, sections, tools };
}

/** Register at the preset's scope; no global monkey-patching or tool shadows. */
export function installPromptAdapter(ctx) {
  const reported = new Set();
  const report = item => {
    const key = JSON.stringify(item);
    if (reported.has(key)) return;
    reported.add(key);
    if (item.status.includes('drift')) ctx.logger?.warn?.('[CC adaptation] ' + key);
  };
  let renderers;
  return ctx.on('system-prompt/assemble', async (_input, context, next) => {
    const assembly = await next();
    if (!context?.agent || context.agent.session?.header?.origin === 'subagent'
      || !assembly.sections.some(s => s.name === 'trisoul-x:persona')) return assembly;
    const hasSdk = assembly.sections.some(s => s.name === 'tools:sdk' && s.text);
    let definitions = [], renderSdk, language;
    if (hasSdk) {
      renderers ??= await import('@deepseek-ai/dsh-tools');
      language = ctx.get('ptcRuntime')?.language;
      renderSdk = language === 'typescript' ? renderers.renderToolsSdk
        : language === 'python' ? renderers.renderToolsSdkPy : undefined;
      definitions = ctx.tools.schemas(context.scope).filter(s => s.name !== 'run_code').map(s => {
        const definition = ctx.tools.get(s.name, context.scope);
        if (!definition) throw new Error('Tool disappeared during SDK assembly: ' + s.name);
        return definition;
      });
    }
    return adaptAssembly(assembly, context, { definitions, renderSdk, language, report });
  });
}
