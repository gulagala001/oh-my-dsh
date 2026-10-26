import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { scenario, hash } from './scenarios.mjs';

const options = JSON.parse(process.argv[2]);
let current, firstResult, started, cancellation;
const phase = async (name, fn) => {
  const start = performance.now();
  try { const value = await fn(); firstResult ??= performance.now() - started; return value; }
  finally { if (current) (current[name] ??= []).push(performance.now() - start); }
};
let fixture;
try {
  await mkdir(options.directory, { recursive: true });
  const setupStart = performance.now();
  fixture = await scenario({ ...options, phase });
  const setupMs = performance.now() - setupStart;
  const samples = [], eventLoop = monitorEventLoopDelay({ resolution: 10 }); eventLoop.enable();
  for (let index = 0; index <= options.repeats; index++) {
    current = {}; firstResult = undefined; started = performance.now();
    eventLoop.reset(); const cpu = process.cpuUsage();
    const result = await fixture.run(new AbortController().signal);
    const totalMs = performance.now() - started, used = process.cpuUsage(cpu);
    samples.push({ mode: index ? 'warm' : 'first-after-setup', totalMs, firstStageResultMs: firstResult ?? totalMs,
      processCpuMs: (used.user + used.system) / 1000, treeCpuMs: ['ptc-workflow', 'native-system', 'browser-image'].includes(options.name) ? null : (used.user + used.system) / 1000,
      stagesMs: Object.fromEntries(Object.entries(current).map(([key, values]) => [key, { calls: values.length, total: values.reduce((a, b) => a + b, 0) }])),
      eventLoopMaxDelayMs: eventLoop.count ? eventLoop.max / 1e6 : null,
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
} finally { process.disconnect?.(); }
