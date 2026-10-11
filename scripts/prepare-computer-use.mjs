import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep the installer, checksum pins and source-only behavior owned by OpenCU.
export async function prepareComputerUse(options = {}) {
  const { preparePluginRuntime } = await import('../vendor/opencu/scripts/prepare-plugin-runtime.mjs');
  return preparePluginRuntime({ sourceOnly: process.env.OPENCU_SOURCE_ONLY === '1', ...options });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const installer = fileURLToPath(new URL('../vendor/opencu/scripts/prepare-plugin-runtime.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [installer, ...process.argv.slice(2)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exitCode = result.status ?? 1;
}
