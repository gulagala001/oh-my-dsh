import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, realpath, stat } from 'node:fs/promises';
import { join, sep, basename } from 'node:path';
import { withJourneyControl } from './control.mjs';
import { safeFailure } from './failure.mjs';
import { textParts, toolValue, proofOutput } from './scenario.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const reviewedTgzSha256 = '205762eddc9f9e78102dc44fbdd2164cd2b8b419da73ecd6e5c813685ca6d85c';
export function assertReviewedArchive(bytes, declared = reviewedTgzSha256) {
  assert.equal(declared, reviewedTgzSha256, 'Only the independently reviewed complete product archive is accepted');
  assert.equal(hash(bytes), reviewedTgzSha256, 'Actual bytes must match the fixed reviewed product archive');
}
export function assertLocalArchive(bytes, sha256) {
  assert.match(sha256, /^[a-f0-9]{64}$/, 'Explicit local candidate SHA256 required');
  assert.equal(hash(bytes), sha256, 'Actual local candidate bytes must match the reviewed input manifest');
}
export async function installWebCuPackage(f, { tgz, sha256, localCandidate }) {
  assert.equal(f.hostVersion, '0.2.1-rc.2');
  const verify = localCandidate ? bytes => assertLocalArchive(bytes, sha256) : bytes => assertReviewedArchive(bytes, sha256);
  if (localCandidate) assert.match(localCandidate.clientSha256, /^[a-f0-9]{64}$/);
  verify(await readFile(tgz));
  const installed = await f.cliRun(['plugin', '--profile', f.profile, 'add', 'file:' + tgz]);
  if (localCandidate) await writeFile(join(localCandidate.output, 'package-install.json'), JSON.stringify(installed, null, 2), {mode: 0o600});
  assert.equal(installed.ok, true, JSON.stringify(installed));
  verify(await readFile(tgz));
  const packageRoot = await realpath(join(f.home, 'profiles', f.profile, 'node_modules/trisoul_x'));
  assert(packageRoot.startsWith(await realpath(join(f.home, 'profiles', f.profile)) + sep), 'Installed tgz must not link to a checkout');
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.engines.dsh, '0.2.1-rc.2');
  const identity = { tgzSha256: sha256, version: manifest.version, files: {} };
  for (const file of ['lib/client.js', 'vendor/opencu/package.json', 'vendor/opencu/extension/manifest.json', 'vendor/opencu/lib/client.factory.mjs', 'vendor/opencu/lib/extension.zip',
    'vendor/opencu/native/bin/darwin-arm64/OpenCU Helper.app/Contents/MacOS/opencu-native']) {
    const path = join(packageRoot, file), bytes = await readFile(path);
    identity.files[file] = { sha256: hash(bytes), mode: (await stat(path)).mode & 0o777 };
  }
  assert.equal(identity.files['lib/client.js'].sha256, localCandidate?.clientSha256 ?? 'cd4864846bb58b10648facdacf390052ee119dd1b19ab685cdf33be90441410c');
  assert.equal(identity.files['vendor/opencu/native/bin/darwin-arm64/OpenCU Helper.app/Contents/MacOS/opencu-native'].mode, 0o755);
  // Last temporary profile layer only. No production switches or defaults change.
  const path = join(f.home, 'profiles', f.profile, 'cordis.patch.yml');
  const rows = JSON.parse(await readFile(path, 'utf8'));
  rows.push({ id: 'trisoul-x', config: { componentAutoSetup: false,
    backgroundTasksEnabled: false, dreamAutoEnabled: false, codegraphEnabled: false,
    unifiedBackground: { provider: 'ecosystem', model: 'ecosystem', effort: 'off' }, dreamProvider: 'ecosystem', dreamModel: 'ecosystem' } },
  { id: 'omd-opencu', config: { browserEnabled: false, managedHeadless: false, nativeEnabled: false, extensionEnabled: true, registerTools: true } },
  { id: 'sandbox-policy', config: { mode: 'read-only', workspaceRoot: f.workspace } },
  { id: 'approval', config: { policy: 'ask' } });
  await writeFile(path, JSON.stringify(rows));
  return { identity, packageRoot, extension: join(packageRoot, 'vendor/opencu/extension') };
}

export function assertSessionPhase(observation, scenario, phase, { canceled = false } = {}) {
  assert.equal(observation.nativeToolRuntime, true);
  assert.deepEqual(observation.modelDenials, []);
  const call = scenario.calls.get(phase); assert(call, 'Actual scripted call must have been issued');
  const calls = observation.events.filter(event => event.type === 'tool/call' && event.data.callId === call.callId);
  assert.equal(calls.length, 1); assert.equal(calls[0].data.name, 'computer_use');
  assert.deepEqual(JSON.parse(calls[0].data.arguments), call.args);
  const results = observation.events.filter(event => event.type === 'tool/result' && event.data.message.toolCallId === call.callId);
  assert.equal(results.length, 1);
  const end = observation.events.filter(event => event.type === 'turn/end' && event.data.turn === calls[0].data.turn);
  assert.equal(end.length, 1); assert.equal(end[0].data.reason.kind, canceled ? 'aborted' : 'completed');
  assert(observation.events.some(event => event.type === 'user/message' && textParts(event.data.content).some(text => text.trim() === scenario.marker(phase))), 'Real UI prompt must reach native session event');
  if (canceled) assert.equal(results[0].data.message.isError, true);
  else {
    assert.notEqual(results[0].data.message.isError, true);
    const value = toolValue(results[0].data.message.content);
    const proof = proofOutput(value, scenario.nonce, phase);
    assert.equal(proof.tabId, scenario.receipts.get(phase)?.tabId);
    assert(value.images?.length > 0);
    if (phase === 'exercise') {
      assert(proof.ax.initial.includes(scenario.nonce)); assert(proof.ax.full.includes(scenario.nonce + ':first'));
      assert(proof.ax.unchanged.includes('(no change; do not immediately repeat observation)'));
      assert(proof.ax.changed.startsWith('AX diff from ') && proof.ax.changed.includes(scenario.nonce + ':first'));
    }
  }
  return results[0].data.message;
}
export function assertTarget(snapshot, nonce, count, suffix) {
  assert.deepEqual(snapshot.errors, []); assert.equal(snapshot.nonce, nonce);
  assert.equal(snapshot.count, count); assert.equal(snapshot.value, nonce + ':' + suffix);
  assert.equal(snapshot.events.filter(event => event.type === 'click').length, count);
  assert(snapshot.events.every(event => event.trusted === true && event.nonce === nonce));
}
export function assertRelease({ ack, heldInputs, state, heldCommand }, heldSequence, identity) {
  assert.equal(ack.source, 'original-extension-result');
  assert.equal(ack.method, 'release'); assert.equal(ack.released, true);
  assert(Number.isSafeInteger(ack.sequence) && ack.sequence > heldSequence, 'Fresh ACK after held input required');
  assert.deepEqual(ack.failures ?? [], []); assert.deepEqual(ack.errors ?? [], []);
  assert.deepEqual(heldCommand.identity, identity); assert.equal(heldCommand.sequence, heldSequence);
  assert.equal(ack.sessionHash, heldCommand.sessionHash, 'ACK belongs to the original held command extension session');
  if (ack.scope === 'session-all') assert.equal(ack.identity, undefined);
  else assert.deepEqual(ack.identity, identity, 'Targeted ACK belongs to the exact target occurrence');
  assert.deepEqual(heldInputs, [], 'Read actual chrome.storage.session heldInputs');
  assert.equal(state.releasePending, false); assert.deepEqual(state.releaseErrors, []);
}

// Browser creation, Allow, transport handoff and shutdown are deliberately owned
// by the separately reviewed harness. This function neither launches browsers
// nor controls B. Missing lifecycle/release evidence is a hard failure.
export function createWebCuPageDiagnostics(page,origin) {
  const errors = [], consoleErrors = [], consoleDetails=[], iconChecks=[], missingHostIcons=new Set(); page.on('pageerror', error => errors.push(safeFailure(error,'journey')));
  // The original Host deliberately returns 404 when its optional Finder icon
  // is unavailable; OpenTargetButton replaces that image with its own SVG.
  const finderIcon=new URL('/open-in-app/icon/finder',origin).href;
  page.on('response',response=>{if(response.url()===finderIcon&&response.status()===404){const check=response.json().then(value=>{assert.deepEqual(value,{code:'not-found',message:'no icon for finder'});missingHostIcons.add(finderIcon);});check.catch(()=>{});iconChecks.push(check);}});
  page.on('console', entry => { if (entry.type() === 'error') {consoleDetails.push({message:entry.text(),url:entry.location().url});consoleErrors.push({category:'renderer-console-error',...(process.env.OMD_WEB_CU_LOCAL_INPUTS?{message:entry.text(),location:entry.location()}: {})});} });
  return {errors,consoleErrors,async assertClean(){
    await Promise.all(iconChecks);
    const unexpectedConsoleErrors=consoleErrors.filter((entry,index)=>!missingHostIcons.has(consoleDetails[index].url)||consoleDetails[index].message!=='Failed to load resource: the server responded with a status of 404 (Not Found)');
    const optionalHostIconFallbacks=[...missingHostIcons].map(()=>({application:'finder',status:404,hostCode:'not-found'}));
    if(missingHostIcons.size)assert.equal(await page.locator(`img[src="${finderIcon}"],img[src="open-in-app/icon/finder"]`).count(),0,'Original optional icon fallback removes the failed image');
    assert.deepEqual(errors, []); assert.deepEqual(unexpectedConsoleErrors, []);
    return optionalHostIconFallbacks;
  }};
}

export async function runWebCuSession(input) {
  return withJourneyControl({ signal: input.signal, deadline: input.deadline, abortAndSettle: options => input.harness.abortAndSettle(options) }, control => controlledSession(input, control));
}
async function controlledSession({ f, page, target, scenario, provider, harness, evidenceDirectory, installed, diagnostics }, control) {
  const { signal, deadline } = control;
  const step = work => control.step(work), until = (...args) => control.until(...args);
  const rpc = (method, args) => step(() => f.rpc(method, args, { signal }));
  const request = (path, body) => step(() => f.request(path, body, { signal }));
  for (const method of ['assertTargetDetached', 'waitForLocatorPoll', 'readReleaseEvidence', 'finishAndClose', 'shutdownHost', 'abortAndSettle']) assert.equal(typeof harness[method], 'function', method);
  assert.equal(f.hostVersion, '0.2.1-rc.2');
  const handoff = await step(() => harness.assertTargetDetached({ signal, deadline }));
  assert.equal(handoff.source, 'reviewed-owned-browser'); assert.equal(handoff.allowClicked, true);
  assert.equal(handoff.playwrightDisconnected, true); assert.equal(handoff.pendingPlaywrightOperations, 0);
  assert.equal(handoff.alive, true); assert.notEqual(handoff.profileA, handoff.profileB);
  assert.equal(handoff.zipSha256, installed.identity.files['vendor/opencu/lib/extension.zip'].sha256);
  const archiveResponse = await step(() => fetch(f.origin + '/api/opencu/extension.zip', { headers: { cookie: f.cookie }, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }));
  assert.equal(archiveResponse.status, 200);
  assert.equal(hash(Buffer.from(await step(() => archiveResponse.arrayBuffer()))), handoff.zipSha256, 'B uses the original installed ZIP delivered by actual Host');
  const { workspace } = await rpc('workspace/create', { request: { path: f.workspace } });
  const backend = await request('/api/opencu', { method: 'config' });
  assert.equal(backend.ok, true);
  for (const [key, expected] of Object.entries({ nativeEnabled: false, browserEnabled: false, managedHeadless: false, extensionEnabled: true, registerTools: true })) assert.equal(backend.config[key], expected, key);
  const capabilities = await request('/api/opencu', { method: 'capabilities' });
  assert.equal(capabilities.ok, true);
  assert.equal(capabilities.backends.native, false); assert.equal(capabilities.backends.extension, true);
  const title = 'Synthetic Web CU ' + scenario.nonce;
  await step(() => page.context().addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; })));
  assert.equal(typeof diagnostics?.assertClean,'function','Whole-page diagnostics must begin before harness navigation');
  const {errors,consoleErrors}=diagnostics;
  await step(() => page.goto(f.origin, { waitUntil: 'domcontentloaded', timeout: Math.max(1, deadline - Date.now()) }));
  const welcome = page.getByRole('button', { name: '继续', exact: true });
  if (await step(() => welcome.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false))) { await step(() => welcome.click()); await step(() => welcome.waitFor({ state: 'hidden' })); }
  // rc.2 intentionally hides unselected blank sessions. Create/select through
  // the actual workspace action before configuring its ordinary native preset.
  const conversation=page.locator('[data-conversation-session]:visible').first();
  const previous=await step(()=>conversation.getAttribute('data-conversation-session'));
  const workspaceRow=page.locator(`[data-row-key="workspace:${workspace.workspaceId}"]`);
  await step(()=>workspaceRow.hover());
  await step(()=>workspaceRow.getByRole('button',{name:/^在.*中新建会话$/}).click());
  const sessionId=await until(async()=>{const id=await conversation.getAttribute('data-conversation-session');return id&&id!==previous&&id;},'selected blank session in the owned workspace');
  const configured=await rpc('session/create',{request:{workspaceId:workspace.workspaceId,sessionId,agentPreset:'trisoul-x'}});
  assert.equal(configured.sessionId,sessionId);assert.equal(configured.agentPreset,'trisoul-x');
  const selected=await rpc('session/selectModel',{request:{sessionId,provider:'ecosystem',model:'ecosystem'}});
  assert.equal(selected.selected?.provider,'ecosystem');assert.equal(selected.selected?.model,'ecosystem');
  await rpc('session/rename',{request:{sessionId,title}});
  let diagnosticPhase='journey';
  const submit = async phase => {
    diagnosticPhase=phase;
    control.check(); provider.assertHealthy(); scenario.arm(phase);
    await step(() => page.locator('[data-composer-input]:visible').fill(scenario.marker(phase)));
    await step(() => page.locator('[data-composer-input]:visible').press('Enter'));
  };
  const settled = phase => until(async () => {
    provider.assertHealthy(); const observation = await step(() => f.inspect(sessionId, { signal }));
    if (observation.modelDenials.length) throw Error('Unexpected model route');
    const call = scenario.calls.get(phase);
    return call && observation.agent?.status === 'idle' && observation.events.some(event => event.type === 'tool/result' && event.data.message.toolCallId === call.callId) && observation;
  }, 'natural session end: ' + phase);
  const report = { passed: false, sessionId, handoff, installedIdentity: installed.identity, backend: backend.config, capabilities: { backends: capabilities.backends, connections: capabilities.connections?.length, pairings: capabilities.pairings?.length }, toolNavigation: [], phases: [], screenshots: [], attachments: [] };
  const capture = async phase => {
    const path = join(evidenceDirectory, 'web-cu-' + phase + '.png');
    await step(() => page.screenshot({ path })); report.screenshots.push(basename(path));
  };
  const attachment = async phase => {
    const tool = page.locator(`[data-chat-call-id="${scenario.calls.get(phase).callId}"]`);
    await step(() => tool.waitFor({ state: 'attached' })); assert.equal(await step(() => tool.count()), 1);
    const group = page.locator('[data-step-process][data-chat-group-key]').filter({ has: tool });
    const toggle = group.locator('button.tx-cu-group-toggle[aria-controls]');
    const navigation = { phase, defaultToolVisible: await step(() => tool.isVisible()), manualTurnExpansion:false, manualGroupExpansion: false, manualToolExpansion:false };
    const turn=await step(()=>group.getAttribute('data-chat-turn'));
    const turnToggle=page.locator(`button[data-turn-process="${turn}"]`);
    if(await step(()=>turnToggle.getAttribute('aria-expanded'))==='false'){await step(()=>turnToggle.click());navigation.manualTurnExpansion=true;}
    if (await step(() => toggle.count())) {
      assert.equal(await step(() => toggle.count()), 1);
      if (await step(() => toggle.getAttribute('aria-expanded')) === 'false') { await step(() => toggle.click()); navigation.manualGroupExpansion = true; }
    }
    report.toolNavigation.push(navigation);
    await step(() => tool.waitFor({ state: 'visible' }));
    const details=tool.getByRole('button',{name:scenario.calls.get(phase).args.title,exact:true});
    if(await step(()=>details.count())===1){await step(()=>details.click());navigation.manualToolExpansion=true;}
    for (const image of scenario.receipts.get(phase).images) {
      const result = await rpc('session/attachment', { request: { sessionId, attachmentId: image.attachmentId } });
      assert.equal(result.attachment.attachmentId, image.attachmentId);
      const bytes = Buffer.from(result.data, 'base64'); assert(bytes.length > 0);
      assert.equal(image.attachmentId, 'sha256:' + hash(bytes));
      const path = join(evidenceDirectory, 'cu-' + phase + '-' + report.attachments.length + '.png');
      assert.equal(result.attachment.mediaType, 'image/png');
      assert(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
      // Read already rendered images only in A, including the original REA shadow
      // tree; no target-B evaluation or replacement image is introduced.
      let renderedImage;
      await until(async () => {
        const images = await step(() => tool.locator('img').evaluateAll(async nodes => Promise.all(nodes.filter(node => node.complete && node.naturalWidth > 0).map(async node => {
          const url = new URL(node.currentSrc);
          if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== location.origin) throw Error('External tool image source');
          const bytes = await (await fetch(url)).arrayBuffer();
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          return {index:nodes.indexOf(node),id:'sha256:' + Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')};
        }))));
        const matching=images.find(value=>value.id===image.attachmentId);
        if(matching)renderedImage=tool.locator('img').nth(matching.index);
        return !!matching;
      }, 'original Web tool card renders the matching screenshot attachment');
      await step(()=>renderedImage.scrollIntoViewIfNeeded());
      assert.equal(await step(()=>renderedImage.isVisible()),true,'Matching screenshot is visible through the original tool card');
      assert.equal(await step(() => tool.getByRole('alert').count()), 0);
      await writeFile(path, bytes); report.attachments.push({ path:basename(path), attachmentId: image.attachmentId, bytes: bytes.length });
    }
  };
  let failure;
  try {
    await submit('exercise'); const exercised = await settled('exercise');
    assertSessionPhase(exercised, scenario, 'exercise');
    await until(() => target.snapshot().count === 1, 'independent target first click');
    assertTarget(target.snapshot(), scenario.nonce, 1, 'first'); await attachment('exercise'); await capture('exercise');
    report.phases.push(exercised);
    await submit('cancel');
    const held = await until(() => target.snapshot().events.find(event => event.type === 'keydown' && event.key === 'Shift'), 'actual trusted Shift before pending locator wait');
    const wait = await step(() => harness.waitForLocatorPoll({ sessionId, text: 'NEVER_VISIBLE_' + scenario.nonce, signal, deadline }));
    assert.equal(wait.source, 'original-extension-command'); assert.equal(wait.action, 'locator');
    assert.equal(wait.method, 'waitFor'); assert.equal(wait.value, false);
    assert.equal(wait.sessionId, sessionId); assert.equal(wait.text, 'NEVER_VISIBLE_' + scenario.nonce);
    assert.deepEqual(wait.identity, scenario.receipts.get('exercise').identity);
    // Real Web stop button -> conversation service -> session.cancel.
    await step(() => page.getByRole('button', { name: '停止生成', exact: true }).click());
    const canceled = await settled('cancel'); assertSessionPhase(canceled, scenario, 'cancel', { canceled: true });
    const release = await step(() => harness.readReleaseEvidence({ sessionId, signal, deadline }));
    // ACK and fixture counters have distinct ledgers; harness returns the bridge's
    // corresponding held-command sequence, never a fabricated shared sequence.
    assert(Number.isSafeInteger(release.heldCommandSequence));
    const actualState = await request('/api/opencu', { method: 'state' });
    assert.equal(actualState.ok, true);
    release.state = actualState.state; assertRelease(release, release.heldCommandSequence, scenario.receipts.get('exercise').identity);
    await until(() => target.snapshot().events.some(event => event.type === 'keyup' && event.key === 'Shift' && event.sequence > held.sequence), 'trusted released Shift arrives at independent ledger');
    assertTarget(target.snapshot(), scenario.nonce, 1, 'first'); await capture('canceled'); report.phases.push(canceled); report.release = release;
    await submit('recover'); const recovered = await settled('recover');
    assertSessionPhase(recovered, scenario, 'recover');
    await until(() => target.snapshot().count === 2, 'independent target recovery click');
    assertTarget(target.snapshot(), scenario.nonce, 2, 'recovered'); await attachment('recover'); await capture('recovered');
    report.phases.push(recovered);
    const stable = target.snapshot(); await control.sleep(750);
    assert.deepEqual(target.snapshot(), stable, 'No late or replayed actions');
    report.optionalHostIconFallbacks=await diagnostics.assertClean(); provider.assertHealthy();
    assert.equal(scenario.calls.size, 3); assert.equal(scenario.receipts.size, 2);
    // Original CLI appExit disposer; ProcessMonitor.stop is failure cleanup only.
    diagnosticPhase='shutdown';
    const host = await step(() => harness.shutdownHost({ sessionId, signal, deadline }));
    assertHostShutdown(host); report.hostShutdown = host;
    const closed = await step(() => harness.finishAndClose({ sessionId, signal, deadline }));
    assert.equal(closed.forced, false); assert.equal(closed.exitCode, 0); assert.equal(closed.signal, null);
    assert.equal(closed.closeObserved, true); assert.equal(closed.ownedMembersRemaining, 0);
    control.check(); report.closed = closed; report.passed = true;
  } catch (error) {
    failure = error; report.error = safeFailure(error,diagnosticPhase);
    if (process.env.OMD_WEB_CU_LOCAL_INPUTS) await writeFile(join(evidenceDirectory,'local-request-diagnostic.json'),JSON.stringify({requests:provider.requests.map(row=>({id:row.id,state:row.state,messages:row.payload?.messages?.filter(message=>['user','tool'].includes(message.role)),tools:row.payload?.tools?.map(tool=>tool.function?.name)})),observation:await f.inspect(sessionId).catch(error=>({error:error.message}))},null,2),{mode:0o600});
  }
  report.target = target.snapshot(); report.modelRequests = provider.requests.map(request=>({id:request.id,state:request.state,model:request.payload?.model}));
  report.pageErrors = errors; report.consoleErrors = consoleErrors;
  try { await writeFile(join(evidenceDirectory, 'web-cu-report.json'), JSON.stringify(report, null, 2).replaceAll(f.home, '[owned-home]').replaceAll(f.workspace, '[owned-workspace]').replaceAll(target.url, '[owned-fixture]').replaceAll(f.origin, '[owned-host]') + '\n'); }
  catch (error) { failure = failure ? new AggregateError([failure, error], 'Journey and evidence write failed') : error; }
  if (failure) throw failure;
  return report;
}

export function assertHostShutdown(host) {
  assert.equal(host.method, 'original-app-exit'); assert.equal(host.sentSignal, null);
  assert.equal(host.forced, false); assert.equal(host.exitCode, 0); assert.equal(host.signal, null);
  assert.equal(host.closeObserved, true); assert.equal(host.ownedMembersRemaining, 0);
  const receipt = host.disposal;
  assert.equal(receipt.source, 'original-root-dispose-fulfilled'); assert.equal(receipt.appExitRequested, true);
  assert.equal(receipt.signalCount, 0); assert.equal(host.processExitCalled, false); assert.equal(host.naturalBeforeExit, true); assert.equal(receipt.leaseCountBefore > 0, true); assert.equal(receipt.leaseCountAfter, 0);
  assert.equal(host.pendingCommands, 0); assert.equal(host.pendingTools, 0);
}
