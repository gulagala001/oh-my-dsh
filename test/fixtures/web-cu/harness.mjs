import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { createServer as createSocket } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { join, isAbsolute, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ecosystemFixture } from '../plugin-ecosystem.mjs';
import { createOwnedFixtureDirectory } from '../fixture-evidence.mjs';
import { ownedBrowser, retainOwner, operationScope, settleOperations, singleFlight } from './owned-browser.mjs';
import { installWebCuPackage, reviewedTgzSha256, assertLocalArchive, assertHostShutdown, createWebCuPageDiagnostics } from './journey.mjs';
import { createWorkerProbe } from './worker-reader.mjs';
import { withJourneyControl } from './control.mjs';
import { assertConnectionIdentity,assertConnectionView,readConnectionView } from './connection.mjs';
import { safeFailure } from './failure.mjs';

const exec = promisify(execFile), require = createRequire(import.meta.url);
export const retainFirstFailure=(first,next)=>first?new AggregateError([first,next],'Original failure and owned cleanup failure'):next;
export async function afterFixturePreflight(preflight,start){await preflight();return start();}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const candidate = '53128743490aa10e4e36e9ab9de3c492ad0f973d';
let active;
export async function abortAndSettle(options) { await active?.abortAndSettle(options); }
async function browserPin() {
  assert.equal(process.env.GITHUB_ACTIONS,'true'); assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
  assert(/^macos15(?:-arm64)?$/i.test(process.env.ImageOS??'') && process.env.ImageVersion,'Require official disposable macOS15 image');
  assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64'); assert.notEqual(process.getuid(), 0);
  const cache = await realpath(process.env.PLAYWRIGHT_BROWSERS_PATH), executable = await realpath(chromium.executablePath());
  const temporary=await realpath(tmpdir());
  assert(['PLAYWRIGHT_DOWNLOAD_HOST','PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR','NODE_OPTIONS'].every(name=>!process.env[name]),'Download or trust override forbidden');
  assert(cache.startsWith(temporary+sep+'opencu-pairing-browser-') && executable.startsWith(cache + sep + 'chromium-1243/chrome-mac-arm64/'));
  assert.equal(await readFile(join(cache, '.pairing-cache-owner'), 'utf8'), candidate);
  assert.equal(require('playwright/package.json').version, '1.63.0'); const pw=createRequire(require.resolve('playwright/package.json')); assert.equal(pw('playwright-core/package.json').version, '1.63.0');
  const meta = JSON.parse(await readFile(join(pw.resolve('playwright-core/package.json'), '..', 'browsers.json'))).browsers.find(b => b.name === 'chromium');
  assert.equal(meta.revision, '1243'); assert.equal(meta.browserVersion, '153.0.8010.12');
  const evidence = JSON.parse(await readFile(process.env.OMD_WEB_CU_BROWSER_INSTALL_EVIDENCE));
  assert.equal(evidence.source, 'https://cdn.playwright.dev/builds/cft/153.0.8010.12/mac-arm64/chrome-mac-arm64.zip');
  assert.equal(evidence.platform,'darwin'); assert.equal(evidence.architecture,'arm64');
  assert.equal(evidence.playwrightVersion,'1.63.0'); assert.equal(evidence.coreVersion,'1.63.0'); assert.equal(evidence.revision,'1243'); assert.equal(evidence.browserVersion,'153.0.8010.12');
  assert((await stat(executable)).isFile());
  assert.equal(evidence.installComplete, true); assert.equal(evidence.sourceObserved, true);
  assert.equal(evidence.executableSha256, digest(await readFile(executable)));
  return executable;
}
// The original CI entry always retains its fixed hosted-image/browser/product pins.
export async function withWebCuHarness(input, run) { return withHarness(input, run); }
export async function readLocalInputs(file) {
  assert(typeof file === 'string' && isAbsolute(file), 'Explicit absolute local input manifest required');
  const inputs = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(inputs.schemaVersion, 1);
  if (inputs.packageStore !== undefined) assert(isAbsolute(inputs.packageStore), 'Local public package cache must be absolute');
  for (const name of ['productSha256','clientSha256','browserExecutableSha256']) assert.match(inputs[name], /^[a-f0-9]{64}$/, name);
  for (const name of ['productTgz','dshCli','output','browserExecutable']) assert(typeof inputs[name] === 'string' && isAbsolute(inputs[name]), name);
  assertLocalArchive(await readFile(inputs.productTgz), inputs.productSha256);
  return inputs;
}
export async function localBrowserPin(inputs) {
  assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64'); assert.notEqual(process.getuid(), 0);
  assert(['PLAYWRIGHT_DOWNLOAD_HOST','PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR','NODE_OPTIONS'].every(name=>!process.env[name]),'Download or trust override forbidden');
  assert.equal(require('playwright/package.json').version, '1.63.0');
  const pw = createRequire(require.resolve('playwright/package.json'));
  assert.equal(pw('playwright-core/package.json').version, '1.63.0');
  const meta = JSON.parse(await readFile(join(pw.resolve('playwright-core/package.json'), '..', 'browsers.json'))).browsers.find(b=>b.name==='chromium');
  assert.equal(meta.revision,'1243'); assert.equal(meta.browserVersion,'153.0.8010.12');
  const executable = await realpath(inputs.browserExecutable);
  assert((await stat(executable)).isFile());
  assert.equal(digest(await readFile(executable)), inputs.browserExecutableSha256, 'Local executable changed after review');
  // This is local provenance, with no claim of a hosted runner or official download receipt.
  const {stdout} = await exec(executable, ['--version'], {timeout:5000,maxBuffer:4096});
  assert.match(stdout, /\b153\.0\.8010\.12\b/, 'Local browser must match the pinned supported Chromium');
  return executable;
}
export async function withLocalWebCuHarness(input, run) {
  const local = await readLocalInputs(process.env.OMD_WEB_CU_LOCAL_INPUTS);
  return withHarness(input, run, local);
}
async function withHarness({ target, provider, scenario, signal, deadline }, run, local) {
  assert(!active, 'Only one owned Web CU harness may run'); signal.throwIfAborted();
  const out = local?.output ?? process.env.OMD_WEB_CU_OUTPUT, tgz = local?.productTgz ?? process.env.OMD_WEB_CU_PRODUCT_TGZ, cli = local?.dshCli ?? process.env.OMD_DSH_CLI;
  const productSha256 = local?.productSha256 ?? reviewedTgzSha256;
  assert([out,tgz,cli].every(path => typeof path === 'string' && isAbsolute(path)), 'Require explicit owned evidence output, fixed product tgz and rc.2 CLI');
  const executable = await (local ? localBrowserPin(local) : browserPin()), owned = await createOwnedFixtureDirectory('omd-web-cu-'), root = owned.path;
  assert(!out.startsWith(root + sep)); await mkdir(out, { recursive: true });
  let allowed=false, shutdownFile, requestFile, f, a, b, probe, passed = false, failure, hostShutdown, report, setupPage, lastExtensionStatus, diagnostics;
  const setupErrors = [];
  const cleanup = [], browserOwners=new Set(), cleanupScope=operationScope();
  let probeStopped=true,cleanupLimit=Infinity; const hostClose=singleFlight(()=>f?.close());
  const register=owner=>retainOwner(browserOwners,owner);
  active = { async abortAndSettle({deadline=Date.now()+10000}={}) { cleanupLimit=Math.min(cleanupLimit,deadline);await settleOperations(cleanupScope,[...[...browserOwners].map((owner,index)=>['browser-settle-'+index,()=>owner.settle({deadline})]),['probe-settle',async()=>{if(probe){await probe.close({deadline});probeStopped=probe.settled;}}]],deadline); } };
  try {
    await withJourneyControl({ signal, deadline, abortAndSettle }, async control => {
      const step = work => control.step(work), wait = (fn,label) => control.until(fn,label);
      // Hash-locked product is inspected before launching Host or either browser.
      assert.equal(digest(await readFile(tgz)), productSha256);
      // Installation uses the complete actual product package. No source link.
      f = await step(() => ecosystemFixture({ root, cli, simulationProvider: provider, signal, extraLoopbackPorts: [target.port], isolation: 'native', storeDir: local?.packageStore ?? join(root,'public-store') }));
      const installed = await step(() => installWebCuPackage(f, { tgz, sha256: productSha256, localCandidate: local }));
      const zip = join(root, 'extension.zip'), extension = join(root, 'extension');
      // Pre-Host preflight uses identical packaged original ZIP bytes; after boot
      // the real authenticated Host download must match and supplies final bytes.
      await writeFile(zip, await readFile(join(installed.packageRoot, 'vendor/opencu/lib/extension.zip')));
      await step(() => exec('python3', ['-c', `import zipfile,json,hashlib,pathlib,sys
z=zipfile.ZipFile(sys.argv[1]); meta=json.load(open(sys.argv[3])); names=z.namelist(); assert len(names)==len(set(names)) and set(names)==set(meta['files']); assert 1<=len(names)<=128 if sys.argv[4]=='local' else len(names)==18; out=pathlib.Path(sys.argv[2]);out.mkdir()
assert z.testzip() is None
for n in names:
 assert '/' not in n and '\\\\' not in n and '..' not in n and not n.startswith('.')
 data=z.read(n);assert hashlib.sha256(data).hexdigest()==meta['files'][n];(out/n).write_bytes(data)
`, zip, extension, join(installed.packageRoot, 'vendor/opencu/src/extension/distribution.json'), local ? 'local' : 'ci'], { signal, timeout: 10000 }));
      const manifest = JSON.parse(await readFile(join(extension, 'manifest.json')));
      const extensionId = digest(Buffer.from(manifest.key,'base64')).slice(0,32).replace(/[0-9a-f]/g, x => String.fromCharCode(97 + parseInt(x,16)));
      for(let port=19390;port<=19399;port++){
        const listener=createSocket();
        try{await step(()=>new Promise((resolve,reject)=>{listener.once('error',()=>reject(Error('Discovery port occupied; refuse shared Host')));listener.listen(port,'127.0.0.1',resolve);}));}
        finally{if(listener.listening)await new Promise(resolve=>listener.close(resolve));}
      }
      b = await step(() => ownedBrowser({ root, profile: join(root,'profile-b'), home: join(root,'home-b'), executable, extension, extensionId, signal, register }));
      let options = b.browser.contexts()[0].pages().find(page => page.url() === `chrome-extension://${extensionId}/options.html`);
      assert(options); await step(() => options.locator('#status').waitFor());
      const status = async () => lastExtensionStatus = await b.run('read-original-options-status', () => options.evaluate(() => chrome.runtime.sendMessage({type:'status'}).then(value => value.result)));
      await wait(async () => { const value = await status(); assert(value.paired!==true&&value.connected!==true); return true; }, 'original extension unpaired');
      await afterFixturePreflight(async()=>{
      const nodeGET = await step(() => fetch(target.url, { signal })); assert.equal(nodeGET.status,200); assert((await nodeGET.text()).includes(target.nonce));
      const preflight = await b.run('preflight-page-create', () => b.browser.contexts()[0].newPage());
      await b.run('preflight-navigation', () => preflight.goto(target.url, { timeout:10000 }));
      assert.equal(await b.run('preflight-DOM', () => preflight.getByRole('heading',{name:'Owned synthetic '+target.nonce,exact:true}).count()),1);
      await b.run('preflight-page-close', () => preflight.close());
      }, async()=>{
      // Only now is the real Host started. No standalone OpenCU runtime is made.
      shutdownFile = join(root,'host-shutdown.jsonl'); requestFile = join(root,'request-app-exit');
      const patch = join(f.home,'profiles',f.profile,'cordis.patch.yml'), rows = JSON.parse(await readFile(patch,'utf8'));
      const observerDirectory=join(root,'web-cu-shutdown-observer');await mkdir(observerDirectory);
      await writeFile(join(observerDirectory,'package.json'),JSON.stringify({name:'owned-web-cu-shutdown-observer',version:'1.0.0',type:'module',exports:'./index.mjs'}));
      await writeFile(join(observerDirectory,'index.mjs'),await readFile(new URL('./shutdown-observer.mjs',import.meta.url)));
      rows.push({ insert:[{ id:'web-cu-shutdown-observer', name:pathToFileURL(join(observerDirectory,'index.mjs')).href, config:{root,file:shutdownFile,requestFile} }] });
      await writeFile(patch,JSON.stringify(rows)); await step(() => f.start());
      });
      const download = await step(() => fetch(f.origin+'/api/opencu/extension.zip',{headers:{cookie:f.cookie},signal})); assert.equal(download.status,200);
      const downloaded = Buffer.from(await download.arrayBuffer()); assert.equal(digest(downloaded),digest(await readFile(zip)));
      // Same original bytes, fetched from Host, supply B's unchanged distribution.
      await writeFile(zip,downloaded);
      a = await step(() => ownedBrowser({ root, profile:join(root,'profile-a'), home:join(root,'home-a'), executable, signal, register }));
      await a.browser.contexts()[0].route('**/*',route=>{const url=new URL(route.request().url());return url.origin===f.origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
      const page = setupPage = a.browser.contexts()[0].pages()[0];
      page.on('pageerror', error => setupErrors.push(error.message));
      diagnostics=createWebCuPageDiagnostics(page,f.origin);
      await a.run('A-viewport', () => page.setViewportSize({width:1440,height:1000}));
      await step(() => page.context().addCookies(f.cookie.split('; ').map(row=>{const at=row.indexOf('=');return {name:row.slice(0,at),value:row.slice(at+1),url:f.origin};})));
      await a.run('A-real-Web', () => page.goto(f.origin,{timeout:10000}));
      await a.run('A-sidebar-ready',()=>page.getByRole('button',{name:/^(账号菜单|Account menu|设置|Settings)$/}).first().waitFor({state:'visible',timeout:7000}));
      const welcome = page.getByRole('button',{name:/^(继续|Continue)$/});
      if(await a.run('A-welcome',()=>welcome.waitFor({state:'visible',timeout:5000}).then(()=>true,()=>false))) await a.run('A-welcome-click',async()=>{await welcome.click();await welcome.waitFor({state:'hidden',timeout:5000});});
      if (local) await writeFile(join(out,'entry-aria.txt'),await page.locator('body').ariaSnapshot());
      await a.run('A-settings',async()=>{
        const direct = page.getByRole('button',{name:'设置',exact:true}).first();
        if (await direct.isVisible()) await direct.click({timeout:2500});
        else {
          await page.getByRole('button',{name:/^(账号菜单|Account menu)$/}).click({timeout:2500});
          if (local) await writeFile(join(out,'more-aria.txt'),await page.locator('body').ariaSnapshot());
          await page.getByRole('menuitem',{name:/^设置(?:\s|$)/}).click({timeout:2500});
        }
        await page.getByRole('dialog',{name:'设置',exact:true}).waitFor({state:'visible',timeout:5000});
      });
      await a.run('A-computer-settings',()=>page.getByText(/^(电脑与浏览器|Computer use)$/).first().click());
      await a.run('A-connection-details',()=>page.getByRole('button',{name:/^(连接|Connect)$/}).click({timeout:5000}));
      // The local machine may have other unpaired profiles discovering this
      // Host. Establish B's candidacy before requesting approval, and use the
      // original chooser when there is more than one profile.
      await wait(async()=> (await status()).hosts?.length === 1, 'owned B discovers the only owned Host');
      const ownedInstanceId = await b.run('B-original-installation-id',()=>options.evaluate(()=>chrome.storage.local.get('instanceId').then(value=>value.instanceId)));
      assert.match(ownedInstanceId,/^[a-f0-9-]{36}$/);
      await a.run('A-original-connect-button',()=>page.getByRole('button',{name:/^(连接浏览器|Connect browser)$/}).click());
      await wait(async()=>{
        if ((await status()).hosts?.some(host=>host.requestId)) return true;
        const choice=page.getByRole('button',{name:'Google Chrome · '+ownedInstanceId.slice(-8),exact:true});
        if (await choice.isVisible()) await a.run('A-owned-profile-choice',()=>choice.click({timeout:2500}));
        return false;
      }, 'real Host demand for owned B in original options');
      await a.run('A-visible-waiting',()=>page.getByRole('status').filter({hasText:/等待|Waiting for approval/}).waitFor());
      await b.run('B-real-Allow',()=>options.locator('#connect').click()); allowed=true;
      await wait(async()=> status().then(value=>value.paired===true&&value.connected===true), 'original extension paired and connected');
      const extensionStatus=await status();
      assert.equal(extensionStatus.instanceId,ownedInstanceId);
      const paired=await f.request('/api/opencu',{method:'capabilities'},{signal});
      const connection=assertConnectionIdentity(paired,extensionStatus,extensionId);
      await wait(async()=>{const view=await a.run('A-stable-connection-row',()=>readConnectionView(page,connection.label));if(view.rows.length!==1||view.count!==1)return false;return assertConnectionView(view,connection.label);},'same connected profile stable ready row');
      probeStopped=false;probe=await step(()=>createWorkerProbe(b.endpoint,extensionId,{signal,deadline,bridgeEndpoint:extensionStatus.endpoint,connection}));
      await step(()=>b.disconnect()); options=undefined;
      const same = isDeepStrictEqual;
      const bridgeRead = async(sessionId)=> {
        probe.check();const observed=await f.inspect(sessionId,{signal});const call=scenario.calls.get('cancel');
        assert(observed.events.some(event=>event.type==='tool/call'&&event.data.callId===call?.callId&&JSON.parse(event.data.arguments).code.includes('NEVER_VISIBLE_'+scenario.nonce)));
        return scenario.receipts.get('exercise').identity;
      };
      const harness = {
        abortAndSettle,
        async assertTargetDetached(){assert.equal(b.state.exited,false);return {source:'reviewed-owned-browser',allowClicked:allowed,playwrightDisconnected:b.browser===undefined,pendingPlaywrightOperations:b.pendingOperations,alive:true,profileA:digest(a.profile),profileB:digest(b.profile),zipSha256:digest(downloaded)};},
        async waitForLocatorPoll({sessionId,text}){
          const identity=await bridgeRead(sessionId);
          return wait(()=>{probe.check();const command=probe.ledger.commands.find(row=>same(row.identity,identity)&&row.action==='locator'&&row.locatorMethod==='waitFor'&&row.locatorText===text);const result=probe.ledger.results.find(row=>row.id===command?.id&&row.ok&&row.value===false);return result&&{source:'original-extension-command',action:'locator',method:'waitFor',value:false,sessionId,text,identity};},'original nonce locator command/result');
        },
        async readReleaseEvidence({sessionId}){
          const identity=await bridgeRead(sessionId);
          const held=probe.ledger.commands.find(row=>same(row.identity,identity)&&['keyDown','key_down'].includes(row.action)&&row.key==='Shift');assert(held);
          const ack=await wait(()=>{probe.check();return probe.ledger.results.find(row=>row.method==='release'&&row.released&&row.ok&&row.sessionHash===held.sessionHash&&(same(row.identity,identity)||row.scope==='session-all')&&row.sequence>held.sequence);},'actual original release ACK');
          return {heldCommandSequence:held.sequence,heldCommand:held,ack,heldInputs:await probe.heldInputs()};
        },
        async shutdownHost({sessionId}){
          const observed=await f.inspect(sessionId,{signal});const calls=observed.events.filter(e=>e.type==='tool/call'),results=observed.events.filter(e=>e.type==='tool/result');
          assert(calls.every(call=>results.some(result=>result.data.message.toolCallId===call.data.callId)));
          probe.beginHostShutdown();await writeFile(requestFile,'request original appExit(0)\n');
          const raw=f.ownedHostProcess;const exit=await step(()=>f.hostClose);const hostClosedAt=Date.now();
          const monitor = await wait(()=>{ const snapshot=f.hostMonitorSnapshot();assert(snapshot);assert.deepEqual(snapshot.errors,[]);return snapshot.pending===0&&snapshot.groups.every(group=>group.retired)&&snapshot.processes.every(row=>row.retired)&&snapshot; },'original OS ownership monitor observes all Host members retired');
          assert(!monitor.events.some(event=>event.type==='process/forced-stop'));
          const disposal=(await readFile(shutdownFile,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
          hostShutdown={method:'original-app-exit',sentSignal:null,forced:false,exitCode:raw.exitCode,signal:raw.signalCode,closeObserved:exit.code===raw.exitCode&&exit.signal===raw.signalCode,ownedMembersRemaining:monitor.processes.filter(row=>!row.retired).length,
            disposal:disposal.find(row=>row.source==='original-root-dispose-fulfilled'),processExitCalled:disposal.some(row=>row.source==='process-exit-called'),naturalBeforeExit:disposal.some(row=>row.source==='natural-before-exit'),pendingTools:0,pendingCommands:probe.ledger.pending};
          assertHostShutdown(hostShutdown);
          hostShutdown.terminalBridge=await probe.confirmHostShutdown(hostShutdown,{appExit:disposal.find(row=>row.source==='original-app-exit-request')?.at,rootFulfilled:hostShutdown.disposal?.at,hostClose:hostClosedAt});return hostShutdown;
        },
        async finishAndClose(){assertHostShutdown(hostShutdown);await probe.close({deadline});probeStopped=probe.settled;probe=undefined;const result=await b.naturalClose({deadline:Math.min(deadline,Date.now()+10000)});await a.naturalClose({deadline:Math.min(deadline,Date.now()+10000)});return result;}
      };
      report=await run({f,page,harness,evidenceDirectory:out,installed,signal,deadline,diagnostics}); control.check(); passed=report.passed===true;
    });
  } catch(error){
    failure=error;
    if (local && f) await writeFile(join(out,'pairing-diagnostic.json'),JSON.stringify({extension:lastExtensionStatus,capabilities:await f.request('/api/opencu',{method:'capabilities'}).catch(error=>({error:error.message}))},null,2),{mode:0o600}).catch(()=>{});
    if (local && setupPage && !setupPage.isClosed()) {
      const body = await setupPage.locator('body').innerText({timeout:2000}).catch(()=>'<unavailable>');
      await writeFile(join(out,'setup-diagnostic.json'),JSON.stringify({errors:setupErrors,failure:String(error.stack??error),body},null,2),{mode:0o600}).catch(()=>{});
      await writeFile(join(out,'failure-aria.txt'),await setupPage.locator('body').ariaSnapshot(),{mode:0o600}).catch(()=>{});
      await setupPage.screenshot({path:join(out,'setup-failure.png'),timeout:2000}).catch(()=>{});
    }
  }
  // All owners survive failed startup, including when a/b were never assigned.
  const cleanupDeadline=Math.min(cleanupLimit,Date.now()+10000);
  const actions=[['probe',async()=>{if(probe){await probe.close({deadline:cleanupDeadline});probeStopped=probe.settled;}}],
    ...[...browserOwners].map((owner,index)=>['browser-'+index,()=>owner.closed?undefined:owner.failureClose({deadline:cleanupDeadline})]),['Host',hostClose]];
  try{await settleOperations(cleanupScope,actions.map(([name,action])=>{const receipt={name,ok:false,settled:false};cleanup.push(receipt);return [name,async()=>{try{await action();receipt.ok=true;}finally{receipt.settled=true;}}];}),cleanupDeadline);}
  catch(error){failure=retainFirstFailure(failure,error);}
  for(const owner of browserOwners)owner.disposeSignal();active=undefined;
  let rootRemoved=false;
  const hostSnapshot=f?.hostMonitorSnapshot();
  const processesStopped=[...browserOwners].every(owner=>owner.stopped)&&probeStopped&&cleanupScope.pending()===0&&(!f?.ownedHostProcess||(hostSnapshot&&hostSnapshot.pending===0&&hostSnapshot.errors.length===0&&hostSnapshot.groups.every(row=>row.retired)&&hostSnapshot.processes.every(row=>row.retired)));
  if(processesStopped&&cleanup.every(row=>row.ok)){try{await owned.remove();rootRemoved=true;}catch(error){failure=retainFirstFailure(failure,error);}}
  else failure=retainFirstFailure(failure,Error('Unknown or live owned process; profile retained'));
  try{await writeFile(join(out,'web-cu-cleanup.json'),JSON.stringify({acceptanceMode:local?'local-candidate':'reviewed-hosted-ci',productSha256,browserExecutableSha256:local?.browserExecutableSha256,passed:passed&&!failure,cleanup,rootRemoved,cacheRemovalAuthority:'external-install-wrapper',cacheRemoved:false,failure:failure?safeFailure(failure,'cleanup'):undefined},null,2));}
  catch(error){failure=retainFirstFailure(failure,error);}
  if(failure)throw failure;assert(passed);return report;
}
