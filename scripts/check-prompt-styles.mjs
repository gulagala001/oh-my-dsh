import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { promptStyleBuilders } from './prompt-style-builders.mjs';
import { createRequire } from 'node:module';

const root = new URL('../src/prompt-styles/', import.meta.url);
let files = 0;
for (const id of ['codex', 'cursor', 'pi', 'grok', 'zcode']) {
  const folder = new URL(`upstream/${id}/`, root);
  const source = JSON.parse(readFileSync(new URL('source.json', folder), 'utf8'));
  if (source.id !== id || !/^[0-9a-f]{40}$/.test(source.commit) || !source.files.some(file => file.path === 'LICENSE')) throw Error('Invalid prompt source: ' + id);
  const expected = new Set(['source.json', ...source.files.map(file => file.path)]);
  if (readdirSync(folder).some(file => !expected.has(file))) throw Error('Unregistered prompt source: ' + id);
  for (const file of source.files) {
    if (!/^[\w.-]+$/.test(file.path)) throw Error('Invalid source path');
    const hash = createHash('sha256').update(readFileSync(new URL(file.path, folder))).digest('hex');
    if (hash !== file.sha256) throw Error(`Prompt source differs from pinned upstream: ${id}/${file.path}`);
    files++;
  }
}
const output = new URL('builders.mjs', root), expected = await promptStyleBuilders();
if (process.argv.includes('--write')) writeFileSync(output, expected);
else if (readFileSync(output, 'utf8') !== expected) throw Error('Prompt builders are stale; run node scripts/check-prompt-styles.mjs --write');
const { renderPromptStyle, DSH_IDENTITY } = await import('../src/prompt-styles/render.mjs');
const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
const nativeSource = readFileSync(host.resolve('@deepseek-ai/dsh-system-prompt'), 'utf8');
if (!nativeSource.includes('text: ' + JSON.stringify(DSH_IDENTITY))) throw Error('Native DSH identity changed; review prompt style adaptation');
for (const id of ['dsh', 'codex', 'cursor', 'pi', 'grok', 'zcode']) renderPromptStyle(id);
console.log(`Prompt sources and builders passed (${files} original files).`);
