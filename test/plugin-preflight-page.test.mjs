// Targeted browser regression for the preflight UI. Uses an already installed
// browser (OMD_TEST_BROWSER may select it); no accounts, models or downloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { checkRuntimePage } from '../src/plugin-preflight/page.mjs';

test('preflight follows rendered onboarding branches and still rejects real failures', async t => {
  let scenario, reads;
  const server = createServer((req, res) => {
    if (req.url === '/missing.js') { res.writeHead(404); res.end(); return; }
    if (req.url.startsWith('/api/')) {
      const value = req.url.endsWith('listBundles')
        ? [{ name: 'fixture', enabled: true, rows: [{ entryId: 'include:fixture' }] }]
        : [{ entryId: 'include:fixture', moduleName: 'fixture', enabled: true,
          fiberPhase: scenario === 'host-failed' ? 'failed' : scenario === 'loading' || scenario === 'settling' && reads++ === 0 ? 'loading' : 'active' }];
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ result: { ok: true, value } })); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (scenario === 'blank') { res.end('<html><body></body></html>'); return; }
    res.end(`<!doctype html><html><body><div id="root"><div data-composer-input contenteditable="true" style="width:400px;height:60px;border:1px solid"></div><button id="account"></button></div>
<script>
const scenario=${JSON.stringify(scenario)}, english=scenario==='english';
const root=document.getElementById('root');
const account=document.getElementById('account');account.textContent=english?'Account menu':'账号菜单';
function button(label,fn,parent){const b=document.createElement('button');b.textContent=label;b.onclick=fn;parent.append(b);return b;}
function dialog(title){const d=document.createElement('div');d.setAttribute('role','dialog');d.setAttribute('aria-label',title);d.style='position:fixed;inset:0;background:white';document.body.append(d);root.inert=true;return d;}
function done(d){d.remove();root.inert=false;}
function editor(){const d=dialog('API Key');button(english?'Configure later':'稍后配置',()=>done(d),d);}
function choice(){const d=dialog('Login');button(english?'Add API Key':'添加 API Key',()=>{done(d);editor()},d);}
if(scenario==='direct')editor();
else if(['disabled-auto-close','vanishing'].includes(scenario)){
 const d=dialog('预览版说明'),b=button('继续',()=>done(d),d);
 if(scenario==='disabled-auto-close')b.disabled=true;
 else b.animate([{transform:'translateX(0)'},{transform:'translateX(100px)'}],{duration:300,iterations:Infinity});
 setTimeout(()=>done(d),350);
}
else if(['choice','ready-after-welcome','direct-after-welcome','english','settling'].includes(scenario)){
 const d=dialog(english?'Preview Notice':'预览版说明');
 button(english?'Continue':'继续',()=>{done(d);if(scenario==='ready-after-welcome'||scenario==='settling')return;if(scenario==='direct-after-welcome')editor();else choice()},d);
}
if(scenario==='blocked'){const d=dialog('Unknown setup');d.textContent='Waiting for external service';}
if(scenario==='client-failed')setTimeout(()=>{throw Error('Synthetic client startup failure')},30);
if(scenario==='script-failed'){const script=document.createElement('script');script.src='/missing.js';document.head.append(script);}
if(scenario==='hidden-choice'){const d=document.createElement('div');d.setAttribute('role','dialog');d.hidden=true;button('添加 API Key',()=>{throw Error('Hidden button clicked')},d);document.body.append(d);}
account.onclick=()=>{const m=document.createElement('div');m.setAttribute('role','menu');document.body.append(m);button(english?'Settings':'设置',()=>{m.remove();dialog(english?'Settings':'设置')},m).setAttribute('role','menuitem');};
</script></body></html>`);
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ headless: true, ...(process.env.OMD_TEST_BROWSER ? { executablePath: process.env.OMD_TEST_BROWSER } : {}) });
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;
  for (const name of ['choice', 'direct', 'direct-after-welcome', 'ready-after-welcome', 'ready', 'english', 'hidden-choice', 'settling', 'disabled-auto-close', 'vanishing',
    'blocked', 'blank', 'client-failed', 'script-failed', 'host-failed', 'loading']) await t.test(name, async () => {
    scenario = name; reads = 0;
    const page = await browser.newPage();
    try {
      const codes = { blocked: 'ui-timeout', blank: 'client-failed', 'client-failed': 'client-failed', 'script-failed': 'client-failed', 'host-failed': 'host-failed', loading: 'environment-timeout' };
      const result = checkRuntimePage(page, url, { candidate: 'fixture', timeoutMs: name === 'vanishing' ? 3000 : 1800 });
      if (codes[name]) await assert.rejects(result, { code: codes[name] });
      else { await result; assert.equal(await page.getByRole('dialog', { name: /^(设置|Settings)$/ }).isVisible(), true); }
    } finally { await page.close(); }
  });
});
