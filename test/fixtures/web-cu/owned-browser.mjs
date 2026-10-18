// Extracted test-only lifecycle predicates from gulagala001/opencu e545798ac8d1dc8c4e3e3cdd322961650aca5461.
// Source test/extension-pairing-real.test.mjs SHA256 bc97d5670c5b5125a57e2803f61399d6b1be528c6432a15da092f097b46b9172.
import { spawn, execFile } from 'node:child_process';
import { readFile as rawReadFile, realpath as rawRealpath, stat as rawStat, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const forbidden = /no-sandbox|disable-setuid-sandbox|disable-web-security|LocalNetworkAccessChecks|HttpsUpgrades/;
class HarnessFailure extends Error {
  constructor(check) { super('Known harness check failed'); this.check = check; }
}
const safeAssert = (condition, check) => { if (!condition) throw new HarnessFailure(check); };

const runtimeEndpoints = new Set(['capabilities', 'connectBrowser', 'targets', 'browserSettings/forget']);
const errorNames = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'TimeoutError', 'AbortError', 'TargetClosedError']);
const errorCodes = new Set(['PAIRING_DECLINED', 'PAIRING_TIMEOUT', 'PAIRING_IN_PROGRESS', 'BROWSER_EXTENSION_UNAVAILABLE', 'BROWSER_CHOICE_REQUIRED', 'EXTENSION_UNAVAILABLE', 'CLOSED', 'CLOSING', 'STALE_CONNECTION', 'UNAUTHORIZED', 'CONSENT_REQUIRED', 'CONTROL_STOPPED', 'COMMAND_TIMEOUT', 'DISCONNECTED', 'RELEASE_FAILED', 'ENOENT', 'EACCES', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ABORT_ERR', 'ERR_ABORTED', 'ERR_STREAM_PREMATURE_CLOSE', 'ERR_SOCKET_CLOSED', 'ERR_TARGET_CLOSED', 'ERR_HTTP_HEADERS_SENT']);
const failureContexts = new WeakMap();
export const operationFailureContext = error => failureContexts.get(error);
function externalIdentity(error) {
  let name = 'unknown', code = 'unknown';
  try { if (errorNames.has(error?.name)) name = error.name; if (errorCodes.has(error?.code)) code = error.code; } catch {}
  const category = name === 'TimeoutError' || ['ETIMEDOUT', 'COMMAND_TIMEOUT', 'PAIRING_TIMEOUT'].includes(code) ? 'timeout'
    : name === 'AbortError' || ['ABORT_ERR', 'ERR_ABORTED'].includes(code) ? 'cancelled'
    : name === 'TargetClosedError' || ['ERR_TARGET_CLOSED', 'ERR_SOCKET_CLOSED', 'DISCONNECTED'].includes(code) ? 'transport-closed' : 'external-operation';
  return { name, code, category };
}
export function singleFlight(action) { let work; return () => work ??= Promise.resolve().then(action); }
function operationScope(controller = new AbortController(), onCancel = () => {}, event = () => {}) {
  const pending = new Set(), lateFailures=[]; let cancelStarted = false, cancellation;
  const cancel = reason => { if (!controller.signal.aborted) { event('cancel', reason); controller.abort(new HarnessFailure('overall operation cancelled')); } };
  controller.signal.addEventListener('abort', () => { if (!cancelStarted) { cancelStarted = true; cancellation = run('owner-cancel', onCancel, { cleanup: true, timeout: 10000 }); cancellation.catch(() => {}); } }, { once: true });
  const run = (label, start, { timeout = 8000, signal, cleanup = false, endpoint } = {}) => {
    const local = new AbortController();
    const combined = AbortSignal.any([local.signal, ...(!cleanup ? [controller.signal] : []), ...(signal ? [signal] : [])]);
    if (combined.aborted) return Promise.reject(new HarnessFailure('operation cancelled before start'));
    const entry = { label, settled: false };
    const underlying = Promise.resolve().then(() => { if (combined.aborted) throw new HarnessFailure('operation cancelled before start'); return start(combined); });
    pending.add(entry);
    entry.done = underlying.then(() => { entry.settled = true; pending.delete(entry); }, () => { entry.settled = true; pending.delete(entry); });
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (fn, value) => { if (finished) return; finished = true; clearTimeout(timer); combined.removeEventListener('abort', aborted); fn(value); };
      const rejectKnown = error => { if (error && typeof error === 'object' && !failureContexts.has(error)) failureContexts.set(error, { operation: label, endpoint: runtimeEndpoints.has(endpoint) ? endpoint : 'none' }); finish(reject, error); };
      const aborted = () => rejectKnown(new HarnessFailure('operation cancelled'));
      const timer = setTimeout(() => { event('deadline', label); rejectKnown(new HarnessFailure('operation budget exceeded')); local.abort(new HarnessFailure('operation budget exceeded')); if (!cleanup) cancel('operation-deadline'); }, timeout);
      combined.addEventListener('abort', aborted, { once: true }); if (combined.aborted) aborted();
      underlying.then(value => finish(resolve, value), error=>{if(finished)lateFailures.push(error);rejectKnown(error);});
    });
  };
  const drain = async timeout => {
    const end = Date.now() + timeout;
    while (pending.size && Date.now() < end) await pause(10);
    return pending.size === 0;
  };
  return { run, cancel, drain, signal: controller.signal, pending: () => pending.size, lateFailures:()=>[...lateFailures], cancellation: () => cancellation, pendingKinds: () => [...new Set([...pending].map(entry => entry.label))] };
}

function stderrCategory(bytes, signal) {
  const text = bytes.toString('utf8');
  if (/no usable sandbox|suid sandbox|sandbox.*(?:unavailable|not supported)|(?:namespace|namespaces).*(?:failed|not permitted)|zygote_host_impl_linux/i.test(text)) return 'sandbox unavailable';
  if (/error while loading shared libraries|cannot open shared object file/i.test(text)) return 'missing library';
  if (/received signal|segmentation fault|\bFATAL\b/i.test(text) || signal) return 'crash';
  return 'unknown';
}
function trackProcess(child) {
  const state = { child, spawned: false, spawnFailed: false, exitObserved: false, closeObserved: false, exitCode: null, signalCode: null, spawnCode: null, stderr: Buffer.alloc(0) };
  child.once('spawn', () => { state.spawned = true; });
  child.once('error', error => { state.spawnFailed = true; state.spawnCode = ['ENOENT', 'EACCES', 'ENOEXEC', 'EAGAIN', 'ENOMEM'].includes(error.code) ? error.code : 'OTHER'; });
  child.once('exit', (code, signal) => { state.exitObserved = true; state.exitCode = code; state.signalCode = signal; });
  child.once('close', (code, signal) => { state.closeObserved = true; state.exitCode = code; state.signalCode = signal; });
  child.stderr?.on('data', chunk => { const remaining = 65536 - state.stderr.length; if (remaining > 0) state.stderr = Buffer.concat([state.stderr, Buffer.from(chunk).subarray(0, remaining)]); });
  return state;
}
function processState(state) {
  if (!state) return { lifecycle: 'not-created', exited: false, fullyClosed: true, natural: false, spawned: false, exitCode: null, signalCode: null, stderrClass: 'unknown' };
  const code = state.child.exitCode ?? state.exitCode;
  const rawSignal = state.child.signalCode ?? state.signalCode;
  const signal = typeof rawSignal === 'string' && /^SIG[A-Z0-9]{1,12}$/.test(rawSignal) ? rawSignal : null;
  const exited = state.exitObserved || code !== null || signal !== null;
  const fullyClosed = state.closeObserved && (exited || state.spawnFailed);
  return { lifecycle: state.spawnFailed ? 'spawn-failed' : signal ? 'signal-exit' : exited ? 'code-exit' : state.spawned ? 'alive' : 'spawn-pending',
    spawned: state.spawned, exited, fullyClosed, natural: state.spawned && state.closeObserved && code === 0 && signal === null && !state.spawnFailed,
    exitCode: Number.isInteger(code) ? code : null, signalCode: signal, spawnCode: state.spawnCode, stderrClass: stderrCategory(state.stderr, signal) };
}
// ps is read-only; never print its raw command/profile output. Each invocation
// has an OS timeout as well as a tracked, cancellable operation budget.
async function processTable(signal, pgid) {
  const ps = args => new Promise((resolve, reject) => execFile('/bin/ps', args, { signal, timeout: 750, maxBuffer: 2 * 1024 * 1024, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' } }, (error, output) => error ? reject(error) : resolve(output)));
  const text = await ps(['-ww', '-axo', 'pid=,ppid=,pgid=,uid=,state=,lstart=,args=']);
  const rows = text.trim().split('\n').map(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/);
    safeAssert(match, 'process inventory format unknown');
    return { pid: +match[1], ppid: +match[2], pgid: +match[3], uid: +match[4], state: /^[IRSTUZ]/.test(match[5]) ? match[5][0] : 'unknown', start: match[6].replace(/\s+/g, ' '), command: match[7] };
  });
  const members = rows.filter(row => row.pgid === pgid);
  safeAssert(members.length <= 64, 'unexpected owned group size');
  if (members.length) {
    const commands = await ps(['-ww', '-p', members.map(row => row.pid).join(','), '-o', 'pid=,comm=']);
    for (const line of commands.trim().split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.+)$/); safeAssert(match, 'process executable format unknown');
      const row = members.find(item => item.pid === +match[1]); if (row) row.executable = match[2];
    }
  }
  return rows;
}
function validateOwnedGroup(owner, rows, executable, profile, uid, parentPID, diagnostics = () => {}) {
  safeAssert(Number.isInteger(owner.pid) && owner.pid > 1 && owner.pid !== parentPID && owner.pgid === owner.pid && owner.start, 'owned process identity unavailable');
  for (const [pid, start] of owner.members ?? []) {
    const current = rows.find(row => row.pid === pid);
    safeAssert(!current || (current.start === start && current.pgid === owner.pgid), 'recorded owned member identity or group changed');
  }
  safeAssert(rows.find(row => row.pid === parentPID)?.pgid !== owner.pgid, 'owned group overlaps parent test group');
  const members = rows.filter(row => row.pgid === owner.pgid);
  safeAssert(members.length <= 64, 'unexpected owned group size');
  const leader = rows.find(row => row.pid === owner.pid);
  const profileArg = `--user-data-dir=${profile}`;
  if (leader) safeAssert(leader.pgid === owner.pgid && leader.start === owner.start && leader.uid === uid && leader.executable === executable && leader.command.startsWith(executable + ' ') && leader.command.split(' ').filter(part => part.startsWith('--user-data-dir=')).length === 1 && leader.command.includes(profileArg + ' '), 'owned leader identity changed');
  const app = executable.slice(0, executable.indexOf('/Contents/MacOS/'));
  safeAssert(app.endsWith('.app'), 'owned app path unknown');
  const approved = new Map(owner.members ?? []);
  if (leader) approved.set(leader.pid, leader.start);
  const reports = new Map();
  let remaining = members.filter(row => row.pid !== owner.pid);
  while (remaining.length) {
    const next = remaining.filter(row => {
      const recorded = approved.get(row.pid);
      const checks = {
        sequence: members.indexOf(row) + 1,
        sameUID: row.uid === uid, isParent: row.pid === parentPID,
        commPresent: typeof row.executable === 'string',
        commandStartsComm: typeof row.executable === 'string' && row.command.startsWith(row.executable + ' '),
        frameworkPath: typeof row.executable === 'string' && row.executable.startsWith(app + '/Contents/Frameworks/'),
        helperRoleMatch: /\.app\/Contents\/MacOS\/Google Chrome for Testing Helper(?: \([A-Za-z ]+\))? --/.test(row.command),
        allowedCrashpad: /\/chrome_crashpad_handler --/.test(row.command),
        recordedIdentity: recorded ? recorded === row.start ? 'match' : 'mismatch' : 'absent',
        ancestorKnown: approved.has(row.ppid),
        state: ['I', 'R', 'S', 'T', 'U', 'Z'].includes(row.state) ? row.state : 'unknown',
        commandForm: row.command === '<defunct>' ? 'defunct' : row.command === '<exiting>' ? 'exiting' : /^\[.*\]$/.test(row.command) ? 'bracketed' : 'normal',
        firstRejectedCondition: 'none'
      };
      checks.firstRejectedCondition = checks.isParent ? 'isParent' : !checks.sameUID ? 'sameUID' : !checks.commPresent ? 'commPresent' : !checks.commandStartsComm ? 'commandStartsComm' : !checks.frameworkPath ? 'frameworkPath' : !(checks.helperRoleMatch || checks.allowedCrashpad) ? 'helperRoleMatch-or-allowedCrashpad' : 'none';
      reports.set(row.pid, checks); diagnostics([...reports.values()]);
      safeAssert(checks.firstRejectedCondition === 'none', 'unowned process in isolated browser group');
      if (recorded) {
        if (recorded !== row.start) { checks.firstRejectedCondition = 'recordedIdentity'; diagnostics([...reports.values()]); }
        safeAssert(recorded === row.start, 'owned helper startup identity changed');
      }
      if (recorded === row.start || approved.has(row.ppid)) { approved.set(row.pid, row.start); return false; }
      return true;
    });
    if (next.length === remaining.length) {
      for (const row of next) reports.get(row.pid).firstRejectedCondition = 'ancestorKnown';
      diagnostics([...reports.values()]);
    }
    safeAssert(next.length < remaining.length, 'browser helper ancestry unknown'); remaining = next;
  }
  owner.members = approved;
  return members;
}
function browserStopped(state, groupStopped) { return processState(state).fullyClosed && groupStopped === true; }
async function failureOnlyStop({ naturalClose, settled, verify, signal, forced, waitStopped, failed, diagnose = async (_stage, action) => action() }) {
  try { await diagnose('natural-close', naturalClose); if (await diagnose('owned-inventory', settled)) return; } catch {}
  // Natural close failed or exceeded its budget. This latch is irreversible,
  // including when a later signalled process happens to report exitCode=0.
  forced(); safeAssert(failed(), 'forced cleanup must remain a failed test');
  for (const name of ['SIGTERM', 'SIGKILL']) {
    const prefix = name === 'SIGTERM' ? 'TERM' : 'KILL';
    if (await diagnose(prefix + '-precheck', settled)) return;
    const members = await diagnose(prefix + '-precheck', verify);
    if (members.length) await diagnose(prefix + '-send', () => signal(name));
    if (await diagnose(prefix + '-wait', () => waitStopped(name))) return;
  }
  await diagnose('KILL-wait', async () => safeAssert(await settled(), 'owned browser group did not stop after failure cleanup'));
}

export { validateOwnedGroup, failureOnlyStop, processState, browserStopped, operationScope };

// These small lifecycle operations are extracted from the same e545 owner;
// exported solely so synthetic contracts exercise the actual implementation.
export async function registerAttachment(owner, connect, scope, cleanup, disconnect, operationSignal) {
  const browser = await connect();
  owner.drivers.add(browser); owner.driver = browser;
  if (operationSignal?.aborted || (!cleanup && scope.signal.aborted)) { await disconnect(browser); throw new HarnessFailure('late driver after abort'); }
  return browser;
}
export async function naturalCloseEvidence({ sendClose, disconnect, waitClosed, inspect, inventory }) {
  let sendFailure, transportFailure;
  try { await sendClose(); } catch(error) { sendFailure=error; }
  finally { try { await disconnect(); } catch(error) { transportFailure=error; } }
  // Browser.close may reject because Chrome closed its socket normally. Only
  // actual raw exit+close and group retirement can resolve that ambiguity.
  await waitClosed();
  const state=inspect();
  safeAssert(state.natural && (await inventory()).length===0,'natural browser close unproven');
  if(transportFailure)throw transportFailure;
  return {sendDisconnected:!!sendFailure};
}
export function retainOwner(registry, owner) { registry.add(owner); return owner; }
export async function ownedBrowser({ root, profile, home, executable, extension, extensionId, signal, register }) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason); signal.addEventListener('abort', abort, { once: true });
  const owner = { drivers: new Set(), members: new Map(), state: null, spawned: false };
  let closed=false, groupStopped=false, forced=false, cleanupDeadline=Infinity;
  const scope = operationScope(controller);
  const remaining = () => Math.max(0,cleanupDeadline-Date.now());
  const run = (label,action,cleanup=false) => {
    const timeout=Math.min(cleanup?12000:10000,cleanup?remaining():Infinity);
    safeAssert(timeout>0,'cleanup deadline exceeded');
    return scope.run(label,action,{timeout,cleanup});
  };
  const setDeadline = options => { cleanupDeadline=Math.min(cleanupDeadline,options?.deadline??Date.now()+10000); };
  const wait = async (read,test,cleanup=false) => {
    const end=Math.min(Date.now()+10000,cleanup?cleanupDeadline:Infinity);
    do { const value=await run('owned-wait',async()=>{if(owner.state?.spawnFailed)throw new HarnessFailure('browser spawn failed');return read();},cleanup); if(test(value))return value; await pause(Math.min(50,Math.max(1,end-Date.now()))); } while(Date.now()<end);
    throw new HarnessFailure('owned wait timed out');
  };
  async function inventory() {
    return run('owned-inventory',async signal=>{
      safeAssert(owner.state&&owner.pid,'owned process identity unavailable');
      safeAssert(await rawRealpath(executable)===executable&&await rawRealpath(root)===root&&await rawRealpath(profile)===profile,'canonical owner paths changed');
      const members=validateOwnedGroup(owner,await processTable(signal,owner.pgid),executable,profile,process.getuid(),process.pid);
      groupStopped=members.length===0;return members;
    },true);
  }

  const driverClosers=new WeakMap();
  const disconnectDriver=browser=>{let close=driverClosers.get(browser);if(!close){close=singleFlight(()=>scope.run('driver-disconnect',()=>browser.close(),{cleanup:true,timeout:Math.max(1,Math.min(2000,remaining()))}));driverClosers.set(browser,close);}return close();};
  async function disconnectAll() {
    const results=await Promise.allSettled([...owner.drivers].map(disconnectDriver));
    const errors=results.filter(row=>row.status==='rejected').map(row=>row.reason);
    if(errors.length)throw new AggregateError(errors,'Owned driver disconnect failed');
  }
  async function attach(cleanup=false) {
    const port=await wait(async()=>{
      safeAssert(!processState(owner.state).exited,'owned browser exited');const file=join(profile,'DevToolsActivePort');
      try {safeAssert(await rawRealpath(file)===file && (await rawStat(file)).isFile(),'unowned port file');
        const lines=(await rawReadFile(file,'utf8')).trim().split('\n'),port=Number(lines[0]);
        safeAssert(port>=1024&&port<=65535&&/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(lines[1]),'invalid owned port');
        owner.endpoint=`ws://127.0.0.1:${port}${lines[1]}`;return port;
      }catch(error){if(error instanceof HarnessFailure)throw error;return 0;}
    },Boolean,cleanup);
    // Registration is INSIDE the original tracked underlying promise, including
    // late success after scope.run has already rejected on abort/deadline.
    const browser=await run('cdp-attach',operationSignal=>registerAttachment(owner,()=>chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:8000}),scope,cleanup,disconnectDriver,operationSignal),cleanup);
    const control=await run('control-session',()=>browser.newBrowserCDPSession(),cleanup);
    const command=await run('actual-command-line',()=>control.send('Browser.getBrowserCommandLine'),cleanup);
    safeAssert(command.arguments.filter(arg=>arg.startsWith('--user-data-dir=')).length===1&&command.arguments.includes(`--user-data-dir=${profile}`),'CDP profile changed');
    safeAssert(command.arguments.includes('--use-mock-keychain')&&!command.arguments.some(arg=>forbidden.test(arg)),'unsafe actual browser arguments');
    await inventory();owner.control=control;owner.ownershipVerified=true;return browser;
  }
  const closeOnce=singleFlight(async()=>{
    if(!owner.state){closed=true;groupStopped=true;return;}
    const naturalClose=()=>naturalCloseEvidence({
      sendClose:async()=>{if(!processState(owner.state).exited){if(!owner.driver?.isConnected())await attach(true);await run('Browser.close',()=>owner.control.send('Browser.close'),true);}},
      disconnect:disconnectAll,
      waitClosed:()=>wait(()=>Promise.resolve(processState(owner.state)),state=>state.fullyClosed,true),
      inspect:()=>processState(owner.state),inventory
    });
    let naturalFailure;
    await failureOnlyStop({naturalClose:async()=>{try{return await naturalClose();}catch(error){naturalFailure=error;throw error;}},settled:async()=>browserStopped(owner.state,(await inventory()).length===0),verify:inventory,
      forced:()=>{forced=true;},failed:()=>forced,
      signal:name=>{safeAssert(remaining()>0&&owner.pgid===owner.child.pid&&owner.pgid!==process.pid,'wrong owned signal group');process.kill(-owner.pgid,name);},
      waitStopped:()=>wait(async()=>browserStopped(owner.state,(await inventory()).length===0),Boolean,true)});
    safeAssert(await scope.drain(Math.min(3000,remaining())),'pending browser operations retained');
    if(naturalFailure)throw naturalFailure;
    if(scope.lateFailures().length)throw new AggregateError(scope.lateFailures(),'Late owned operation failed');
    safeAssert(!forced&&processState(owner.state).natural,'forced or nonnatural cleanup cannot pass');
    closed=true;return {forced,exitCode:owner.child.exitCode,signal:owner.child.signalCode,closeObserved:owner.state.closeObserved,ownedMembersRemaining:0};
  });
  const settleOnce=singleFlight(async()=>{scope.cancel('journey-abort');await disconnectAll();safeAssert(await scope.drain(Math.min(3000,remaining())),'PW operations failed to settle');if(scope.lateFailures().length)throw new AggregateError(scope.lateFailures(),'Late owned operation failed');});
  const handle={get browser(){return owner.driver;},get endpoint(){return owner.endpoint;},get state(){return processState(owner.state);},get pendingOperations(){return scope.pending();},
    get stopped(){return (!owner.state||browserStopped(owner.state,groupStopped))&&scope.pending()===0;},
    run,profile,naturalClose(options){setDeadline(options);return closeOnce();},failureClose(options){setDeadline(options);return closeOnce();},
    async disconnect(){safeAssert(await scope.drain(3000),'PW work not settled');await run('PW-disconnect',()=>disconnectDriver(owner.driver));safeAssert(!owner.driver.isConnected()&&!processState(owner.state).exited,'disconnect must leave raw browser alive');owner.driver=undefined;owner.control=undefined;await inventory();},
    settle(options){setDeadline(options);return settleOnce();},disposeSignal(){signal.removeEventListener('abort',abort);},get closed(){return closed;}};
  // The outer owner registry learns this instance before mkdir, spawn or attach.
  // Failed startup never makes an unassigned a/b look like an absent browser.
  register(handle);
  try {
    safeAssert(process.platform==='darwin'&&process.arch==='arm64'&&process.getuid()!==0,'locked mac arm64 browser helper only');
    for(const path of [profile,home])await mkdir(path,{recursive:true});
    root=await rawRealpath(root);profile=await rawRealpath(profile);executable=await rawRealpath(executable);
    await rm(join(profile,'DevToolsActivePort'),{force:true});
    const args=[`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',
      ...(extension?[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]:[]),
      '--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--metrics-recording-only','--password-store=basic','--use-mock-keychain',
      extension?`chrome-extension://${extensionId}/options.html`:'about:blank'];
    safeAssert(!args.some(arg=>forbidden.test(arg)),'forbidden requested arguments');
    owner.child=spawn(executable,args,{detached:true,stdio:['ignore','ignore','pipe'],env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,XDG_CONFIG_HOME:join(home,'.config'),XDG_CACHE_HOME:join(home,'.cache'),TMPDIR:root,LANG:'C.UTF-8',TZ:'UTC'}});
    owner.state=trackProcess(owner.child);
    await wait(()=>Promise.resolve(owner.state.spawned),Boolean);
    const identity=(await run('launch-inventory',signal=>processTable(signal,owner.child.pid))).find(row=>row.pid===owner.child.pid);
    safeAssert(identity&&identity.pgid===owner.child.pid&&identity.ppid===process.pid,'dedicated browser identity unknown');
    Object.assign(owner,{pid:owner.child.pid,pgid:identity.pgid,start:identity.start});await inventory();await attach();return handle;
  }catch(error){
    // Ownership remains in the outer registry even when this cleanup fails.
    try{await handle.failureClose({deadline:Date.now()+10000});}catch(cleanup){throw new AggregateError([error,cleanup],'Browser startup and owned cleanup failed');}throw error;
  }
}

// e545 operation registry also owns cleanup tasks. Deadline rejection is never
// settlement: the underlying remains registered, blocking profile removal.
export async function settleOperations(scope,actions,deadline){
  const results=await Promise.allSettled(actions.map(([label,action])=>scope.run(label,action,{cleanup:true,timeout:Math.max(1,deadline-Date.now())})));
  const errors=results.filter(row=>row.status==='rejected').map(row=>row.reason);
  if(!await scope.drain(Math.max(0,deadline-Date.now())))errors.push(new HarnessFailure('cleanup underlying tasks remain'));
  errors.push(...scope.lateFailures());
  if(errors.length)throw new AggregateError(errors,'Owned cleanup failed or remains unsettled');
}
