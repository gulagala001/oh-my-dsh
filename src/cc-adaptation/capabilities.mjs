// Model-facing projection only. Registry validation, approval and filesystem
// enforcement remain owned by the host, including calls using old schemas.
export function executionPresentation(ctx, agent) {
  const scope = agent?.ctx ?? ctx, session = agent?.session;
  if (!session) return {};
  const approval = scope.get?.('approval');
  const policy = approval?.overrideOf?.(session) ?? approval?.config?.policy;
  const mode = scope.get?.('sandboxPolicy')?.resolve({ session })?.mode;
  return { hideEscalation: policy === 'never' || mode === 'danger-full-access' };
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
  if (mode === 'native' && name === 'tool_find') description = description.replace('Native request or PTC SDK', 'tool catalog');
  return description;
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
