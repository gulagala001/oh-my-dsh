import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPluginRuntimeExecutable, getPluginRuntimeState, installPluginRuntime } from '../native/plugin-runtime/artifact.mjs';

// Compatibility command only; custom complete distributions are no longer accepted.
export async function preparePluginBrowserEngine(options = {}) {
  if (Object.hasOwn(options, 'dist') || Object.hasOwn(options, 'identity') || Object.hasOwn(options, 'signing')) {
    throw new Error('OpenCU uses official Electron prebuilt archives; custom engine distributions are not supported');
  }
  return installPluginRuntime(options);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/prepare-plugin-engine.mjs [--check|--path]\nnode scripts/prepare-plugin-engine.mjs --archive /absolute/official-electron.zip\nCompatibility alias for the official shared runtime installer. Offline archives must match the pinned official SHA-256.');
    return;
  }
  if (args.length === 1 && args[0] === '--path') { console.log(await getPluginRuntimeExecutable()); return; }
  if (args.length === 1 && args[0] === '--check') {
    const state = await getPluginRuntimeState();
    console.log(JSON.stringify(state, null, 2));
    if (!state.available) process.exitCode = 1;
    return;
  }
  if (args.length && (args.length !== 2 || args[0] !== '--archive' || !isAbsolute(args[1]))) {
    throw new Error('Usage: node scripts/prepare-plugin-engine.mjs [--check|--path|--archive ABSOLUTE_OFFICIAL_ZIP]');
  }
  console.log(JSON.stringify(await preparePluginBrowserEngine(args.length ? { archive: args[1] } : undefined), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
