import { spawn } from 'node:child_process';

// The small native CLI holds flock until its stdin closes. A crashed host
// automatically releases the OS lock; no stale PID files need to be guessed at.
export async function nativeLock(binary, path) {
  const child = spawn(binary, ['install-lock', path], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('另一处桌面控制更新尚未结束，请稍后重试')); }, 30000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('无法锁定桌面控制安装目录')); });
    child.stdout.on('data', data => { output += data; if (output.includes('locked\n')) { clearTimeout(timer); resolve(); } });
  });
  return async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.stdin.end();
    });
  };
}
