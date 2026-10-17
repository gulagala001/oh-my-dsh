// Run actual SDK lifecycle tests with the Node flag required by native DSH HMR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('native rc.2 recommended update lifecycle (seven SDK cases)', { timeout: 125000 }, () => {
  const suite = fileURLToPath(new URL('./fixtures/recommended-native-lifecycle.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--expose-internals', '--unhandled-rejections=strict', '--test', suite], {
    encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stdout + result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  // Preserve the inner seven-case results in CI logs instead of implying seven top-level cases.
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
});
