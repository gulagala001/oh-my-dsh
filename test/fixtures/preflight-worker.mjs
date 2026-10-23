import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
const { scenario, channelKey, root } = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (scenario === 'exit') process.exit(3);
if (scenario === 'forged') process.send({ type: 'result', result: { ok: true } }, () => process.exit(0));
else if (scenario === 'cleanup-failure') process.send({ channelKey, type: 'result', result: { ok: true } }, () => process.exit(1));
else if (scenario === 'early-browser') {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},10000)', '--', '--user-data-dir=' + join(root, 'browser')], { detached: true, stdio: 'ignore' });
  process.send({ channelKey, type: 'phase', stage: 'runtime', message: 'child:' + child.pid }, () => process.kill(process.pid, 'SIGKILL'));
}
else if (scenario === 'orphan') {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},10000)'], { detached: true, stdio: 'ignore' });
  process.send({ channelKey, type: 'phase', stage: 'runtime', message: 'child:' + child.pid });
  setTimeout(() => process.exit(3), 1200);
} else if (scenario === 'wait') {
  process.send({ channelKey, type: 'phase', stage: 'runtime', message: 'fixture running' });
  setInterval(() => {}, 10000);
} else {
  process.send({ channelKey, type: 'result', result: { ok: scenario === 'pass', code: 'fixture-failure', message: 'fixture failure' } }, () => process.exit(scenario === 'pass' ? 0 : 1));
}
