#!/usr/bin/env node
// The versioned migration bundle contains the independently maintained prompt files.
// No package installation, profile mutation or service restart occurs by default.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const at = args.indexOf('--bundle');
if (at < 0 || !args[at + 1] || args[at + 1].startsWith('--')) {
  console.error('Usage: node scripts/migrate-dsh016.mjs --bundle /path/to/TriSoulX_CC_DSH016_candidate --project /path/to/base-checkout [--apply] [--install] [--rollback]');
  process.exit(2);
}
const bundle = resolve(args[at + 1]);
try {
  const info = JSON.parse(readFileSync(join(bundle, 'migration.json'), 'utf8'));
  if (info.version !== '0.4.0-candidate' || info.dsh !== '0.1.6-alpha.1'
    || info.base_commit !== 'c79dd01fc34704b2ca66b511f1ab80b2b938c3db') {
    throw new Error('Unexpected migration bundle. Reconcile versions instead of applying an unreviewed patch.');
  }
  for (const name of ['migrate.mjs', 'cc-prompt-adapter.mjs', 'bindings.json', 'prompts/MAIN.md']) {
    if (!existsSync(join(bundle, name))) throw new Error('Missing migration bundle file: ' + name);
  }
  const { main } = await import(pathToFileURL(join(bundle, 'migrate.mjs')).href);
  await main(args);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
