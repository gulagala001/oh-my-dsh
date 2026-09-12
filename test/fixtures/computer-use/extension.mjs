import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { ExtensionHub } from '../../../src/computer-use/extension-hub.mjs';
import { ExtensionInstaller } from '../../../src/computer-use/extension-install.mjs';
import { startFixture } from './server.mjs';

export async function extensionFixture(t, options = {}) {
  const root=await mkdtemp(join(process.platform==='darwin'?'/tmp':tmpdir(),options.prefix??'trisoul-ext-cdp-'));
  const profile=options.profile??join(root,'profile'),hub=options.socketPath?null:new ExtensionHub(join(root,'bridge.sock'));
  let context,fixture,popup,installer;
  t.after(async()=>{
    const closed=await Promise.allSettled([context?.close(),hub?.close(),options.fixture?undefined:fixture?.close()]);
    if(!process.env.TRISOUL_CU_UI_ARTIFACTS)await rm(root,{recursive:true,force:true});
    const errors=closed.filter(result=>result.status==='rejected').map(result=>result.reason);
    if(errors.length)throw new AggregateError(errors,'Extension fixture cleanup failed');
  });
  await hub?.start();fixture=options.fixture??await startFixture();
  let extension=options.extensionPath??fileURLToPath(new URL('../../../browser-extension',import.meta.url));
  if(options.install){
    const source=join(root,'source');await cp(extension,source,{recursive:true});
    installer=new ExtensionInstaller(join(root,'runtime'),options.socketPath??hub.socketPath,{chromeUserDataDir:profile,source});
    await installer.prepare();extension=installer.extensionPath;
  }
  const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
  const id=createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32).split('').map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
  const origin='chrome-extension://'+id+'/',host=fileURLToPath(new URL('../../../scripts/computer-use-extension-host.mjs',import.meta.url)),launcher=join(root,'native-host');
  if(!options.install&&!options.prepared){
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  await writeFile(launcher,'#!/bin/sh\nexec '+[process.execPath,host,'--socket',options.socketPath??hub.socketPath,'--extension-origin',origin].map(quote).join(' ')+' "$@"\n',{mode:0o700});
  const directory=join(profile,'NativeMessagingHosts');await mkdir(directory,{recursive:true});
  await writeFile(join(directory,'ai.trisoul.computer_use.json'),JSON.stringify({name:'ai.trisoul.computer_use',description:'Isolated Trisoul CDP test',path:launcher,type:'stdio',allowed_origins:[origin]}));
  }
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:options.headless??true,...(options.viewport!==undefined?{viewport:options.viewport}:{}),args:['--site-per-process','--disable-extensions-except='+extension,'--load-extension='+extension,...(options.args??[])]});
  context.on('dialog',()=>{});popup=await context.newPage();await popup.goto(origin+'popup.html');
  await popup.getByText('已连接 Oh My DSH',{exact:true}).waitFor({timeout:10000});
  const worker=context.serviceWorkers().find(worker=>worker.url()===origin+'worker.js');
  const instanceId=await worker.evaluate(async()=> (await chrome.storage.local.get('instanceId')).instanceId);
  const browser=hub?hub.list()[0]:{id:'chrome:'+instanceId};
  if(!browser)throw new Error('Extension did not connect: '+await popup.locator('body').innerText());
  return{root,context,fixture,hub,browser,popup,origin,installer};
}
