import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPluginRuntimeState, getPluginRuntimeExecutable, getPluginRuntimeProcessState, installPluginRuntime } from '../native/plugin-runtime/artifact.mjs';

export { getPluginRuntimeState, getPluginRuntimeExecutable, getPluginRuntimeProcessState };

// Browser and native presentation helpers launch this same immutable official
// distribution in separate private processes. Requests never install a runtime.
export async function preparePluginRuntime({ sourceOnly = false, ...options } = {}) {
  if (typeof sourceOnly !== 'boolean') throw new TypeError('OpenCU runtime: sourceOnly must be a boolean');
  if (sourceOnly) {
    const state = await getPluginRuntimeState(options);
    if (state.available) return state.executable;
    if (state.reason !== 'artifact-missing' && state.reason !== 'unsupported-target') {
      const error = new Error(state.detail); error.code = 'OPENCU_RUNTIME_UNAVAILABLE'; error.state = state; throw error;
    }
    console.warn(`OpenCU source-only installation: official runtime is unavailable (${state.reason}). Run npm run prepare:runtime before using the browser or presentation helper.`);
    return undefined;
  }
  return (await installPluginRuntime(options)).executable;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length && !['--check', '--path', '--source-only', '--help'].includes(args[0])) {
    throw new Error('Usage: node scripts/prepare-plugin-runtime.mjs [--check|--path|--source-only]');
  }
  if (args[0] === '--help') {
    console.log('node scripts/prepare-plugin-runtime.mjs [--check|--path|--source-only]\nInstalls the pinned official Electron prebuilt distribution. Browser and presentation processes share its installation. No browser build, Xcode, custom engine or host modification is required. OPENCU_SOURCE_ONLY=1 skips runtime downloading for source dependency work.');
    return;
  }
  if (args[0] === '--check') {
    const state = await getPluginRuntimeState();
    console.log(JSON.stringify(state, null, 2));
    if (!state.available) process.exitCode = 1;
    return;
  }
  if (args[0] === '--path') { console.log(await getPluginRuntimeExecutable()); return; }
  const executable = await preparePluginRuntime({ sourceOnly: args[0] === '--source-only' || process.env.OPENCU_SOURCE_ONLY === '1' });
  if (executable) console.log(`OpenCU official Electron runtime installed: ${executable}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
