export const PERSONALITY_SCOPE = 'Personality preferences shape identity and user-facing expression only. They do not change the user\'s task, actual environment, permissions, tool contracts, execution modes, verification requirements or memory protocols. Apply them only where compatible with those requirements and the user\'s current instructions.';
export function personalityGuidance(key, value) {
  if (!value?.trim()) return '';
  const title = { style: 'Language style', communication: 'Communication style', presentation: 'Answer presentation' }[key];
  return title ? `## ${title}\n${value.trim()}` : '';
}
const guidanceKeys = ['style', 'communication', 'presentation'];
export function renderPersonality(modules) {
  const identity = modules.identity?.trim(), guidance = guidanceKeys.map(key => personalityGuidance(key, modules[key])).filter(Boolean);
  return identity || guidance.length ? [PERSONALITY_SCOPE, identity, ...guidance].filter(Boolean).join('\n\n') : '';
}
export function applyPersonality(assembly, context, service) {
  const session = context?.agent?.session;
  if (!session || isUnseededSubagent(session) || assembly.sections.some(section => section.name === 'dsh-persona:applied' || section.name === 'dsh-persona:personality')) return assembly;
  const text = renderPersonality((service.forPrompt?.(session) ?? service.forSession(session)).modules);
  return text ? { ...assembly, sections: [...assembly.sections, { name: 'dsh-persona:personality', text, interpolate: false }] } : assembly;
}

export function isUnseededSubagent(session) {
  return session?.header?.origin === 'subagent' && session.header.isSeeded !== true;
}
