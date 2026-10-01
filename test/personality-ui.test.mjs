import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { PERSONALITY_PRESETS } from '../src/cc-adaptation/personality.mjs';

test('personality presets save, reload, retain custom, cancel, copy, and inject once in native UI', { timeout: 90000 }, async t => {
  const calls=[];
  const f=await frontendFixture(t,{omdConfig:{identityPrompt:'LEGACY_IDENTITY_MARKER',contextEnabled:false},reply:p=>{calls.push(p);return {delta:{role:'assistant',content:'本地人格测试完成'},finish_reason:'stop'};}});
  const {page}=f;
  const open=async()=>{
    await page.getByRole('button',{name:'设置',exact:true}).click();
    const panel=page.getByRole('dialog',{name:'设置'});
    await panel.getByRole('button',{name:'Oh My DSH',exact:true}).click();
    await panel.getByRole('button',{name:'模型与身份',exact:true}).click();return panel;
  };
  let panel=await open();
  const preset=()=>panel.getByLabel('人格预设',{exact:true}), editor=()=>panel.getByLabel('身份提示词',{exact:true});
  const save=async()=>{await panel.getByRole('button',{name:'保存设置',exact:true}).click();await until(()=>panel.getByRole('button',{name:'保存设置',exact:true}).isDisabled());};
  const base=new URL(page.url()).origin;
  const settings=async()=> (await (await page.request.get(base+'/trisoul-x/api/settings')).json());
  assert.equal(await preset().inputValue(),'custom');assert.equal(await editor().inputValue(),'LEGACY_IDENTITY_MARKER');
  const custom='CUSTOM_EDIT_MARKER\n用户自己的完整人设';await editor().fill(custom);await save();
  for(const id of ['hardcore','softie','hardcore']) {
    await preset().selectOption(id);assert.equal(await editor().inputValue(),PERSONALITY_PRESETS[id].text);
    assert.equal(await editor().getAttribute('readonly'),'');await save();
    const config=await settings();assert.equal(config.identityPreset,id);assert.equal(config.identityCustomPrompt,custom);
    await page.keyboard.press('Escape');panel=await open();assert.equal(await preset().inputValue(),id);
    await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:f.sessionId,mode:'queue',content:[{type:'text',text:'检查人格 '+id}]});
    await until(async()=> (await (await page.request.get(base+'/trisoul-x/api/state?session='+f.sessionId)).json()).running==='idle');
    const text=calls.at(-1).messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
    assert.equal(text.split(PERSONALITY_PRESETS[id].text).length-1,1);
    assert.doesNotMatch(text,/CUSTOM_EDIT_MARKER/);
  }
  await preset().selectOption('custom');assert.equal(await editor().inputValue(),custom);
  await editor().fill('UNSAVED_MARKER');await preset().selectOption('off');await preset().selectOption('custom');assert.equal(await editor().inputValue(),'UNSAVED_MARKER');
  await panel.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await preset().inputValue(),'hardcore');
  await preset().selectOption('off');await save();
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:f.sessionId,mode:'queue',content:[{type:'text',text:'检查关闭人格'}]});
  await until(async()=> (await (await page.request.get(base+'/trisoul-x/api/state?session='+f.sessionId)).json()).running==='idle');
  assert.doesNotMatch(calls.at(-1).messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),/HARDCORE|SOFTIE|CUSTOM_EDIT_MARKER/);
  const disk=YAML.parse(await readFile(join(f.home,'profiles/trisoul-x/cordis.patch.yml'),'utf8'));
  assert.ok(JSON.stringify(disk).includes(custom.replace(/\n/g,'\\n')));assert.equal((await settings()).identityPreset,'off');
  await preset().selectOption('custom');assert.equal(await editor().inputValue(),custom);await save();
  await preset().selectOption('softie');await panel.getByRole('button',{name:'复制到自定义',exact:true}).click();
  assert.equal(await preset().inputValue(),'custom');assert.equal(await editor().inputValue(),PERSONALITY_PRESETS.softie.text);
  await editor().fill('SOFT_CUSTOM_MARKER');await save();
  await preset().selectOption('hardcore');await preset().selectOption('custom');assert.equal(await editor().inputValue(),'SOFT_CUSTOM_MARKER');
  for(const colorScheme of ['light','dark']) {
    await page.emulateMedia({colorScheme});await page.setViewportSize({width:1060,height:900});
    assert.equal(await panel.locator('.cx-body').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
    if(process.env.TRISOUL_UI_ARTIFACTS){await mkdir(process.env.TRISOUL_UI_ARTIFACTS,{recursive:true});await panel.screenshot({path:join(process.env.TRISOUL_UI_ARTIFACTS,`personality-${colorScheme}.png`)});}
  }
  await page.setViewportSize({width:320,height:844});assert.equal(await panel.locator('.cx-body').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  assert.deepEqual(f.errors,[]);
});
