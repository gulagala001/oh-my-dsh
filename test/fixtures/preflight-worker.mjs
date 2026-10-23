import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const { scenario } = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (scenario === 'exit') process.exit(3);
if (scenario === 'orphan') {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},10000)'], { detached: true, stdio: 'ignore' });
  process.send({ type: 'phase', stage: 'runtime', message: 'child:' + child.pid });
  setTimeout(() => process.exit(3), 1200);
} else if (scenario === 'wait') {
  process.send({ type: 'phase', stage: 'runtime', message: 'fixture running' });
  setInterval(() => {}, 10000);
} else {
  process.send({ type: 'result', result: { ok: scenario === 'pass', code: 'fixture-failure', message: 'fixture failure' } }, () => process.exit(scenario === 'pass' ? 0 : 1));
}
