// Used only inside the disposable worker, never the working DSH process.
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { problem, LIMITS } from './shared.mjs';

const exit = process.exit.bind(process);
export function launchNativeHost(cli, workspace, observe, separate = process.platform === 'win32') {
  if (process.env.OMD_PLUGIN_PREFLIGHT !== '1') throw problem('host-unavailable', '隔离启动器只能在预检进程中使用');
  // Keep the existing Windows supervision until equivalent detached-browser
  // recovery has been validated there. POSIX uses the shared disposable host.
  if (separate) return launchChildHost(cli, workspace, observe);
  process.chdir(workspace);
  process.argv = [process.execPath, cli, '--profile', 'omd-preflight', '--no-open', '--port', '0'];
  let ready, rejectReady, tail = '';
  const listening = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
  const restores = [process.stdout, process.stderr].map(stream => {
    const write = stream.write;
    stream.write = function (bytes, ...args) {
      tail = (tail + bytes).slice(-LIMITS.logBytes); observe(tail);
      const url = tail.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
      if (url) ready(url);
      return write.call(this, bytes, ...args);
    };
    return () => { stream.write = write; };
  });
  const signals = new Set(process.listeners('SIGTERM'));
  const boot = (async () => {
    const native = await import(pathToFileURL(cli));
    if (typeof native.runDesktopCli === 'function') {
      const runtime = resolve(dirname(cli), '../../../..');
      const archive = dirname(runtime).endsWith('.asar') ? dirname(runtime) : runtime;
      await native.runDesktopCli(runtime, join(dirname(archive), 'runtime'));
    } else if (typeof native.runCli === 'function') await native.runCli();
    else throw problem('host-unavailable', '当前宿主没有可复用的隔离启动入口');
  })();
  void boot.catch(rejectReady);
  return { listening, boot,
    quit(code, onTimeout, timeoutMs = 2500) {
      for (const restore of restores) restore();
      if (!process.listeners('SIGTERM').some(listener => !signals.has(listener))) { exit(code); return; }
      // Keep the native shutdown and process.exit unchanged. The parent accepts
      // success only after this process exits cleanly and its children are gone.
      setTimeout(() => {
        onTimeout(); setTimeout(() => exit(1), 50);
      }, timeoutMs);
      process.emit('SIGTERM');
    },
  };
}

function launchChildHost(cli, workspace, observe) {
  const child = spawn(process.execPath, [...(/[\\/]app\.asar[\\/]/.test(cli) ? ['--expose-internals'] : []), '--max-old-space-size=512', cli,
    '--profile', 'omd-preflight', '--no-open', '--port', '0'], { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const failure = () => problem('host-failed', `隔离 DSH 启动退出（${child.exitCode ?? child.signalCode}）`);
  let tail = '';
  const listening = new Promise((resolve, reject) => {
    const output = bytes => {
      tail = (tail + bytes).slice(-LIMITS.logBytes); observe(tail);
      const url = tail.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0]; if (url) resolve(url);
    };
    child.stdout.on('data', output); child.stderr.on('data', output);
    child.once('error', reject); child.once('exit', () => reject(failure()));
  });
  return { listening, boot: Promise.resolve(),
    assertAlive() { if (child.exitCode !== null || child.signalCode !== null) throw failure(); },
    async quit(code, onTimeout, timeoutMs = 2500) {
      if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => {
        const timer = setTimeout(() => { onTimeout(); child.kill('SIGKILL'); }, timeoutMs);
        child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM');
      });
      exit(code);
    },
  };
}
