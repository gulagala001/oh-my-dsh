import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SimulationHost, repoRoot } from './host.mjs';
import { createSimulationProvider } from './provider.mjs';
import { Checks, assertSystemHead, assertFaultLedger, negativeControls } from './assertions.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { recordReplay, createReplayModel, validateReplay } from './replay.mjs';
import { replayWithScene } from './replay-scene.mjs';

export const LIMITATIONS = [
  '本地模型替身不证明真实模型理解、摘要质量或供应商服务行为。',
  'seed控制场景选择和指定交错，不控制全部原生I/O及操作系统调度。',
  '虚拟时间验证期限行为，不能作为真实性能测量。',
  '当前真实验收仅覆盖报告所列宿主、机器、执行路径和场景；不等于无限状态空间已穷尽。',
  'Web 浏览器验证不替代真实桌面壳、PTY、多设备或外部服务验收。',
];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const describeError = (error, depth = 0) => ({ code: error?.code, assertion: error?.assertion, message: error?.message ?? String(error), stack: error?.stack,
  ...(depth < 3 && error?.errors ? { errors: [...error.errors].map(child => describeError(child, depth + 1)) } : {}),
  ...(depth < 3 && error?.cause ? { cause: describeError(error.cause, depth + 1) } : {}) });

export async function writeReport(report, directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
  const checks = report.checks ?? [], results = report.results ?? [];
  const rows = results.length ? results.map(result => `<tr><td>${result.reportPath ? `<a href="${escapeHtml(result.reportPath)}">${escapeHtml(result.scenario ?? result.caseId ?? result.kind)}</a>` : escapeHtml(result.scenario ?? result.caseId ?? result.kind)}</td><td>${escapeHtml(result.status)}</td><td>${Math.round(result.elapsedMs ?? 0)} ms</td><td>${escapeHtml(result.error?.message)}</td></tr>`).join('')
    : checks.map(check => `<tr><td>${escapeHtml(check.name)}</td><td>${escapeHtml(check.status)}</td><td>${Math.round(check.elapsedMs)} ms</td><td>${escapeHtml(check.message)}</td></tr>`).join('');
  const links = [['report.json', 'JSON 报告'], ...(report.kind === 'native-scenario' ? [['timeline.jsonl', '执行时间线'], ['input.json', '重放输入'], ['host-events.json', '原生审计']] : []), ...(report.transcript?.status === 'complete' ? [['transcript.json', '严格实录']] : []), ...(report.screenshots ?? []).map(file => [file, file])].map(([file, title]) => `<a href="${escapeHtml(file)}">${escapeHtml(title)}</a>`).join(' · ');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>离线会话验收报告</title><style>body{font:15px system-ui;margin:40px auto;padding:0 24px;max-width:1100px;color:#172b4d;background:#f7f9fc}h1{font-size:26px}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;padding:12px;border-bottom:1px solid #dce3ee}code,pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#1764c0}.pass{color:#147343}.fail{color:#b32c2c}details{margin:18px 0}</style><h1>离线会话验收报告</h1><p class="${report.status === 'pass' ? 'pass' : 'fail'}">${escapeHtml(report.status)} · ${escapeHtml(report.scenario ?? report.kind)} · 实际 ${Math.round(report.elapsedMs ?? 0)} ms</p><p>宿主 ${escapeHtml(report.versions?.dsh ?? '见子报告')} · OMD ${escapeHtml(report.versions?.omd ?? '')} · Node ${escapeHtml(report.versions?.node ?? process.version)} · ${escapeHtml(report.platform ?? process.platform)}</p>${report.virtualTime ? `<p>后端虚拟时间推进 ${escapeHtml(report.virtualTime.advancedMs)} ms；浏览器和 OS 仍使用真实时间。</p>` : ''}<table><thead><tr><th>检查／场景</th><th>结果</th><th>真实耗时</th><th>错误</th></tr></thead><tbody>${rows}</tbody></table>${report.error ? `<pre>${escapeHtml(report.error.stack ?? report.error.message)}</pre>` : ''}<details><summary>完整结果</summary><pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre></details><p>${links}</p><p>${LIMITATIONS.map(escapeHtml).join('<br>')}</p></html>`;
  await writeFile(join(directory, 'report.html'), html);
}

export async function runScenario(scenario, { directory, parameters, clock = 'virtual', isolation = 'native', ui = false, dshCli, timeoutMs = 90000, signal, onProgress = () => {}, transcript, recording } = {}) {
  const definition = typeof scenario === 'string' ? SCENARIOS.find(item => item.id === scenario) : scenario;
  if (!definition) throw Error('Unknown simulation scenario: ' + scenario);
  if (!directory) throw Error('A report directory is required');
  directory = resolve(directory); await mkdir(directory, { recursive: true });
  const root = await mkdtemp(join(tmpdir(), 'omd-simulation-'));
  const timeline = [], start = performance.now(), startedAt = new Date().toISOString();
  const trace = entry => {
    timeline.push({ actualElapsedMs: performance.now() - start, ...entry }); if (entry.type === 'assertion') onProgress(entry.name + ' ' + entry.status);
    if (entry.type === 'request/error') controller.abort(Object.assign(Error(entry.message ?? 'Strict provider rejected a request'), { code: 'SIM_PROTOCOL' }));
  };
  const checks = new Checks(trace), controller = new AbortController();
  const parentAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) parentAbort(); else signal?.addEventListener('abort', parentAbort, { once: true });
  let provider, host, spec, result, failure, browser, startup, timedOut = false;
  let originalModel, replayModel, replayTemplate;
  const timer = setTimeout(() => { timedOut = true; controller.abort(Object.assign(Error('Simulation real watchdog expired'), { code: 'SIMULATION_DEADLINE' })); }, timeoutMs);
  const aborted = new Promise((_, reject) => { controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }); if (controller.signal.aborted) reject(controller.signal.reason); });
  aborted.catch(() => {});
  try {
    spec = definition.create({ trace, parameters });
    if (transcript) {
      replayTemplate = validateReplay(transcript); originalModel = spec.model;
    }
    if (spec.requiresVirtual && clock !== 'virtual') throw Error('This deadline scenario requires virtual time; real-time validation uses separate native scenarios.');
    provider = await createSimulationProvider({ async respond(payload, context) {
      trace({ type: 'model/request', requestId: context.requestId, payload });
      if (!replayTemplate) return spec.model.respond(payload, context);
      if (!replayModel) throw Error('Recorded model request arrived before the replay environment was bound');
      const recorded = await replayModel.respond(payload, context);
      // Keep the original scene's independent expectations and causal gates.
      // Only the response frames come from the transcript.
      const scripted = await originalModel.respond(payload, context);
      return replayWithScene(recorded, scripted);
    }, trace });
    host = new SimulationHost({ root, provider, omd: spec.omd, clock, isolation, dshCli, signal: controller.signal, trace });
    onProgress('启动 ' + definition.id);
    startup = host.prepare().then(() => { controller.signal.throwIfAborted(); return host.start({ now: recording?.epoch }); });
    await Promise.race([startup, aborted]);
    if (replayTemplate) {
      let replay = replayTemplate;
      if (recording) {
        if (typeof recording.root !== 'string' || !/\/omd-simulation-[^/]+$/.test(recording.root)
          || recording.workspace !== join(recording.root, 'workspace') || recording.home !== join(recording.root, 'home')) throw Error('Replay has invalid disposable-directory bindings');
        if (recording.origin && !/^http:\/\/127\.0\.0\.1:\d+$/.test(recording.origin)) throw Error('Replay has an invalid local GUI origin');
        const substitutions = [[recording.workspace, host.workspace], [recording.home, host.home], [recording.root, host.root], ...(recording.origin ? [[recording.origin, host.origin]] : [])].sort((a, b) => b[0].length - a[0].length);
        const replace = value => typeof value === 'string' ? substitutions.reduce((text, [old, current]) => text.replaceAll(old, current), value)
          : Array.isArray(value) ? value.map(replace) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)])) : value;
        replay = replace(replay); trace({ type: 'replay/literal-bindings', substitutions });
      }
      replayModel = createReplayModel(replay, { trace }); spec.model = replayModel;
    }
    result = await Promise.race([spec.run({ host, checks, provider, trace }), aborted]);
    if (ui && result.sessionId) {
      const { checkBrowser } = await import('./ui.mjs');
      browser = await Promise.race([checkBrowser({ host, sessionId: result.sessionId, checks, directory, trace, signal: controller.signal }), aborted]);
    }
    await checks.check('严格场景已消费且协议无隐藏错误', () => { spec.model.assertComplete(); originalModel?.assertComplete(); provider.assertHealthy(); });
    await checks.check('模型请求保留首个系统消息', () => assertSystemHead(provider.requests));
    const audit = await host.audit();
    await checks.check('所有文件故障已实际消费', () => assertFaultLedger(audit.faults));
    await checks.check('所有模型路线与网络出口受控', () => {
      if (audit.network.length || audit.modelDenials?.length || audit.host.some(event => event.type === 'model/denied')) throw Error('Unexpected external network or model route attempt');
    });
    trace({ type: 'coverage/audit', modelRoutes: audit.host.filter(event => event.type === 'model/route'), networkDenials: audit.network });
    controller.signal.throwIfAborted();
  } catch (error) { failure = error; }
  finally {
    clearTimeout(timer); signal?.removeEventListener('abort', parentAbort);
    for (const gate of spec?.gates ?? []) gate.abort(Error('Simulation finished'));
    const cleanup = [];
    // Finish or reject in-flight setup before closing its resources. An early
    // budget abort must not race a late prepare() into writing after close().
    for (const close of [() => startup?.catch(() => {}), () => browser?.close(), () => host?.close(), () => provider?.close()]) {
      let deadline;
      try { await Promise.race([close(), new Promise((_, reject) => { deadline = setTimeout(() => reject(Object.assign(Error('Resource cleanup real deadline expired'), { code: 'CLEANUP_DEADLINE' })), 6000); })]); }
      catch (error) { cleanup.push(error); } finally { clearTimeout(deadline); }
    }
    if (cleanup.length) failure = Object.assign(new AggregateError([...(failure ? [failure] : []), ...cleanup],
      [failure?.message, ...cleanup.map(error => error.message)].filter(Boolean).join('; ')), { code: failure?.code ?? cleanup[0]?.code });
    // Finalize only after cleanup: late stream/iterator errors or denied
    // connections during shutdown must not disappear behind an earlier PASS.
    try {
      provider?.assertHealthy();
      if (host) { const audit = await host.audit(); assertFaultLedger(audit.faults); if (audit.network.length || audit.modelDenials?.length || audit.host.some(event => event.type === 'model/denied')) throw Error('Shutdown audit contains an unexpected network/model route denial'); }
      if (controller.signal.aborted) throw controller.signal.reason;
    } catch (error) {
      if (failure && error !== failure) failure = Object.assign(new AggregateError([failure, error], failure.message + '; final audit: ' + error.message), { code: failure.code ?? error.code });
      else failure ??= error;
    }
  }
  const omd = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')).version;
  const report = { version: 1, kind: 'native-scenario', scenario: definition.id, title: definition.title, status: failure ? 'fail' : 'pass', startedAt,
    elapsedMs: performance.now() - start, timedOut, platform: process.platform, versions: { dsh: host?.version, omd, node: process.version },
    ...(clock === 'virtual' && host?.initialEpoch !== undefined ? { virtualTime: { initialEpoch: host.initialEpoch, lastObservedEpoch: host.clockSnapshot?.now,
      advancedMs: host.clockSnapshot?.now - host.initialEpoch, scope: 'explicit backend clock advancement; browser and OS time remain real' } } : {}),
    configuration: { clock, isolation, ui, ...(parameters ? { parameters } : {}) }, checks: checks.results, model: spec?.model.snapshot(),
    requests: provider?.requests.map(request => ({ id: request.id, state: request.state, chunks: request.chunks.length, error: request.error?.message })),
    result, screenshots: timeline.filter(event => event.type === 'ui/verified').flatMap(event => event.screenshots ?? []), limitations: LIMITATIONS,
    ...(['exploration_timeout', 'exploration_cancelled'].includes(failure?.code) && failure === controller.signal.reason ? { interruption: failure.code } : {}),
    ...(failure ? { error: describeError(failure), retainedWorkspace: root } : {}) };
  await writeFile(join(directory, 'timeline.jsonl'), timeline.map(event => JSON.stringify(event)).join('\n') + '\n');
  if (host) {
    await writeFile(join(directory, 'host.log'), host.log);
    const audit = await host.audit().catch(() => null); if (audit) await writeFile(join(directory, 'host-events.json'), JSON.stringify(audit, null, 2));
  }
  const currentRecording = { root: host?.root, home: host?.home, workspace: host?.workspace, origin: host?.origin, epoch: host?.initialEpoch };
  await writeFile(join(directory, 'input.json'), JSON.stringify({ version: 1, kind: 'omd-simulation-input', scenario: definition.id, parameters: parameters ?? {}, clock, isolation, ui,
    recording: currentRecording, ...(definition.generatedCase || result?.generatedCase ? { generatedCase: definition.generatedCase ?? result.generatedCase } : {}) }, null, 2));
  try {
    const lanes = (originalModel ?? spec?.model)?.snapshot().requests;
    const ledger = provider?.requests.map(request => ({ ...request, lane: lanes?.find(entry => entry.id === Number(request.id.replace('sim-', '')))?.laneId ?? request.payload?.model }));
    const replay = recordReplay(ledger); await writeFile(join(directory, 'transcript.json'), JSON.stringify(replay, null, 2));
    report.transcript = { status: 'complete', file: 'transcript.json', rebindings: currentRecording, scope: 'exact recorded request contract; native differences are explicit failures' };
  } catch (error) { report.transcript = { status: 'unavailable', reason: error.message }; }
  // Workspace disposal is part of the result, not an action after PASS was
  // persisted. Preserve an honest failure report when the final removal fails.
  if (!failure) {
    try { await rm(root, { recursive: true, force: true }); }
    catch (error) {
      failure = error; report.status = 'fail'; report.error = describeError(error);
      report.retainedWorkspace = root;
    }
  }
  report.elapsedMs = performance.now() - start;
  await writeReport(report, directory);
  onProgress(definition.id + ' ' + report.status + ' ' + Math.round(report.elapsedMs) + 'ms');
  return report;
}

export async function runControls(directory) {
  const start = performance.now(); const results = await negativeControls();
  const report = { kind: 'negative-controls', status: 'pass', elapsedMs: performance.now() - start,
    checks: results.map(result => ({ name: result.name, status: 'pass', expected: 'detected', elapsedMs: 0 })), limitations: LIMITATIONS };
  await writeReport(report, directory); return report;
}
