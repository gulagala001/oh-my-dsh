#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/migrate-dsh016.mjs --project /path/to/clean-base-checkout [--apply] [--install] [--rollback] [--bundle /path/to/override]');
  console.log('The complete default bundle is migrations/dsh016 in this repository. No chat ZIP is required.');
  console.log('Default: dry run. Target: clean c79dd01fc34704b2ca66b511f1ab80b2b938c3db checkout, not this tooling branch.');
} else {
  try {
    const at = args.indexOf('--bundle');
    if (at >= 0 && (!args[at + 1] || args[at + 1].startsWith('--'))) throw new Error('Missing value for --bundle');
    const bundle = at >= 0 ? resolve(args[at + 1]) : fileURLToPath(new URL('../migrations/dsh016/', import.meta.url));
    const info = JSON.parse(readFileSync(join(bundle, 'migration.json'), 'utf8'));
    if (info.version !== '0.4.0-candidate' || info.dsh !== '0.1.6-alpha.1'
      || info.base_commit !== 'c79dd01fc34704b2ca66b511f1ab80b2b938c3db') throw new Error('Unexpected migration bundle. Reconcile versions before applying.');
    for (const name of ['migrate.mjs', 'cc-prompt-adapter.mjs', 'bindings.json', 'prompts/MAIN.md']) {
      if (!existsSync(join(bundle, name))) throw new Error('Missing repository bundle file: ' + name);
    }
    const { main } = await import(pathToFileURL(join(bundle, 'migrate.mjs')).href);
    await main(args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
