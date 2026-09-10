import { openSync, closeSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:3083';
const logPath = join(root, 'data', 'dsh-stage.log');
const ready = async () => {
  try { await fetch(origin, { signal: AbortSignal.timeout(800) }); return true; }
  catch { return false; }
};

try {
  if (!await ready()) {
    const log = openSync(logPath, 'w', 0o600);
    const child = spawn(process.execPath, [join(root, 'scripts', 'start.mjs')], {
      cwd: root, detached: true, stdio: ['ignore', log, log],
      env: { ...process.env, PORT: '3083', DSH_HOME: join(root, 'data', 'dsh'), PATH: `${dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}` },
    });
    let startError;
    child.on('error', error => { startError = error; });
    child.unref(); closeSync(log);
    const deadline = Date.now() + 45000;
    while (!await ready()) {
      if (startError || child.exitCode !== null || Date.now() >= deadline) throw new Error(`3083 启动失败，请查看 ${logPath}`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  // The listener becomes ready before DSH finishes printing its login link.
  let url;
  const loginDeadline = Date.now() + 15000;
  while (!url && Date.now() < loginDeadline) {
    let candidate;
    try { candidate = readFileSync(logPath, 'utf8').match(/http:\/\/127\.0\.0\.1:3083\/\?token=[\w-]+/g)?.at(-1); } catch {}
    if (candidate) {
      try {
        const response = await fetch(candidate, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
        if (response.status === 302 || response.status === 303) url = candidate;
      } catch {}
    }
    if (!url) await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!url) throw new Error(`3083 的登录链接尚未就绪，请查看 ${logPath}`);
  execFileSync('/usr/bin/open', [url], { stdio: 'ignore' });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
