import { PERSONALITY_SCOPE, personalityGuidance } from '../../plugins/persona/src/shared/prompt.mjs';
export { PERSONALITY_SCOPE, personalityGuidance } from '../../plugins/persona/src/shared/prompt.mjs';
import { readFileSync } from 'node:fs';
import { DEFAULT_IDENTITY } from './identity.mjs';
import { PERSONALITY_FIELDS } from './personality.mjs';

const root = new URL('./prompts/', import.meta.url);
/** Only bundle-owned relative Markdown paths; no user paths or template evaluation. */
export function promptText(path) {
  if (typeof path !== 'string' || !/^[a-zA-Z0-9_./-]+\.md$/.test(path)
      || path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error('Invalid prompt module path.');
  }
  return readFileSync(new URL(path, root), 'utf8').trim();
}
export const MAIN_FILES = Object.freeze(["main/01-identity.md", "main/02-harness.md", "main/03-code-style.md", "main/04-actions-and-results.md", "main/05-context-management.md", "main/06-delivering-work.md", "main/07-corrections.md", "main/08-verification.md"]);
const mainParts = MAIN_FILES.map(promptText);
export function buildMainPrompt(identity = DEFAULT_IDENTITY, { toolMode = 'native', personalityModules } = {}) {
  const inserts = { 0: 'style', 5: 'presentation', 6: 'communication' };
  const mainBody = mainParts.flatMap((part, index) => {
    const key = inserts[index];
    return [part, key && personalityModules ? personalityGuidance(key, personalityModules[key] ?? PERSONALITY_FIELDS.find(field => field.key === key).defaultText) : ''];
  }).filter(Boolean).join('\n\n');
  const body = toolMode === 'ptc' ? mainBody.replace(
    'Independent tool calls can run in parallel in one response.',
    'Independent read-only tool calls may run concurrently inside a `run_code` program; await dependent work in order.',
  ) : mainBody;
  return [identity.trim(), identity.trim() ? PERSONALITY_SCOPE : '', body, toolMode !== 'native' ? promptText('runtime/ptc-guidance.md') : ''].filter(Boolean).join('\n\n');
}
export const mainPrompt = buildMainPrompt();
