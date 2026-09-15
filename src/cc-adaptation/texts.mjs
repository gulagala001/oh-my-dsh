import { readFileSync } from 'node:fs';

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
export const mainPrompt = MAIN_FILES.map(promptText).join('\n\n');
