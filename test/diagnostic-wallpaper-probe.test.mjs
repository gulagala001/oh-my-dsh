import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import sharp from 'sharp';
import { frontendFixture, until } from './fixtures/frontend.mjs';

for(let fixtureAttempt=1;fixtureAttempt<=3;fixtureAttempt++) test(`Diagnostic fixture ${fixtureAttempt}: Codex wallpaper controls, 20 reopen observations`, { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { installedPackage: true }), { page } = f;
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('codex-desktop');
  await page.getByLabel('配色', { exact: true }).selectOption('palette:lavender');
  await page.getByLabel('背景图片', { exact: true }).setInputFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 16, height: 16, channels: 3, background: '#8899aa' } }).png().toBuffer() });
  await page.getByLabel('背景显示区域', { exact: true }).selectOption('conversation');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await until(async () => (await page.locator('.tx-workbench').boundingBox())?.width >= 300);
  const pane = await page.locator('[data-sidebar-right-panel][data-sidebar-right-open]').boundingBox();
  assert.ok(pane.y + pane.height >= 800 && pane.y + pane.height <= 820, 'the workbench uses the available height below the titlebar');
  const toggle = page.locator('.codex-panel-toggle');
  const hit = locator => locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  await until(async () => await toggle.getAttribute('aria-expanded') === 'true');
  if (process.env.TRISOUL_UI_ARTIFACTS) { await page.screenshot({ path: join(f.root, 'codex-wallpaper-controls.png') }); console.log('Codex wallpaper controls:', f.root); }
  assert.equal(await hit(toggle), true, 'the empty right-column area does not cover the titlebar control');
  const navigation = page.locator('.cx-navigation').getByRole('button', { name: '上下文', exact: true });
  assert.equal(await hit(navigation), true, 'the pane still receives input');
  await navigation.click();
  const inspect = locator => locator.evaluate(el => {
    const box = node => { const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
    const identity = node => node ? {tag:node.tagName,id:node.id,className:node.getAttribute('class'),role:node.getAttribute('role'),label:node.getAttribute('aria-label'),attrs:Object.fromEntries([...node.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])),outerHTML:node.outerHTML.slice(0,450)} : null;
    const style = node => {const s=getComputedStyle(node);return Object.fromEntries(['display','visibility','opacity','pointerEvents','zIndex','position','transform','translate','transitionProperty','transitionDuration','transitionDelay','animationName','animationDuration','animationDelay'].map(key=>[key,s[key]]));};
    const ancestors = node => {const list=[];for(let at=node;at&&list.length<8;at=at.parentElement)list.push({element:identity(at),box:box(at),style:style(at),inert:at.inert,pseudo:['::before','::after'].map(pseudo=>{const s=getComputedStyle(at,pseudo);return {pseudo,content:s.content,display:s.display,pointerEvents:s.pointerEvents,zIndex:s.zIndex,position:s.position};})});return list;};
    const r=el.getBoundingClientRect(),point={x:r.x+r.width/2,y:r.y+r.height/2},target=document.elementFromPoint(point.x,point.y);
    return {at:performance.now(),hit:el.contains(target),point,toggle:identity(el),box:box(el),style:style(el),hitElement:identity(target),toggleAncestors:ancestors(el),hitAncestors:ancestors(target),surfaces:[...document.querySelectorAll('.pI_x6G_frame,.pI_x6G_rightbarCol,.wSkVaW_headerCorner,[data-sidebar-right-panel]')].map(node=>({element:identity(node),box:box(node),style:style(node)})),animations:document.getAnimations().filter(a=>a.playState==='running'||a.playState==='pending').map(a=>({target:identity(a.effect?.target),playState:a.playState,currentTime:a.currentTime,animationName:a.animationName,transitionProperty:a.transitionProperty,timing:a.effect?.getComputedTiming(),keyframes:a.effect?.getKeyframes().map(k=>({offset:k.offset,easing:k.easing,opacity:k.opacity,transform:k.transform,visibility:k.visibility,pointerEvents:k.pointerEvents}))}))};
  });
  const observeRecovery = locator => locator.evaluate(async el => {
    const began=performance.now(),samples=[];let firstHit=null;
    do {
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const r=el.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),hit=el.contains(target),elapsed=performance.now()-began;
      samples.push({elapsed,hit,target:target?{tag:target.tagName,id:target.id,className:target.getAttribute('class')}:null});
      if(hit){firstHit=elapsed;break;}
    }while(performance.now()-began<2000);
    return {firstHitMs:firstHit,observedMs:performance.now()-began,samples};
  });
  console.log('PROBE_METADATA',JSON.stringify({source:'git show 6b12b9d:test/codex-wallpaper-controls-ui.test.mjs',fixture:'real installedPackage=true',hostCli:process.env.OMD_DSH_CLI,viewport:page.viewportSize(),iterations:20,mode:'diagnostic; immediate failures are recorded, never converted to a test pass'}));
  await toggle.click();
  await until(async () => await toggle.getAttribute('aria-expanded') === 'false');
  const observations=[];
  for(let iteration=1;iteration<=20;iteration++){
    await page.getByRole('button', { name: '打开工作台', exact: true }).click();
    await until(async () => await toggle.getAttribute('aria-expanded') === 'true');
    const immediate=await inspect(toggle);
    const recovery=immediate.hit?null:await observeRecovery(toggle);
    const beforeClick=await inspect(toggle),clickStarted=performance.now();
    await toggle.click();
    const clickMs=performance.now()-clickStarted;
    await until(async () => await toggle.getAttribute('aria-expanded') === 'false');
    const row={iteration,immediateHit:immediate.hit,recovery,clickMs,beforeClickHit:beforeClick.hit};
    observations.push(row);
    console.log('PROBE_OBSERVATION',JSON.stringify({...row,...!immediate.hit?{immediate,beforeClick}:iteration===1?{baseline:immediate}:{}}));
  }
  console.log('PROBE_SUMMARY',JSON.stringify({iterations:observations.length,immediateFalse:observations.filter(row=>!row.immediateHit).length,observations,errors:f.errors}));
  assert.deepEqual(f.errors, []);
  assert.equal(observations.filter(row=>!row.immediateHit).length,0,'Record all observations then report any failed immediate hit');
});
