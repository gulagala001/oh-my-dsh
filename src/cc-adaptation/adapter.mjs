import { readFileSync } from 'node:fs';
import { DEFAULT_IDENTITY } from './identity.mjs';
import { createHash } from 'node:crypto';

import { promptText as read, mainPrompt, buildMainPrompt } from './texts.mjs';
const bindings = JSON.parse(readFileSync(new URL('./bindings.json', import.meta.url), 'utf8'));
export { mainPrompt };
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// These rendered-text conventions apply to native results, not SDK return values.
function sdkDescription(name, description) {
  if (name === 'bash') return description.replace('Non-zero exits are reported as `[exit code: N]`.',
    'For foreground results, inspect `exitCode`, `signal`, `timedOut`, and `aborted`; read `stdout.text` and `stderr.text`, including their truncation and spill-path fields. A non-zero process exit is a command outcome, not necessarily a ToolCallError.');
  if (name === 'pwsh') return description.replace('A nonzero exit is reported as `[exit code: N]`.',
    'Inspect the returned process status and output fields in the current SDK return type.');
  if (name === 'job_output') return description.replace('Inspect the `[status: ...]` line.',
    'Inspect `job.status` and read `text` from the returned object.');
  if (name === 'read') return description.replace('Read a UTF-8 text file and return line-numbered content.',
    'Read a UTF-8 text file and return structured line records with their numbers and text, plus range metadata.');
  return description;
}

/** Pure prompt transformation: never changes execution functions or input/output schemas. */
export function transformAssembly(assembly, context, options = {}) {
  const { agent } = context ?? {};
  if (!agent || agent.session?.header?.origin === 'subagent'
      || !assembly.sections?.some(section => section.name === 'trisoul-x:persona')) {
    return { assembly, audit: { applied: false, reason: 'outside-main-agent-scope' } };
  }
  const load = options.read ?? read;
  const activeSdk = assembly.sections.some(section => section.name === 'tools:sdk' && section.text);
  const toolMode = !activeSdk ? 'native' : assembly.sections.some(section => section.name === 'tools:ptc-only' && section.text) ? 'ptc' : 'both';
  const constraintGuidance = options.todoConstraintFirst === true ? load('tools/todo-constraints.md') : '';
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
    if (tool.name === 'todo_write' && (!fields.op?.enum?.includes('pause_turn') || !Object.hasOwn(fields, 'reason'))) {
      description = description.split('\n').filter(line => !line.includes('`pause_turn`')).join('\n');
    }
    if (tool.name === 'todo_write' && constraintGuidance) {
      description += '\n\n' + constraintGuidance;
    }
    // Do not tell the model to use optional companion tools it cannot see.
    if (['bash', 'pwsh'].includes(tool.name) && !Object.hasOwn(fields, 'run_in_background')) {
      description = description.split('\n').filter(line => !line.includes('`run_in_background`')).join('\n');
    }
    if (['bash', 'pwsh'].includes(tool.name) && !known.has('job_output')) {
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
  let persona = options.main ?? buildMainPrompt(options.identityPrompt, { toolMode });
  if (!known.has('computer_use')) persona = persona.replace('Use the available computer-use tools for tasks involving browsers and desktop applications. ', '');
  if (options.stateHintsEnabled && known.has('runtime_status')) persona += '\n\n' + load('runtime/state-guidance.md');
  if (options.backgroundTasksEnabled && known.has('job_output')) {
    persona += '\n\n' + load('runtime/background-guidance.md');
    const direct = (assembly.tools ?? []).filter(t => ['job_output', 'job_list', 'job_kill', 'runtime_status'].includes(t.name)).map(t => t.name);
    if (activeSdk && direct.length) persona += '\n\nThe following control tools are available directly in this request: ' + direct.map(n => '`' + n + '`').join(', ') + '. Start background work in a short program, return its id, and call these controls in later steps as needed.';
  }
  if (constraintGuidance) persona += '\n\n## Constraint-first reasoning\n' + constraintGuidance;
  const suppressed = new Set();
  for (const name of applied) for (const section of map[name].sections ?? []) suppressed.add(section);
  let sdkRegenerated = false;
  const sections = assembly.sections.flatMap(section => {
    if (section.name === 'trisoul-x:persona') return [{ ...section, text: persona, interpolate: false }];
    if (section.name === 'harness:identity') return [];
    if (section.name === 'tool:jobs' && applied.has('job_output') && applied.has('job_kill')) {
      return [{ ...section, text: load(options.backgroundTasksEnabled ? 'runtime/job-collection-background.md' : 'runtime/job-collection.md'), interpolate: false }];
    }
    if (section.name === 'plan:policy' && toolMode === 'ptc') {
      return [{ ...section, text: section.text.replace(
        'make `exit_plan_mode` the only and final tool call in that response',
        'invoke `tools.exit_plan_mode` alone inside `run_code`, return its result, and end that response',
      ) }];
    }
    // Generated SDK needs live descriptions AND live return contracts, not copied old stubs.
    if (section.name === 'tools:sdk' && section.text) {
      if (typeof options.renderSdk !== 'function' || typeof options.definition !== 'function') {
        throw new Error('An active tools:sdk needs the current runtime SDK renderer and output contracts.');
      }
      const sdk = [...known.values()].filter(tool => tool.name !== 'run_code').map(tool => {
        const definition = options.definition(tool.name);
        if (!definition?.output?.schema) throw new Error(`Missing live output contract: ${tool.name}`);
        const adapted = changedSchemas.get(tool.name);
        return { ...(adapted ?? tool), ...(adapted ? { description: sdkDescription(tool.name, adapted.description) } : {}), output: definition.output.schema };
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
    const config = ctx.trisoulX.config();
    const result = transformAssembly(assembly, context, {
      identityPrompt: config.identityPrompt, todoConstraintFirst: config.todoConstraintFirst, stateHintsEnabled: config.stateHintsEnabled,
      backgroundTasksEnabled: ctx.trisoulX.backgroundOptions?.(context.agent)?.interruptibleWait === true,
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
