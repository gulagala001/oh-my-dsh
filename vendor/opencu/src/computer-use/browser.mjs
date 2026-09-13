import { chromium } from 'playwright';
import { fork, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserActions } from './browser-actions.mjs';
export { browserKey } from './browser-actions.mjs';
import { promisify } from 'node:util';
import WebSocket from 'ws';
import { BrowserTransport } from './browser-transport.mjs';

const runFile = promisify(execFile);
export function browserExecutablePath(requested) {
  if (requested) return requested;
  const installed = process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : process.platform === 'win32' ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean).map(base => join(base, 'Google/Chrome/Application/chrome.exe')) : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return installed.find(path => existsSync(path)) ?? chromium.executablePath();
}

// A guardian can close IPC just before its exit event arrives. A failed Stop
// write is not proof that shutdown failed; the owned process exit is decisive.
export async function waitForWindowsGuardian(run, timeoutMs = 12000) {
  let sendError, timer;
  if (run.child.connected) {
    try { run.child.send({ type: 'stop' }, error => { sendError = error; }); }
    catch (error) { sendError = error; }
  }
  try {
    await Promise.race([run.exited, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Windows browser shutdown is still pending; retry Stop.', { cause: sendError })), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

function debuggingEndpoint(address) {
  const [port, path] = (address ?? '').trim().split('\n');
  return /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535 && path?.startsWith('/devtools/browser/') ? `ws://127.0.0.1:${port}${path}` : null;
}

function browserProcessId(endpoint, timeoutMs = 2000) {
  // A port file is not proof of process ownership. A simultaneous launch can
  // lose Chromium's profile lock but still read the winner's debugger address.
  // Query browser-level CDP without attaching pages or handling their dialogs.
  return new Promise((resolve, reject) => {
    let socket, opened = false, finished = false;
    const finish = (error, pid) => {
      if (finished) return; finished = true; clearTimeout(timer);
      socket?.terminate();
      if (error) reject(Object.assign(error, { connected: opened })); else resolve(pid);
    };
    const timer = setTimeout(() => finish(Object.assign(new Error('Browser process verification timed out'), { retryable: true })), timeoutMs);
    try { socket = new WebSocket(endpoint); } catch (error) { finish(error); return; }
    socket.addEventListener('open', () => {
      opened = true;
      try { socket.send(JSON.stringify({ id: 1, method: 'SystemInfo.getProcessInfo' })); } catch (error) { finish(error); }
    });
    socket.addEventListener('error', () => finish(Object.assign(new Error('Could not connect to the browser debugger'), { retryable: true })));
    socket.addEventListener('close', () => finish(Object.assign(new Error('Browser debugger closed'), { retryable: true })));
    socket.addEventListener('message', event => {
      try {
        const reply = JSON.parse(event.data); if (reply.id !== 1) return;
        const pid = reply.result?.processInfo?.find(process => process.type === 'browser')?.id;
        if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Browser debugger did not identify its owning process');
        finish(null, pid);
      } catch (error) { finish(error); }
    });
  });
}

export class BrowserHost extends BrowserActions {
  constructor(directory, { executablePath, headless = true, onTabClosed, onBrowserLost, onPointer, wantsPointer, onVisit } = {}) {
    super({ onTabClosed, onBrowserLost, onPointer, wantsPointer, onVisit });
    this.directory = directory; this.executablePath = executablePath; this.headless = headless;
  }
  async start() {
    if (this.closing) throw new Error('Computer Use browser is shutting down');
    if (!this.starting) {
      const pending = this.launch().catch(error => { if (this.starting === pending) this.starting = null; throw error; });
      this.starting = pending;
    }
    return this.starting;
  }
  async launch() {
    if (this.run) await this.terminateBrowser(this.run);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (this.closing) throw new Error('Computer Use browser is shutting down');
    // Use the installed browser with its normal OS credential storage. The
    // bundled fallback also keeps real storage; never apply Playwright's mock
    // keychain flags to a profile that holds the user's website logins.
    const executable = browserExecutablePath(this.executablePath);
    this.runtimePath = executable;
    if (!existsSync(executable)) throw new Error('Browser runtime is missing. Install Chromium with: pnpm exec playwright install chromium');
    const portFile = join(this.directory, 'DevToolsActivePort');
    let previousAddress;
    try { previousAddress = await readFile(portFile, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const existingEndpoint = debuggingEndpoint(previousAddress);
    if (existingEndpoint) {
      let active = false;
      try { await browserProcessId(existingEndpoint, 750); active = true; }
      catch (error) { if (error.connected) throw new Error('Computer Use browser profile is already in use or not responding.'); }
      if (active) throw new Error('Computer Use browser profile is already in use by another running instance.');
    }
    await rm(portFile, { force: true });
    if (this.closing) throw new Error('Computer Use browser is shutting down');
    const run = { id: randomUUID(), ready: false, lost: false, requestedStop: false, stderr: '', phase: 'guardian', portFileState: 'unread' }; this.run = run;
    // Full-page Chromium capture hides scrollbars internally. Use that same
    // rendering policy from the first layout in our headless profile so a
    // screenshot cannot change gutter width, wrapping or responsive breakpoints.
    const args = [executable, `--user-data-dir=${this.directory}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', '--no-startup-window', '--disable-background-networking', '--enable-blink-features=WebMCP', ...(this.headless ? ['--headless=new', '--hide-scrollbars'] : [])];
    if (process.env.TRISOUL_CU_BROWSER_DIAGNOSTICS === '1') args.push('--enable-logging', '--log-file=' + join(this.directory, 'startup.log'));
    const child = fork(new URL('./browser-process.mjs', import.meta.url), args, { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true, detached: process.platform !== 'win32' });
    run.child = child; this.child = child; this.browserPid = null;
    run.exited = new Promise(resolve => {
      child.once('error', error => { run.launchError = error; this.invalidate(run, error); resolve(); });
      child.once('exit', (code, signal) => {
        this.invalidate(run, new Error(`Browser guardian exited (${code ?? signal})`)); resolve();
        // If the guardian itself crashes, the still-live owner takes over
        // cleanup immediately. Old CDP requests must not keep acting.
        void this.terminateBrowser(run).catch(error => { run.cleanupError = error; });
      });
    });
    child.on('message', message => {
      if (message.type === 'browser-job-started') { run.jobPid = message.pid; run.phase = 'job-helper'; }
      if (message.type === 'browser-job-owned') run.phase = 'job-retained';
      if (message.type === 'browser-started') { run.browserPid = message.pid; run.phase = 'browser-started'; if (this.run === run) this.browserPid = message.pid; }
      if (message.type === 'launch-error') run.launchError = new Error(message.message);
      if (message.type === 'browser-exited') { run.launchError ??= new Error(`Browser exited (${message.code ?? message.signal})` + (run.stderr.trim() ? ': ' + run.stderr.trim() : '')); this.invalidate(run, run.launchError); }
      if (message.type === 'cleanup-error') run.cleanupError = new Error(message.message);
    });
    child.stderr.on('data', data => { run.stderr = (run.stderr + data.toString()).slice(-8192); });
    // A cold Windows profile can still be initializing after 15 seconds.
    // Bound the entire launch, including debugger connection retries.
    const deadline = Date.now() + (process.platform === 'win32' ? 30000 : 15000);
    try {
      while (Date.now() < deadline) {
        if (this.closing) throw new Error('Computer Use browser is shutting down');
        if (run.launchError) throw run.launchError;
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Browser exited during startup (${child.exitCode ?? child.signalCode}). The Computer Use profile may already be open.`);
        let address;
        // Chrome can hold an exclusive Windows handle while publishing this
        // file. Retry within the existing startup deadline, then still verify
        // the debugger's actual PID before claiming the profile.
        try { address = await readFile(portFile, 'utf8'); run.portFileState = debuggingEndpoint(address) ? 'valid' : 'partial'; }
        catch (error) { run.portFileState = error.code; if (!['ENOENT', 'EBUSY'].includes(error.code)) throw error; }
        if (run.lost || run.launchError) throw run.launchError ?? new Error('Browser exited during startup');
        const endpoint = debuggingEndpoint(address);
        if (endpoint && run.browserPid) {
          let pid;
          try { pid = await browserProcessId(endpoint, Math.max(1, Math.min(2000, deadline - Date.now()))); }
          catch (error) {
            if (!error.retryable) throw error;
            run.verificationError = error.message;
            await delay(40); continue;
          }
          if (pid !== run.browserPid) throw new Error('Browser debugger belongs to another process; the profile is already in use.');
          if (run.lost || run.launchError) throw run.launchError ?? new Error('Browser exited during startup');
          this.endpoint = run.endpoint = endpoint; run.ready = true; return run;
        }
        await delay(40);
      }
      throw new Error('Browser startup timed out' + (run.stderr.trim() ? ': ' + run.stderr.trim() : ''), {
        cause: { phase: run.phase, browserPid: run.browserPid, jobPid: run.jobPid, portFile: run.portFileState, verification: run.verificationError },
      });
    } catch (error) { await this.terminateBrowser(run); throw error; }
  }
  invalidate(run, reason) {
    if (this.run !== run || run.lost || run.requestedStop) return;
    run.lost = true;
    if (!run.ready) return;
    this.endpoint = null; this.starting = null;
    const tabs = [...this.records.keys()];
    this.records.clear(); this.owners.clear(); this.connections.clear();
    const error = Object.assign(new Error('浏览器已退出，请重新打开浏览器。旧页面引用已失效。'), { code: 'BROWSER_DISCONNECTED', cause: reason });
    this.onBrowserLost?.(tabs, error, run.id);
    for (const id of tabs) this.onTabClosed?.(id);
  }
  checkConnection(connection) {
    if (connection.run !== this.run || connection.run.lost || this.closing) throw Object.assign(new Error('The browser exited. Bind a current browser tab again.'), { code: 'BROWSER_DISCONNECTED' });
  }
  async connection(sessionId) {
    if (this.disconnecting?.has(sessionId)) await this.disconnecting.get(sessionId);
    if (!this.connections.has(sessionId)) {
      const pending = (async () => {
        const run = await this.start();
        const transport = new BrowserTransport(run.endpoint, this.onPointer && (event => this.onPointer({ ...event, sessionId, tabId: event.targetId })), targetId => this.wantsPointer?.(sessionId, targetId) ?? true);
        let browser;
        try { browser = await chromium.connectOverCDP(transport, { isLocal: true }); }
        catch (error) { transport.close(); throw error; }
        if (run !== this.run || run.lost || this.closing) { await browser.close(); throw new Error('The browser exited while connecting'); }
        const context = browser.contexts()[0]; context.setDefaultTimeout(8000); context.setDefaultNavigationTimeout(15000);
        // CDP exposes every page in this profile. Playwright's default is to
        // dismiss unhandled dialogs, which would let a read-only observer
        // change another tab. Only an explicit target action may answer one.
        context.on('dialog', () => {});
        const connection = { browser, context, pages: new Map(), run };
        browser.on('disconnected', () => { if (this.connections.get(sessionId) === pending) this.connections.delete(sessionId); });
        try {
          const monitor = await browser.newBrowserCDPSession();
          monitor.on('Target.targetInfoChanged', ({ targetInfo }) => {
            if (run !== this.run || run.lost || connection.closing || this.closing) return;
            const info = this.records.get(targetInfo.targetId);
            if (info) this.records.set(info.id, { ...info, title: targetInfo.title, url: targetInfo.url });
          });
          // Observe title and same-document URL changes even while the pane is
          // hidden. Discovery does not attach pages or answer their dialogs.
          await monitor.send('Target.setDiscoverTargets', { discover: true, filter: [{ type: 'page' }, { exclude: true }] });
          this.checkConnection(connection);
        } catch (error) { await browser.close(); throw error; }
        return connection;
      })().catch(error => { if (this.connections.get(sessionId) === pending) this.connections.delete(sessionId); throw error; });
      this.connections.set(sessionId, pending);
    }
    return this.connections.get(sessionId);
  }
  async list(sessionId) {
    const connection = await this.connection(sessionId);
    if (connection.listing) return connection.listing;
    connection.listing = (async () => {
      const result = [];
      for (const page of connection.context.pages()) {
        if (page.isClosed()) continue;
        try {
          const record = await this.bind(connection, page);
          const { targetInfo } = await record.cdp.send('Target.getTargetInfo');
          this.checkConnection(connection);
          const info = { id: record.id, browserId: 'browser', title: targetInfo.title, url: page.url(), owner: this.owners.get(record.id)?.sessionId ?? null };
          this.records.set(record.id, info); result.push(info);
        } catch (error) {
          // A page may close after pages() but before its CDP reply. This is
          // ordinary list churn; a lost connection is still an actual error.
          if (!connection.closing && connection.browser.isConnected() && (page.isClosed() || /Target page, context or browser has been closed|No target with given id/.test(error.message))) continue;
          throw error;
        }
      }
      return result;
    })().finally(() => { connection.listing = null; });
    return connection.listing;
  }
  async create(sessionId, url = 'about:blank', signal) {
    signal?.throwIfAborted();
    const connection = await this.connection(sessionId);
    signal?.throwIfAborted();
    const abort = () => { void this.disconnect(sessionId).catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    let page;
    try {
      page = await connection.context.newPage(); signal?.throwIfAborted();
      const record = await this.bind(connection, page); this.claim(sessionId, record.id, true);
      const preset = this.viewportPresets.get(sessionId);
      if (preset) { await this.setViewport(record, preset.size); record.viewportPreset = preset.id; }
      signal?.throwIfAborted(); record.navigating = true;
      try { await page.goto(url, { waitUntil: 'domcontentloaded' }); } finally { record.navigating = false; }
      signal?.throwIfAborted();
      const info = { id: record.id, browserId: 'browser', title: await page.title(), url: page.url() };
      this.checkConnection(connection); this.records.set(record.id, info); return info;
    } catch (error) { if (page) await page.close().catch(() => {}); throw error; }
    finally { signal?.removeEventListener('abort', abort); }
  }
  async target(sessionId, id, { claim = true, signal } = {}) {
    signal?.throwIfAborted();
    if (!this.records.has(id)) throw new Error('This tab has closed or its browser exited. List tabs and explicitly choose a current target.');
    const connection = await this.connection(sessionId);
    if (!connection.pages.has(id)) await this.list(sessionId);
    signal?.throwIfAborted();
    const record = connection.pages.get(id);
    if (!record || record.page.isClosed()) throw new Error('This tab has closed. List tabs and explicitly choose a current target.');
    if (claim) this.claim(sessionId, id);
    return record;
  }
  async disconnect(sessionId) {
    this.viewportPresets.delete(sessionId);
    if (this.disconnecting?.has(sessionId)) return this.disconnecting.get(sessionId);
    const pending = this.connections.get(sessionId);
    this.connections.delete(sessionId);
    const closing = (async () => {
      if (!pending) return;
      const c = await pending.catch(() => null); if (!c) return;
      c.closing = true;
      const releases = await Promise.allSettled([...c.pages.values()].map(async record => {
        // Unloading destroys this owned browser. A metrics restore racing its
        // termination can leave Chromium's acknowledgement pending forever.
        // Ordinary stop keeps the browser alive and must still restore sizing.
        const results = await Promise.allSettled([record.navigating ? record.cdp.send('Page.stopLoading') : Promise.resolve(), this.releaseInput(record), this.closing ? Promise.resolve() : this.resetViewport(record)]);
        const failed = results.filter(r => r.status === 'rejected').map(r => r.reason);
        if (failed.length) throw new AggregateError(failed, failed.map(e => e.message).join('; '));
      }));
      const failures = releases.filter(r => r.status === 'rejected').map(r => r.reason);
      if (failures.length && [...c.pages.values()].some(record => record.webmcp?.active.size)) {
        c.closing = false;
        if (!this.connections.has(sessionId)) this.connections.set(sessionId, pending);
        throw new AggregateError(failures, 'Could not confirm WebMCP cancellation; retry stop.');
      }
      await c.browser.close({ reason: 'Computer Use session stopped' });
      if (failures.length) throw new AggregateError(failures, 'Could not release browser input: ' + failures.map(e => e.message).join('; '));
    })();
    this.disconnecting ??= new Map(); this.disconnecting.set(sessionId, closing);
    try { await closing; } finally { if (this.disconnecting.get(sessionId) === closing) this.disconnecting.delete(sessionId); }
  }
  async endTurn(sessionId) {
    this.viewportPresets.delete(sessionId);
    const pending = this.connections.get(sessionId), c = pending ? await pending.catch(() => null) : null;
    for (const [id, owner] of [...this.owners]) {
      if (owner.sessionId !== sessionId) continue;
      if (owner.created && !owner.keep) await c?.pages.get(id)?.page.close().catch(() => {});
      else if(c?.pages.has(id))await this.resetViewport(c.pages.get(id));
      this.owners.delete(id);
    }
  }
  async close() {
    this.closing = true;
    const pending = Promise.allSettled([...new Set([...this.connections.keys(), ...(this.disconnecting?.keys() ?? [])])].map(id => this.disconnect(id)));
    await this.terminateBrowser();
    const results = await pending;
    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason);
    if (errors.length) throw new AggregateError(errors, 'Browser stopped after cleanup errors: ' + errors.map(e => e.message).join('; '));
  }
  async terminateBrowser(run = this.run) {
    if (run?.terminating) return run.terminating;
    const child = run?.child;
    if (!child?.pid) { child?.stderr?.destroy(); return; }
    if (run.terminated) return;
    run.requestedStop = true;
    const pending = (async () => {
      if (process.platform === 'win32') {
        if (child.exitCode === null && child.signalCode === null) {
          // The guardian owns the browser's exit handle. Killing the guardian
          // first loses that confirmation while Chrome still holds its files.
          await waitForWindowsGuardian(run);
        }
        if (run.cleanupError) throw run.cleanupError;
      } else {
        const signal = async value => {
          try { process.kill(-child.pid, value); return true; }
          catch (error) {
            if (error.code === 'ESRCH') return false;
            if (error.code === 'EPERM') {
              // macOS can report EPERM while the last group member is being
              // reaped. Check live members before treating this as a failure;
              // an actual live process that refuses termination still fails.
              const { stdout } = await runFile('/bin/ps', ['-ax', '-o', 'pgid=,stat='], { timeout: 2000 });
              const live = stdout.split('\n').some(line => { const [group, status] = line.trim().split(/\s+/); return Number(group) === child.pid && status && !status.startsWith('Z'); });
              if (!live) return false;
              if (value === 0) return true;
            }
            throw error;
          }
        };
        await signal('SIGTERM');
        const end = Date.now() + 2000;
        while (await signal(0) && Date.now() < end) await delay(25);
        if (await signal(0)) {
          await signal('SIGKILL');
          const killedBy = Date.now() + 1000;
          while (await signal(0) && Date.now() < killedBy) await delay(25);
          if (await signal(0)) throw new Error('Browser process group did not terminate');
        }
      }
      // Forked launch helpers can keep this pipe open after their parent exits.
      child.stderr?.destroy();
      await run.exited;
      run.terminated = true;
    })();
    run.terminating = pending;
    try { await pending; } finally { if (run.terminating === pending) run.terminating = null; }
  }
}
