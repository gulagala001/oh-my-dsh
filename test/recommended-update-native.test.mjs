// Run actual SDK lifecycle tests with the Node flag required by native DSH HMR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('native rc.3 feature and update lifecycle (twelve SDK cases)', { timeout: 125000 }, () => {
  const suite = fileURLToPath(new URL('./fixtures/recommended-native-lifecycle.mjs', import.meta.url));
  const env = { ...process.env, NO_COLOR: '1' };
  // A nested runner must not inherit the outer node:test worker context.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--expose-internals', '--unhandled-rejections=strict', '--test', '--test-reporter=tap', suite], {
    encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    env,
  });
  // Keep diagnostics even when bootstrap, timeout or the coverage guard fails.
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stdout + result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  // Exit zero alone also accepts an empty/skipped recursive runner: require all twelve SDK cases.
  for (const [field, count] of Object.entries({ tests: 12, pass: 12, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    assert.match(result.stdout, new RegExp(`^# ${field} ${count}$`, 'm'), `Missing native TAP summary: ${field}=${count}`);
  }
});
