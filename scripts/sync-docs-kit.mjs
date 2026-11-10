// Copy the shared documentation checker to the sibling plugin repositories, or verify that they match (--check).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const repositories = ['deepseek-workbench', 'dsh-btw-plugin', 'dsh-extensions', 'dsh-persona-plugin', 'dsh-response-id-reuse',
  'dsh-theme-plugin', 'iui', 'omaa', 'opencu', 'rewind', 'workflow'];
const source = readFileSync(resolve(root, 'scripts/check-docs.mjs'), 'utf8');
const check = process.argv.includes('--check');
let stale = 0;
for (const name of repositories) {
  const target = resolve(root, '..', name, 'scripts/check-docs.mjs');
  if (!existsSync(resolve(target, '../..', 'package.json'))) { console.warn(`skip ${name}: repository not found`); continue; }
  if (existsSync(target) && readFileSync(target, 'utf8') === source) continue;
  stale++;
  if (check) console.error(`${name}: scripts/check-docs.mjs differs from oh-my-dsh`);
  else { writeFileSync(target, source); console.log(`${name}: updated`); }
}
if (check && stale) process.exitCode = 1;
else if (check) console.log('All documentation checkers match.');
