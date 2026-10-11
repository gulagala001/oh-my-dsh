import { spawn } from 'node:child_process';

// The small native CLI holds flock until its stdin closes. A crashed host
// automatically releases the OS lock; no stale PID files need to be guessed at.
export async function nativeLock(binary, path) {
  const child = spawn(binary, ['install-lock', path], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  let closed = false, inputError;
  const exit = new Promise(resolve => child.once('close', () => { closed = true; resolve(); }));
  child.on('error', () => {});
  child.stdin.on('error', error => { inputError = error; });
  const finish = async () => {
    if (closed) return;
    const force = setTimeout(() => child.kill('SIGKILL'), 2000);
    let timeout;
    try {
      await Promise.race([exit, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error('桌面控制安装锁进程尚未退出'), { code: 'NATIVE_LOCK_CLEANUP_PENDING' })), 4000);
      })]);
    } finally { clearTimeout(force); clearTimeout(timeout); }
  };
  try {
    await new Promise((resolve, reject) => {
      let output = '', settled = false;
      const done = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        child.off('error', failed); child.off('close', ended); child.stdout.off('data', data); child.stdin.off('error', failed);
        error ? reject(error) : resolve();
      };
      const failed = error => done(error);
      const ended = () => done(new Error('无法锁定桌面控制安装目录'));
      const data = bytes => {
        output += bytes.toString('utf8');
        if (/(?:^|\n)locked\r?\n/.test(output)) done();
        else if (Buffer.byteLength(output) > 4096) done(new Error('桌面控制安装锁返回了无效响应'));
      };
      const timer = setTimeout(() => done(new Error('另一处桌面控制更新尚未结束，请稍后重试')), 30000);
      child.once('error', failed); child.once('close', ended); child.stdout.on('data', data); child.stdin.once('error', failed);
    });
  } catch (error) {
    child.stdin.destroy(); child.kill('SIGTERM');
    try { await finish(); } catch (cleanup) { throw Object.assign(new AggregateError([error, cleanup], '桌面控制安装锁未能完整清理'), { code: 'NATIVE_LOCK_CLEANUP_PENDING' }); }
    throw error;
  }
  let releasing;
  return () => releasing ??= (async () => {
    if (closed) return;
    if (!child.stdin.destroyed) child.stdin.end();
    await finish();
    if (inputError && !['EPIPE', 'ERR_STREAM_DESTROYED'].includes(inputError.code)) throw inputError;
  })();
}
