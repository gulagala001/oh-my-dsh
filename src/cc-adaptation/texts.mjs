import { readFileSync } from 'node:fs';
import { DEFAULT_IDENTITY } from './identity.mjs';

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
const mainBody = MAIN_FILES.map(promptText).join('\n\n');
export function buildMainPrompt(identity = DEFAULT_IDENTITY, { toolMode = 'native' } = {}) {
  const body = toolMode === 'ptc' ? mainBody.replace(
    'Independent tool calls can run in parallel in one response.',
    'Independent read-only tool calls may run concurrently inside a `run_code` program; await dependent work in order.',
  ) : mainBody;
  return [identity.trim(), body, toolMode !== 'native' ? promptText('runtime/ptc-guidance.md') : ''].filter(Boolean).join('\n\n');
}
export const mainPrompt = buildMainPrompt();
