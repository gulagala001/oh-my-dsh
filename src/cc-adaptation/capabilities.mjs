// Model-facing projection only. Registry validation, approval and filesystem
// enforcement remain owned by the host, including calls using old schemas.
export function executionPresentation(ctx, agent) {
  const scope = agent?.ctx ?? ctx, session = agent?.session;
  if (!session) return {};
  const approval = scope.get?.('approval');
  const policy = approval?.overrideOf?.(session) ?? approval?.config?.policy;
  const mode = scope.get?.('sandboxPolicy')?.resolve({ session })?.mode;
  return { hideEscalation: policy === 'never' || mode === 'danger-full-access',
    softYieldEnabled: scope.get?.('jobs')?.ownerOptions?.(agent)?.softYieldMs !== undefined };
}

export const DELEGATION_RULE = 'Delegate only when authorized by the user or an explicit active collaboration strategy.';
export const isDelegationTool = name => /^subagent(?:_|$)/.test(name) || name === 'spawn_teammate' || name === 'workflow';

// Reduce duplicate transport boilerplate only for the recognized host/runtime
// combination. Keep the actual evaluator, isolation, output and retry rules.
export function transportEntryDescription(description) {
  const marker = ' The program is the body of an async TypeScript function;';
  const offset = description.indexOf(marker);
  return description.startsWith('Execute a TypeScript program against the available tools.') && offset > 0
    ? 'Execute TypeScript using the tool SDK below.' + description.slice(offset) : description;
}

export function projectSdkTool(tool, { softYieldEnabled = false, direct = false } = {}) {
  let { parameters, output, description } = tool;
  const yieldDescription = parameters?.properties?.yieldMs?.description ?? '';
  if (['bash', 'pwsh'].includes(tool.name) && yieldDescription.includes('top-level calls') && yieldDescription.includes('nested calls wait')) {
    const { yieldMs, ...properties } = parameters.properties;
    parameters = { ...parameters, properties, ...(parameters.required ? { required: parameters.required.filter(k => k !== 'yieldMs') } : {}) };
    // The historical timeout-promotion path remains valid when soft yielding
    // is disabled. Never narrow its output just because the call is nested.
    if (softYieldEnabled && output?.oneOf) output = { ...output, oneOf: output.oneOf.filter(branch => branch.properties?.kind?.const !== 'promoted') };
  }
  description = description.replace('The SDK returns a JSON string containing {content:[...]}; direct calls render those blocks.', 'Returns a JSON string containing {content:[...]}; parse it once.');
  if (direct && ['job_output', 'job_list', 'job_kill', 'runtime_status'].includes(tool.name)) {
    description = tool.name === 'job_output'
      ? 'SDK form of the direct job_output tool: inspect `job.status` and `text`. Nested waits share the program deadline; prefer the direct call when only waiting remains.'
      : `SDK form of the direct ${tool.name} tool; returns the structured value declared below.`;
  }
  return { ...tool, parameters, output, description };
}

export function projectExecutionSchemas(schemas, { hideEscalation } = {}) {
  if (!hideEscalation) return schemas;
  return schemas.map(tool => {
    if (!['run_code', 'bash', 'pwsh', 'write', 'edit'].includes(tool.name) || !tool.parameters?.properties?.sandbox_permissions) return tool;
    const { sandbox_permissions, justification, ...properties } = tool.parameters.properties;
    const parameters = { ...tool.parameters, properties };
    if (parameters.required) parameters.required = parameters.required.filter(key => !['sandbox_permissions', 'justification'].includes(key));
    const description = tool.name === 'run_code' ? tool.description.replace(' A sandbox escalation approves this complete program for one execution only. Nested tools retain their own policies and approvals. Request wider access only after evidence of a denial.', ' Nested tools retain their own policies and approvals.') : tool.description;
    return { ...tool, parameters, description };
  });
}

export function transportDescription(name, description, known, mode) {
  if (name === 'ask_user_question' && !known.has('exit_plan_mode')) description = description.replace(/\n\nIn plan mode,[^\n]*/, '');
  if (name === 'todo_write' && !known.has('exit_plan_mode')) description = description.replace(' During plan mode, follow the plan-mode instructions instead.', '');
  if (mode === 'native' && name === 'recall') description = description.replace('The SDK returns a JSON string containing {content:[...]}; direct calls render those blocks.', 'Results are rendered content blocks.');
  if (name === 'tool_find') description = description.replace('Native request or PTC SDK', 'tool catalog for the current calling mode');
  if (isDelegationTool(name) && !description.includes(DELEGATION_RULE)) description = DELEGATION_RULE + ' ' + description;
  return description;
}

const headings = {
  'oh-my-dsh:codegraph': 'Code navigation', 'tools:ptc-only': 'Tool entry points',
  'context:file-reference': 'Referenced paths', 'tool:jobs': 'Background jobs',
  'tool:goal': 'Persistent goals', 'tool:ralph': 'Fresh-agent iteration',
  'omd:ultra': 'Collaboration mode', 'omd:tool-discovery': 'Tool discovery',
};
export function scopeSectionHeadings(sections) {
  return sections.map(section => {
    const heading = headings[section.name] ?? (section.name.startsWith('tool:subagent') ? 'Delegated tasks' : undefined);
    return heading && section.text && !/^#{1,2} /.test(section.text)
      ? { ...section, text: `## ${heading}\n${section.text}` } : section;
  });
}

export function projectExecutionSections(sections, known) {
  return sections.map(section => {
    let text = section.text;
    if (section.name.startsWith('tool:subagent') && text.includes('When only waiting for their results remains')) {
      const wait = known.has('wait_agent') ? 'When only results are missing, use wait_agent for event-driven waiting; this is not polling.'
        : 'When only results are missing, yield this execution turn to the host; a child result resumes work. This scheduling yield is not final delivery.';
      text = text.replace(/When only waiting for their results remains,[^.]*; the next result starts a new turn\./, wait);
    }
    if (section.name === 'tool:ralph') text = text.replace('and plain subagents or workflows for bounded delegation and fan-out', 'and, only when delegation is authorized by the user or an explicit active strategy, subagents or workflows for bounded delegation and fan-out');
    if (section.name === 'ui:deliverable-file-references' && text && !/^#{1,2} /m.test(text)) text = '## Files and images\n' + text;
    return text === section.text ? section : { ...section, text };
  });
}
