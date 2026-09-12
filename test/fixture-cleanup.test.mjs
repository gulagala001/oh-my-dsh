import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { stopFixtureProcess } from './fixtures/process.mjs';
import { windowsProcessTree } from './fixtures/computer-use/windows-processes.mjs';

test('a cleanup failure closes the HTTP fixture and exits with the original error', async () => {
  const module = new URL('./fixtures/process.mjs', import.meta.url).href;
  await assert.rejects(promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
    import {createServer} from 'node:http';
    import {cleanupFixture,closeFixtureServer} from ${JSON.stringify(module)};
    const server=createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    await cleanupFixture([()=>{throw new Error('injected process cleanup failure');},()=>closeFixtureServer(server)]);
  `], { timeout: 5000 }), error => {
    assert.equal(error.killed, false, 'the child must exit on its own, not hit the outer timeout');
    assert.equal(error.code, 1);
    assert.match(error.stderr, /injected process cleanup failure/);
    return true;
  });
});

test('fixture shutdown confirms the child exited and closes its pipes', { timeout: 30000 }, async t => {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000);console.log("ready")'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await once(child.stdout, 'data');
  await stopFixtureProcess(child);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
});

test('Windows fixture trees exclude children of a previous process with a reused PID', () => {
  const snapshot = [{pid:1,parent:0,created:'100'}, {pid:2,parent:1,created:'50'}, {pid:3,parent:1,created:'110'}, {pid:4,parent:3,created:'120'}];
  assert.deepEqual(windowsProcessTree(snapshot,1).map(process=>process.pid), [1,3,4]);
});
