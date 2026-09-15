import { readFileSync } from 'node:fs';
import { DEFAULT_IDENTITY } from './identity.mjs';
import { createHash } from 'node:crypto';

import { promptText as read, mainPrompt, buildMainPrompt } from './texts.mjs';
const bindings = JSON.parse(readFileSync(new URL('./bindings.json', import.meta.url), 'utf8'));
export { mainPrompt };
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Pure prompt transformation: never changes execution functions or input/output schemas. */
export function transformAssembly(assembly, context, options = {}) {
  const { agent } = context ?? {};
  if (!agent || agent.session?.header?.origin === 'subagent'
      || !assembly.sections?.some(section => section.name === 'trisoul-x:persona')) {
    return { assembly, audit: { applied: false, reason: 'outside-main-agent-scope' } };
  }
  const load = options.read ?? read;
  const map = options.bindings ?? bindings;
  const known = new Map((options.schemas ?? assembly.tools ?? []).map(tool => [tool.name, tool]));
  const applied = new Set(), retained = [], missing = [], changedSchemas = new Map();
  for (const tool of known.values()) {
    if (tool.name === 'run_code') { retained.push({ name: tool.name, reason: 'runtime-owned-transport' }); continue; }
    const binding = map[tool.name];
    if (!binding) { retained.push({ name: tool.name, reason: 'unmapped-native-tool' }); continue; }
    if (binding.mode === 'retain-native') {
      retained.push({ name: tool.name, reason: 'owner-specific-runtime-conditions' }); continue;
    }
    const fields = tool.parameters?.properties ?? {};
    const absent = binding.fields.filter(name => !Object.hasOwn(fields, name));
    if (absent.length) { missing.push({ name: tool.name, fields: absent }); continue; }
    let description = load(binding.file);
    // Do not tell the model to use optional companion tools it cannot see.
    if (tool.name === 'bash' && !Object.hasOwn(fields, 'run_in_background')) {
      description = description.split('\n').filter(line => !line.includes('`run_in_background`')).join('\n');
    }
    if (tool.name === 'bash' && !known.has('job_output')) {
      description = description.split('\n').filter(line => !line.includes('`job_output`')).join('\n');
    }
    if (['bash', 'pwsh'].includes(tool.name) && !Object.hasOwn(fields, 'sandbox_permissions')) {
      description = description.split('\n').filter(line => !line.includes('`sandbox_permissions`')).join('\n');
    }
    if (tool.name === 'web_search' && !known.has('web_fetch')) {
      description = description.replace(/Open relevant result URLs with `web_fetch`[^.]*\./g, 'Use returned source snippets when full-page retrieval is unavailable.');
    }
    changedSchemas.set(tool.name, { ...tool, description });
    applied.add(tool.name);
  }
  let persona = options.main ?? mainPrompt;
  if (!known.has('computer_use')) persona = persona.replace('Use the available computer-use tools for tasks involving browsers and desktop applications. ', '');
  const suppressed = new Set();
  for (const name of applied) for (const section of map[name].sections ?? []) suppressed.add(section);
  let sdkRegenerated = false;
  const sections = assembly.sections.flatMap(section => {
    if (section.name === 'trisoul-x:persona') return [{ ...section, text: persona, interpolate: false }];
    if (section.name === 'harness:identity') return [];
    // Generated SDK needs live descriptions AND live return contracts, not copied old stubs.
    if (section.name === 'tools:sdk' && section.text) {
      if (typeof options.renderSdk !== 'function' || typeof options.definition !== 'function') {
        throw new Error('An active tools:sdk needs the current runtime SDK renderer and output contracts.');
      }
      const sdk = [...known.values()].filter(tool => tool.name !== 'run_code').map(tool => {
        const definition = options.definition(tool.name);
        if (!definition?.output?.schema) throw new Error(`Missing live output contract: ${tool.name}`);
        return { ...(changedSchemas.get(tool.name) ?? tool), output: definition.output.schema };
      });
      sdkRegenerated = true;
      return [{ ...section, text: options.renderSdk(sdk), interpolate: false }];
    }
    if (suppressed.has(section.name)) return [];
    return [section];
  });
  if (known.has('note') && known.has('recall') && !sections.some(x => x.name === 'trisoul-x:cc-memory')) {
    sections.splice(sections.findIndex(section => section.name === 'trisoul-x:persona') + 1, 0,
      { name: 'trisoul-x:cc-memory', text: load('context/memory.md'), interpolate: false });
  }
  // DSH strips order metadata after assembling sections. Preserve the host's order.
  const result = { ...assembly, sections, tools: (assembly.tools ?? []).map(tool => changedSchemas.get(tool.name) ?? tool) };
  // The actual fields and their parameter descriptions remain the live owner contract.
  if (sha((assembly.tools ?? []).map(x => [x.name, x.parameters])) !== sha(result.tools.map(x => [x.name, x.parameters]))) {
    throw new Error('Prompt adapter attempted to change a callable schema.');
  }
  return { assembly: result, audit: { applied: true, changed: [...applied].sort(), retained, incompatible: missing,
    sdkRegenerated, toolsHash: sha(result.tools), mainHash: sha(persona) } };
}

/** Install once in the preset scope; the main-agent check excludes all internal/child requests. */
export function installPromptAdapter(ctx) {
  const seen = new Set();
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    const assembly = await next();
    if (!context?.agent || context.agent.session?.header?.origin === 'subagent'
        || !assembly.sections.some(section => section.name === 'trisoul-x:persona')) return assembly;
    const schemas = ctx.tools.schemas(context.scope ?? context.agent);
    const activeSdk = assembly.sections.some(section => section.name === 'tools:sdk' && section.text);
    let renderSdk;
    if (activeSdk) {
      const { renderToolsSdk, renderToolsSdkPy } = await import('@deepseek-ai/dsh-tools');
      const language = ctx.get('ptcRuntime')?.language;
      renderSdk = language === 'typescript' ? renderToolsSdk : language === 'python' ? renderToolsSdkPy : undefined;
      if (!renderSdk) throw new Error(`Unsupported PTC SDK language: ${language}`);
    }
    const result = transformAssembly(assembly, context, {
      main: buildMainPrompt(ctx.trisoulX.config().identityPrompt),
      schemas, renderSdk, definition: name => ctx.tools.get(name, context.scope ?? context.agent),
    });
    const key = sha(result.audit);
    if (!seen.has(key)) {
      seen.add(key);
      ctx.logger?.info?.('CC prompt adapter coverage: ' + JSON.stringify(result.audit));
    }
    return result.assembly;
  });
}

/** Privacy-minimized inspection of the actual committed request; does not invoke a model. */
export function inspectCommittedRequest(agent) {
  const messages = agent.session.deriveMessages();
  const tools = agent.session.requestHeader()?.tools ?? [];
  const systems = messages.filter(message => message.role === 'system').map(message =>
    message.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? '');
  const knownHeaders = ['[Working state', '[Work record', '[Task memory', '[Long-term memory', '[todo list]'];
  const observations = messages.filter(message => message.role !== 'system').map(message => {
    const text = message.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? '';
    return { role: message.role, source: message.source?.plugin ?? message.source?.kind,
      headers: knownHeaders.filter(header => text.includes(header)), chars: text.length };
  });
  return { capturedAt: new Date().toISOString(), source: 'committed-session-history',
    systemCount: systems.length, latestSystemHash: sha(systems.at(-1) ?? ''),
    latestHasDefaultIdentity: (systems.at(-1) ?? '').includes(DEFAULT_IDENTITY),
    latestHasTriSoulX: (systems.at(-1) ?? '').includes('You are TriSoulX.'),
    latestHasOldPersona: (systems.at(-1) ?? '').includes('Before ending your turn, check your last paragraph'),
    tools: tools.map(tool => ({ name: tool.name, schemaHash: sha(tool.parameters), descriptionHash: sha(tool.description) })),
    observations };
}
