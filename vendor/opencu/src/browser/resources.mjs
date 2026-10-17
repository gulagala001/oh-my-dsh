import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);

/** Installs the matching Playwright resource only on an explicit settings action. */
export function createBrowserResources() {
  let running, child, terminating, closed = false, error = null, output = '';
  async function status() {
    const { chromium } = await import('playwright');
    let installed = false;
    try { await access(chromium.executablePath(), constants.X_OK); installed = true; }
    catch (error) { if (!['ENOENT', 'EACCES'].includes(error.code)) throw error; }
    return { installed, installing: !!running, error, output: output.slice(-4000) };
  }
  async function terminate() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    terminating ??= (async () => {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        await new Promise((resolve, reject) => { killer.once('error', reject); killer.once('close', code => code === 0 ? resolve() : reject(new Error(`Browser installer cancellation failed (${code})`))); });
      } else {
        try { process.kill(-child.pid, 'SIGTERM'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    })();
    await terminating;
  }
  return {
    status,
    async install(signal) {
      if (closed) throw new Error('OpenCU browser resource installer is closed');
      signal?.throwIfAborted();
      if (running) return running;
      if ((await status()).installed) return status();
      if (closed) throw new Error('OpenCU browser resource installer is closed');
      if (running) return running;
      signal?.throwIfAborted();
      error = null; output = ''; terminating = undefined;
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        /^(PATH|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TMPDIR|TMP|TEMP|SYSTEMROOT|WINDIR|COMSPEC|HTTP_PROXY|HTTPS_PROXY|NO_PROXY|PLAYWRIGHT_BROWSERS_PATH|PLAYWRIGHT_DOWNLOAD_HOST|PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST|NODE_EXTRA_CA_CERTS)$/i.test(key)));
      env.ELECTRON_RUN_AS_NODE = '1';
      const cli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
      child = spawn(process.execPath, [cli, 'install', 'chromium'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
      const append = data => { output = (output + data).slice(-8000); };
      child.stdout.on('data', append); child.stderr.on('data', append);
      const abort = () => { void terminate().catch(value => { error = value.message; }); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      running = new Promise((resolve, reject) => {
        let startError;
        child.once('error', value => { startError = value; });
        child.once('close', (code, exitSignal) => {
          if (startError) reject(startError);
          else if (code !== 0 || exitSignal) reject(new Error(`Browser resource installation ${closed || signal?.aborted ? 'cancelled' : 'failed'} (${exitSignal ?? code})\n${output.slice(-2000)}`));
          else resolve();
        });
      }).then(async () => {
        const result = await status();
        if (!result.installed) throw new Error('Browser resource installer exited without the expected Chromium executable');
        return { ...result, installing: false };
      }).catch(value => { error = value.message; throw value; }).finally(() => {
        signal?.removeEventListener('abort', abort); running = undefined; child = undefined;
      });
      return running;
    },
    async close() {
      closed = true;
      if (!running) return;
      const pending = running;
      await terminate();
      try { await pending; } catch (error) { /* Cancellation failure remains in status; the installer has exited. */ }
    },
  };
}
