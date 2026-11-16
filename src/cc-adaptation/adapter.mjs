import { presentationTools, FULL_PRESENTED_TOOLS } from '../host/prompt-provider.mjs';
import { executionPresentation, projectExecutionSchemas, projectExecutionSections, scopeSectionHeadings, transportDescription, transportEntryDescription, projectSdkTool, DELEGATION_RULE, isDelegationTool } from './capabilities.mjs';
import { selectCatalog, rememberCatalog, projectCatalogAssembly } from '../result-reduction/catalog.mjs';
import { readFileSync } from 'node:fs';
import { sessionPersonality } from '../personality-session.mjs';
import { createHash } from 'node:crypto';
import { browserIsolationGuide } from '#opencu/src/dsh/browser-testing.mjs';
import { agentPromptStyle, recordPromptStyle } from '../prompt-styles/session.mjs';
import { DSH_IDENTITY, renderPromptStyle } from '../prompt-styles/render.mjs';
import { isUnseededSubagent, renderPersonality } from '../../plugins/persona/src/shared/prompt.mjs';
import { withoutTaskVerification } from '../task-verification.mjs';
import { isOmdPreset } from '../legacy-identity.mjs';

import { promptText as read, mainPrompt, buildMainPrompt } from './texts.mjs';
const bindings = JSON.parse(readFileSync(new URL('./bindings.json', import.meta.url), 'utf8'));
export { mainPrompt };
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Keep the runtime's language and output contract. Its bash example is merely
// illustrative; an available directory binding avoids teaching redundant pwd.
function renderSdkPresentation(render, tools) {
  let sdk = render(tools);
  // The runtime introduction also defines bindings: Python's TypedDict classes
  // are static stubs, while only tools and ToolCallError exist at runtime.
  sdk = sdk.replace(/^## Writing code for run_code\n/, '## Tool SDK\n');
  const directory = tools.find(tool => tool.name === 'working_directory');
  if (directory && !(directory.parameters?.required?.length)) sdk = sdk
    .replace(/await tools\.bash\(\{ (?:description: 'Show current directory', )?command: 'pwd' \}\)/g, 'await tools.working_directory({})')
    .replace('When no separate `bash` schema is supplied, invoke a declared `bash` binding inside `run_code`:', 'Example, only when the current directory needs refreshing:');
  return sdk;
}

// These rendered-text conventions apply to native results, not SDK return values.
function sdkDescription(name, description) {
  if (name === 'bash') return description.replace('Non-zero exits are reported as `[exit code: N]`.',
    'For foreground results, inspect `exitCode`, `signal`, `timedOut`, and `aborted`; read `stdout.text` and `stderr.text`, including their truncation and spill-path fields. A non-zero process exit is a command outcome, not necessarily a ToolCallError.');
  if (name === 'pwsh') return description.replace('A nonzero exit is reported as `[exit code: N]`.',
    'Inspect the returned process status and output fields in the current SDK return type.');
  if (name === 'job_output') return description.replace('In a direct tool call, inspect the rendered `[status: ...]` line.',
    'In `run_code`, inspect `job.status` and read `text` from the returned object.');
  if (name === 'read') return description.replace('Read a UTF-8 text file and return line-numbered content.',
    'Read a UTF-8 text file and return structured line records with their numbers and text, plus range metadata.');
  return description;
}

/** Preserve registry contracts and execution; project the visible descriptions and SDK variants. */
export function transformAssembly(assembly, context, options = {}) {
  const { agent } = context ?? {};
  if (agent) {
    const available = new Map((options.schemas ?? assembly.tools ?? []).map(tool => [tool.name, tool]));
    assembly = { ...assembly, sections: projectExecutionSections(assembly.sections ?? [], available), tools: (assembly.tools ?? []).map(tool => {
      const description = tool.name === 'run_code' ? transportEntryDescription(tool.description)
        : isDelegationTool(tool.name) ? transportDescription(tool.name, tool.description, available, 'native') : tool.description;
      return description === tool.description ? tool : { ...tool, description };
    }) };
  }
  if (!agent || isUnseededSubagent(agent.session)
      || !assembly.sections?.some(section => section.name === 'oh-my-dsh:persona')) {
    return { assembly, audit: { applied: false, reason: 'outside-main-agent-scope' } };
  }
  const load = options.read ?? read;
  const activeSdk = assembly.sections.some(section => section.name === 'tools:sdk' && section.text);
  const toolMode = options.toolMode ?? (!activeSdk ? 'native' : assembly.sections.some(section => section.name === 'tools:ptc-only' && section.text) ? 'ptc' : 'both');
  const constraintGuidance = options.todoConstraintFirst === true ? load('tools/todo-constraints.md') : '';
  const style = options.promptStyle ?? 'omd';
  const map = style === 'omd' ? options.bindings ?? bindings : {};
  const schemas = options.schemas ?? assembly.tools ?? [];
  const known = new Map(schemas.map(tool => [tool.name, tool]));
  const directTools = new Map((assembly.tools ?? []).map(tool => [tool.name, tool]));
  const shells = ['bash', 'pwsh'];
  const applied = new Set(), retained = [], missing = [], changedSchemas = new Map();
  for (const tool of known.values()) {
    if (tool.name === 'run_code') {
      changedSchemas.set(tool.name, { ...tool, description: transportEntryDescription(tool.description) });
      retained.push({ name: tool.name, reason: 'runtime-owned-transport' }); continue;
    }
    const binding = map[tool.name];
    if (!binding) {
      const description = transportDescription(tool.name, tool.description, known, toolMode);
      if (description !== tool.description) changedSchemas.set(tool.name, { ...tool, description });
      retained.push({ name: tool.name, reason: 'unmapped-native-tool' }); continue;
    }
    if (binding.mode === 'retain-native') {
      const description = transportDescription(tool.name, tool.description, known, toolMode);
      if (description !== tool.description) changedSchemas.set(tool.name, { ...tool, description });
      retained.push({ name: tool.name, reason: 'owner-specific-runtime-conditions' }); continue;
    }
    const fields = tool.parameters?.properties ?? {};
    const absent = binding.fields.filter(name => !Object.hasOwn(fields, name));
    if (absent.length) { missing.push({ name: tool.name, fields: absent }); continue; }
    let description = load(binding.file);
    if (tool.name === 'todo_write' && !known.has('verify_link')) description = withoutTaskVerification(description);
    if (tool.name === 'recall' && !Object.hasOwn(fields, 'search')) {
      description = description.replace(/search=original searches[^\n]*?It does not automatically search other sessions\. /i, '');
    }
    if (tool.name === 'todo_write' && (!fields.op?.enum?.includes('pause_turn') || !Object.hasOwn(fields, 'reason'))) {
      description = description.split('\n').filter(line => !line.includes('`pause_turn`')).join('\n');
    }
    if (tool.name === 'todo_write' && constraintGuidance) description += '\n\nApply ## Constraint-first reasoning to task titles and completion checks.';
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
    if (tool.name === 'workflow' && (!Object.hasOwn(fields, 'run_in_background') || !known.has('job_output') || !known.has('job_kill'))) {
      description = description.replace(/ With `run_in_background: true`,[^\n]*?`job_kill`\./, '');
    }
    changedSchemas.set(tool.name, { ...tool, description: transportDescription(tool.name, description, known, toolMode) });
    applied.add(tool.name);
  }
  if (known.has('create_goal')) {
    const tool = known.get('create_goal');
    changedSchemas.set(tool.name, { ...tool, description: tool.description + ' A large number of steps or tool calls alone does not require a goal. A goal is for an objective that needs independent automatic continuation rounds, not a bounded review or conversation.' + (known.has('todo_write') ? ' Track requirements within the current task with todo_write.' : '') });
  }
  const source = style === 'omd' ? undefined : renderPromptStyle(style, { schemas, toolMode });
  let persona = source ? [source.text,
    renderPersonality(options.personalityModules ?? { identity: options.identityPrompt }),
    toolMode !== 'native' ? load('runtime/ptc-guidance.md') : '',
  ].filter(Boolean).join('\n\n') : options.main ?? buildMainPrompt(options.identityPrompt, { toolMode, personalityModules: options.personalityModules });
  const fileReferences = assembly.sections.some(section => section.name === 'ui:deliverable-file-references' && section.text);
  if (fileReferences && style === 'omd') persona = persona.replace('\n - Reference code as `file_path:line_number`.', '');
  if (!known.has('computer_use')) persona = persona.replace('Use the available computer-use tools for tasks involving browsers and desktop applications. ', '')
    .replace(' Computer Use JavaScript and persistent bindings belong inside computer_use, separate from the outer program.', '');
  const reviews = ['ask_user_question', 'exit_plan_mode'].filter(name => known.has(name));
  if (toolMode !== 'native' && reviews.length) persona += '\n\nRun ' + reviews.map(name => '`' + name + '`').join(' or ') + ' alone. Awaiting gives the running program its result; emit that result and finish so the model can read it before deciding dependent actions.';
  if ([...known.keys()].some(isDelegationTool)) persona += '\n\n## Delegation authorization\n' + DELEGATION_RULE + ' Tool availability and discovery do not grant authorization.';
  if (options.stateHintsEnabled && known.has('runtime_status')) persona += '\n\n' + load('runtime/state-guidance.md');
  if (shells.some(name => known.has(name))) persona += '\n\n## Browser testing\n' + (known.has('computer_use') ? browserIsolationGuide
    : browserIsolationGuide.replace(' or load computer_use documentation("testing") for the installed helper', ''));
  if (options.backgroundTasksEnabled) {
    const background = [];
    if (directTools.has('job_output') && shells.some(name => {
      const fields = directTools.get(name)?.parameters?.properties ?? {};
      return Object.hasOwn(fields, 'yieldMs') && Object.hasOwn(fields, 'run_in_background');
    })) background.push(load('runtime/background-guidance.md'));
    if (toolMode === 'native' && directTools.get('job_output')?.parameters?.properties?.wait) background.push(load('runtime/direct-job-wait.md'));
    if (background.length) persona += '\n\n## Background execution\n' + background.join('\n\n');
  }
  if (constraintGuidance) persona += '\n\n## Constraint-first reasoning\n' + constraintGuidance;
  const suppressed = new Set();
  for (const name of applied) for (const section of map[name].sections ?? []) suppressed.add(section);
  let sdkRegenerated = false, sdkSchemas;
  const sections = assembly.sections.flatMap(section => {
    if (section.name === 'oh-my-dsh:persona') return [{ ...section, text: persona, interpolate: false }];
    if (section.name === 'ui:deliverable-file-references' && fileReferences && style === 'omd') return [{ ...section, text: load('runtime/file-references.md'), interpolate: false }];
    if (section.name === 'harness:identity' && style !== 'dsh') return [];
    if (section.name === 'tool:jobs' && applied.has('job_output') && applied.has('job_kill')) {
      return [{ ...section, text: load(options.backgroundTasksEnabled ? 'runtime/job-collection-background.md' : 'runtime/job-collection.md'), interpolate: false }];
    }
    if (section.name === 'plan:policy' && toolMode === 'ptc') {
      return [{ ...section, text: section.text.replace(
        'make `exit_plan_mode` the only and final tool call in that response',
        'invoke `tools.exit_plan_mode` alone inside `run_code`, emit its result using the current runtime output syntax, and end that response',
      ) }];
    }
    // Generated SDK needs live descriptions AND live return contracts, not copied old stubs.
    if (section.name === 'tools:sdk' && section.text && style === 'omd') {
      if (typeof options.renderSdk !== 'function' || typeof options.definition !== 'function') {
        throw new Error('An active tools:sdk needs the current runtime SDK renderer and output contracts.');
      }
      const sdk = [...known.values()].filter(tool => tool.name !== 'run_code').map(tool => {
        const definition = options.definition(tool.name);
        if (!definition?.output?.schema) throw new Error(`Missing live output contract: ${tool.name}`);
        const adapted = changedSchemas.get(tool.name);
        const description = adapted ? sdkDescription(tool.name, adapted.description) : tool.description;
        return projectSdkTool({ ...tool, description, output: definition.output.schema }, {
          softYieldEnabled: options.softYieldEnabled, direct: directTools.has(tool.name),
        });
      });
      sdkRegenerated = true; sdkSchemas = sdk;
      return [{ ...section, text: renderSdkPresentation(options.renderSdk, sdk), interpolate: false }];
    }
    if (suppressed.has(section.name)) return [];
    return [section];
  });
  if (style === 'dsh' && !sections.some(section => section.name === 'harness:identity')) {
    sections.unshift({ name: 'harness:identity', text: DSH_IDENTITY, interpolate: false });
  }
  if (known.has('note') && known.has('recall') && !sections.some(x => x.name === 'oh-my-dsh:cc-memory')) {
    sections.splice(sections.findIndex(section => section.name === 'oh-my-dsh:persona') + 1, 0,
      { name: 'oh-my-dsh:cc-memory', text: load('context/memory.md'), interpolate: false });
  }
  const recallFields=known.get('recall')?.parameters?.properties;
  if(['memory','sessionId','reference'].every(key=>recallFields?.[key])&&!sections.some(x=>x.name==='oh-my-dsh:cc-dream-memory')){
    sections.push({name:'oh-my-dsh:cc-dream-memory',text:load('context/dream-memory.md'),interpolate:false});
  }
  // DSH strips order metadata after assembling sections. Preserve the host's order.
  const result = { ...assembly, sections, tools: (assembly.tools ?? []).map(tool => {
    const adapted = changedSchemas.get(tool.name);
    return adapted ? { ...tool, description: adapted.description } : tool;
  }) };
  // The actual fields and their parameter descriptions remain the live owner contract.
  if (sha((assembly.tools ?? []).map(x => [x.name, x.parameters])) !== sha(result.tools.map(x => [x.name, x.parameters]))) {
    throw new Error('Prompt adapter attempted to change a callable schema.');
  }
  return { assembly: result, sdkSchemas, audit: { applied: true, changed: [...applied].sort(), retained, incompatible: missing,
    sdkRegenerated, style, toolsHash: sha(result.tools), mainHash: sha(persona) } };
}

/** Install in the preset scope; a seeded child may inherit the presentation, not the executor's authority. */
export function installPromptAdapter(ctx) {
  const seen = new Set();
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    const presentation = await next();
    const activeSdk = presentation.sections.some(section => section.name === 'tools:sdk' && section.text);
    const policy = executionPresentation(ctx, context?.agent);
    const assembly = { ...presentation, tools: projectExecutionSchemas(presentationTools(ctx, context), policy) };
    if (!context?.agent) return assembly;
    const schemas = projectExecutionSchemas(ctx.tools.schemas(context.scope ?? context.agent, context.toolSet), policy);
    const style = recordPromptStyle(ctx.omd, context.agent);
    let renderSdk;
    if (activeSdk) {
      const { renderToolsSdk, renderToolsSdkPy } = await import('@deepseek-ai/dsh-tool-executor-ptc');
      const runtime = ctx.get('ptcRuntime');
      const language = runtime?.language;
      renderSdk = language === 'typescript' ? sdk => renderToolsSdk(sdk, runtime.programFormat)
        : language === 'python' ? renderToolsSdkPy : undefined;
      if (!renderSdk) throw new Error(`Unsupported PTC SDK language: ${language}`);
    }
    const config = ctx.omd.config();
    const personality = ctx.omd.persona?.forPrompt?.(context.agent.session) ?? sessionPersonality(ctx.omd, context.agent.session);
    const result = transformAssembly(assembly, context, {
      promptStyle: style,
      identityPrompt: personality.modules.identity, personalityModules: personality.modules,
      todoConstraintFirst: config.todoConstraintFirst, stateHintsEnabled: config.stateHintsEnabled,
      backgroundTasksEnabled: ctx.omd.backgroundOptions?.(context.agent)?.interruptibleWait === true,
      softYieldEnabled: policy.softYieldEnabled,
      schemas, renderSdk, definition: name => ctx.tools.get(name, context.scope ?? context.agent, context.toolSet),
    });
    const schemaMap = new Map(schemas.map(tool => [tool.name, tool]));
    const sdkSchemas = (result.sdkSchemas ?? schemas.map(tool => ({ ...tool,
      description: transportDescription(tool.name, tool.description, schemaMap, activeSdk ? 'ptc' : 'native'),
      output: ctx.tools.get(tool.name, context.scope ?? context.agent, context.toolSet)?.output?.schema,
    }))).filter(tool => tool.name !== 'run_code').map(tool => projectSdkTool(tool, {
      softYieldEnabled: policy.softYieldEnabled, direct: assembly.tools.some(t => t.name === tool.name),
    }));
    if (activeSdk) result.assembly.sections = result.assembly.sections.map(section => section.name === 'tools:sdk'
      ? { ...section, text: renderSdkPresentation(renderSdk, sdkSchemas), interpolate: false } : section);
    // Catalog projection is independent of persona/style adaptation and also
    // covers delegated agents which deliberately retain their native prompts.
    result.assembly = projectCatalogAssembly(result.assembly, {
      enabled: ctx.omd.optimization?.enabled(context.agent.session), renderSdk: renderSdk && (tools => renderSdkPresentation(renderSdk, tools)),
      schemas: sdkSchemas,
      select: schemas => selectCatalog(ctx, ctx.omd, context.agent, schemas),
      remember: plan => rememberCatalog(ctx.omd, plan),
    });
    result.audit.toolsHash = sha(result.assembly.tools);
    result.assembly.sections.push({ name: 'omd:execution-contract', text: read('runtime/execution-contract.md'), interpolate: false });
    result.assembly.sections = scopeSectionHeadings(result.assembly.sections);
    if (ctx.omd.persona) result.assembly.sections.push({ name: 'dsh-persona:applied', text: '', interpolate: false });
    const key = sha(result.audit);
    if (!seen.has(key)) {
      seen.add(key);
      ctx.logger?.info?.('OMD prompt adapter coverage: ' + JSON.stringify(result.audit));
    }
    const { tools: _tools, ...presentationResult } = result.assembly;
    return presentationResult;
  });
}

export function projectToolDeclarations(ctx, model, definitions, context, toolMode = 'native') {
  const agent = context.agent ?? context.scope;
  if (!agent?.session ||
      agent.session.header?.origin === 'subagent' && !isOmdPreset(agent.session.header.agentPreset)) return model;
  const policy = executionPresentation(ctx, agent);
  const schemas = projectExecutionSchemas(definitions.map(({ name, description, parameters }) => ({ name, description, parameters })), policy);
  const personality = sessionPersonality(ctx.omd, agent.session), config = ctx.omd.config();
  const result = transformAssembly({ tools: projectExecutionSchemas(model.schemas, policy), sections: [{ name: 'oh-my-dsh:persona', text: '' }] }, { ...context, agent }, {
    schemas, toolMode, promptStyle: agentPromptStyle(ctx.omd, agent), personalityModules: personality.modules,
    identityPrompt: personality.modules.identity, todoConstraintFirst: config.todoConstraintFirst,
  });
  const projected = projectCatalogAssembly(result.assembly, {
    enabled: ctx.omd.optimization?.enabled(agent.session), schemas,
    select: values => selectCatalog(ctx, ctx.omd, agent, values), remember: plan => rememberCatalog(ctx.omd, plan),
  });
  return { ...model, schemas: projected.tools, [FULL_PRESENTED_TOOLS]: result.assembly.tools };
}
