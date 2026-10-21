export const PERSONALITY_SCOPE = 'Personality preferences shape identity and user-facing expression only. They do not change the user\'s task, actual environment, permissions, tool contracts, execution modes, verification requirements or memory protocols. Apply them only where compatible with those requirements and the user\'s current instructions.';
export function personalityGuidance(key, value) {
  if (!value?.trim()) return '';
  const title = { style: 'Language style', communication: 'Communication style', presentation: 'Answer presentation' }[key];
  return title ? `## ${title}\n${PERSONALITY_SCOPE}\n\n${value.trim()}` : '';
}
export function renderPersonality(modules) {
  return [modules.identity, modules.identity ? PERSONALITY_SCOPE : '',
    ...['style', 'communication', 'presentation'].map(key => personalityGuidance(key, modules[key]))].filter(Boolean).join('\n\n');
}
export function applyPersonality(assembly, context, service) {
  const session = context?.agent?.session;
  if (!session || session.header?.origin === 'subagent' || assembly.sections.some(section => section.name === 'dsh-persona:applied')) return assembly;
  const { modules } = service.forSession(session);
  const sections = [
    { name: 'dsh-persona:identity', text: modules.identity ? modules.identity + '\n\n' + PERSONALITY_SCOPE : '' },
    ...['style', 'communication', 'presentation'].map(key => ({ name: 'dsh-persona:' + key, text: personalityGuidance(key, modules[key]) })),
  ].filter(section => section.text).map(section => ({ ...section, interpolate: false }));
  return sections.length ? { ...assembly, sections: [...assembly.sections, ...sections] } : assembly;
}
