import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { scenario, hash } from './scenarios.mjs';

const options = JSON.parse(process.argv[2]);
const EVENT_LOOP_RESOLUTION_MS = 10, EVENT_LOOP_PROBE_WAIT_MS = 20, EVENT_LOOP_ACTIVATION_MS = 1;
let current, firstResult, firstVisible, started, cancellation;
const phase = async (name, fn) => {
  const start = performance.now();
  try { const value = await fn(); firstResult ??= performance.now() - started; if (name === 'visible.first') firstVisible ??= performance.now() - started; return value; }
  finally { if (current) (current[name] ??= []).push(performance.now() - start); }
};
function acknowledgeIdleSnapshot() {
  if (!process.send || !process.connected) throw Error('Idle snapshot requires the parent IPC channel');
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer); process.off('message', onMessage); process.off('disconnect', onDisconnect);
      if (error) reject(error); else resolve();
    };
    const onMessage = message => { if (message.type === 'idle-ack') finish(); };
    const onDisconnect = () => finish(Error('Parent disconnected before idle snapshot acknowledgement'));
    const timer = setTimeout(() => finish(Error('Parent did not acknowledge idle snapshot within 10 seconds')), 10000);
    process.on('message', onMessage); process.once('disconnect', onDisconnect);
    process.send({ type: 'idle-end' }, error => { if (error) finish(error); });
  });
}
let fixture, eventLoop;
try {
  await mkdir(options.directory, { recursive: true });
  const setupStart = performance.now();
  fixture = await scenario({ ...options, phase });
  const setupMs = performance.now() - setupStart;
  const samples = [];
  eventLoop = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS }); eventLoop.enable();
  for (let index = 0; index <= options.repeats; index++) {
    // Arm the native monitor before synchronous work. Reset its histogram only
    // after this unmeasured wait; resetting does not restart its pending timer.
    const probeStart = performance.now(); await delay(EVENT_LOOP_PROBE_WAIT_MS);
    eventLoop.reset();
    // A promise continuation in the reset timer's own phase can run before the
    // native monitor's due callback. Enter a later timer turn before blocking.
    await delay(EVENT_LOOP_ACTIVATION_MS);
    const beforeProbeWaitMs = performance.now() - probeStart;
    current = {}; firstResult = undefined; firstVisible = undefined; started = performance.now();
    const cpu = process.cpuUsage();
    const result = await fixture.run(new AbortController().signal);
    const totalMs = performance.now() - started, used = process.cpuUsage(cpu);
    const firstEffectiveResultMs = firstVisible ?? fixture.diagnostics?.()?.nativeFirstResultMs ?? totalMs, firstStageResultMs = firstResult ?? totalMs;
    const stages = current; current = null;
    // Freeze tool wall/CPU results before yielding so a blocked monitor tick can
    // run. Probe waits and later result hashing are outside measured tool time.
    const afterStart = performance.now(); await delay(EVENT_LOOP_PROBE_WAIT_MS);
    const afterProbeWaitMs = performance.now() - afterStart;
    samples.push({ mode: index ? 'warm' : 'first-after-setup', totalMs, firstEffectiveResultMs, firstStageResultMs,
      processCpuMs: (used.user + used.system) / 1000, treeCpuMs: ['ptc-workflow', 'native-system', 'browser-image', 'terminal', 'host-workflow'].includes(options.name) ? null : (used.user + used.system) / 1000,
      stagesMs: Object.fromEntries(Object.entries(stages).map(([key, values]) => [key, { calls: values.length, total: values.reduce((a, b) => a + b, 0) }])),
      eventLoopMaxDelayMs: eventLoop.count ? eventLoop.max / 1e6 : null,
      eventLoopProbe: { resolutionMs: EVENT_LOOP_RESOLUTION_MS, requestedWaitEachMs: EVENT_LOOP_PROBE_WAIT_MS, activationYieldMs: EVENT_LOOP_ACTIVATION_MS, beforeWaitMs: beforeProbeWaitMs, afterWaitMs: afterProbeWaitMs, samples: eventLoop.count },
      diagnostics: fixture.diagnostics?.() ?? null,
      resultHash: hash(result), resultBytes: Buffer.byteLength(JSON.stringify(result)) });
  }
  eventLoop.disable();
  current = null;
  if (fixture.cancel) {
    const pre = new AbortController(); pre.abort();
    let preAbortedRejected = false;
    try { await fixture.cancel(pre.signal); } catch { preAbortedRejected = true; }
    const controller = new AbortController(), begin = performance.now(); let firedAt = null, outcome = 'completed-before-abort';
    const timer = setTimeout(() => { firedAt = performance.now(); controller.abort(); }, 2);
    try { await fixture.cancel(controller.signal); } catch (error) { outcome = controller.signal.aborted ? 'aborted' : 'failed'; if (outcome === 'failed') throw error; }
    finally { clearTimeout(timer); }
    cancellation = { preAbortedRejected, outcome, requestedDelayMs: 2, abortTimerFiredMs: firedAt === null ? null : firedAt - begin,
      settleAfterAbortMs: firedAt === null ? null : performance.now() - firedAt,
      limitation: 'The timer can be delayed by synchronous work; completed-before-abort is not cancellation success.' };
    if (!preAbortedRejected) throw Error('Pre-aborted operation unexpectedly succeeded');
  } else cancellation = { preAbortedRejected: null, outcome: 'not-measured', reason: 'Cancellation measured on AST/search implementations, not the compound workflow.' };
  process.send?.({ type: 'idle-start' });
  await delay(options.idleMs);
  const idle = { rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed, activeResourceTypes: process.getActiveResourcesInfo() };
  // The parent freezes the live process tree while all fixture resources remain
  // open. Cleanup may start only after that exact snapshot is acknowledged.
  await acknowledgeIdleSnapshot();
  const { fingerprint, stats } = fixture;
  let computeCleanupMs = null;
  try {
    const module = await import(pathToFileURL(join(options.root, 'src/compute.mjs')).href);
    const begin = performance.now(); await module.closeToolComputations(); computeCleanupMs = performance.now() - begin;
  } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  const cleanupStart = performance.now(); await fixture.close(); fixture = null;
  process.send?.({ type: 'result', result: { name: options.name, fingerprint, stats, setupMs, computeCleanupMs, samples, cancellation, idle,
    processPeakRssBytes: process.resourceUsage().maxRSS * 1024, cleanupMs: performance.now() - cleanupStart } });
} catch (error) {
  try { await fixture?.close(); } catch {}
  process.send?.({ type: 'error', error: error.stack ?? String(error) }); process.exitCode = 1;
} finally { eventLoop?.disable(); process.disconnect?.(); }
