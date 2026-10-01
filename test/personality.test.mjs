import test from 'node:test';
import assert from 'node:assert/strict';
import { contextConfig } from '../src/config.mjs';
import { DEFAULT_IDENTITY } from '../src/cc-adaptation/identity.mjs';
import { PERSONALITY_PRESETS, personalityText, personalityPatch, customPersonality, normalizePersonalityPatch } from '../src/cc-adaptation/personality.mjs';
import { installPromptAdapter } from '../src/cc-adaptation/adapter.mjs';
import { createContextUI } from '../src/client/context-client.mjs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('legacy identities including blank migrate without changing their text or forcing a preset', () => {
  for (const text of [DEFAULT_IDENTITY, 'Existing custom\n原有身份', '', PERSONALITY_PRESETS.hardcore.text]) {
    const config = contextConfig({ identityPrompt: text });
    assert.equal(config.identityPreset, 'custom');
    assert.equal(personalityText(config), text);
    assert.equal(customPersonality(config), text);
  }
});
test('custom draft survives builtins, off, JSON save/reload and switching back', () => {
  let config = contextConfig({ identityPrompt: 'My custom\n原文' });
  for (const preset of ['hardcore', 'softie', 'default', 'off', 'custom']) {
    config = contextConfig(JSON.parse(JSON.stringify({ ...config, ...personalityPatch(config, preset) })));
    assert.equal(config.identityCustomPrompt, 'My custom\n原文');
    assert.equal(personalityText(config), preset === 'custom' ? 'My custom\n原文' : preset === 'off' ? '' : PERSONALITY_PRESETS[preset].text);
  }
});
test('legacy API edits select custom and empty text stays empty after further switches', () => {
  let config = { ...contextConfig(), ...personalityPatch(contextConfig(), 'softie') };
  for (const text of ['New custom', '']) {
    config = { ...config, ...normalizePersonalityPatch(config, { identityPrompt: text }) };
    assert.equal(config.identityPreset, 'custom'); assert.equal(customPersonality(config), text);
    config = { ...config, ...personalityPatch(config, 'hardcore') };
    config = { ...config, ...personalityPatch(config, 'custom') };
    assert.equal(personalityText(config), text);
  }
  assert.throws(() => personalityPatch(config, 'unknown'), /未知/);
  assert.throws(() => contextConfig({identityPreset:'unknown'}));
});
test('softie has a distinct character and concrete reliability and brevity rules', () => {
  const text = PERSONALITY_PRESETS.softie.text;
  assert.match(text, /小毛毯/); assert.match(text, /小爪子开工啦/);
  assert.match(text, /不要每段都加口头禅/); assert.match(text, /把已授权的工作做到完成并检查结果/);
});
test('live prompt adapter uses current preset once, off keeps working rules, and bypasses subagents', async () => {
  let hook, config = contextConfig({identityPrompt:'CUSTOM_MARKER'});
  const ctx={on:(_name,fn)=>hook=fn, tools:{schemas:()=>[],get:()=>null}, trisoulX:{config:()=>config}};
  installPromptAdapter(ctx);
  const assembly={sections:[{name:'harness:identity',text:'Native identity'}, {name:'trisoul-x:persona',text:'old'}], tools:[], contexts:[], variables:{}};
  for (const preset of ['hardcore','softie','hardcore','off','custom']) {
    config={...config,...personalityPatch(config,preset)};
    const result=await hook(null,{agent:{session:{header:{origin:'user'}}}},async()=>structuredClone(assembly));
    const sections=result.sections.filter(x=>x.name==='trisoul-x:persona');
    assert.equal(sections.length,1); assert.equal(result.sections.some(x=>x.name==='harness:identity'),false);
    const text=personalityText(config);
    if(text) {assert.ok(sections[0].text.startsWith(text)); assert.equal(sections[0].text.split(text).length-1,1);}
    else {assert.doesNotMatch(sections[0].text,/HARDCORE|SOFTIE|CUSTOM_MARKER/);assert.match(sections[0].text,/software engineering|tools/);}
  }
  const sub=await hook(null,{agent:{session:{header:{origin:'subagent'}}}},async()=>assembly);
  assert.equal(sub,assembly);
});
test('settings editor previews builtins read-only and supports copy, cancel and retained custom', () => {
  const {ContextSettings}=createContextUI(React), panel=new ContextSettings({});
  panel.setState = update => Object.assign(panel.state, typeof update==='function'?update(panel.state):update);
  panel.saved=contextConfig({identityPrompt:'ORIGINAL'}); panel.state.config={...panel.saved};
  panel.choosePersonality('softie');
  assert.match(renderToStaticMarkup(panel.renderModels()), /readonly/);
  assert.match(renderToStaticMarkup(panel.renderModels()), /复制到自定义/);
  panel.choosePersonality('custom'); assert.equal(panel.state.config.identityPrompt,'ORIGINAL');
  panel.editPersonality('NEW'); panel.choosePersonality('off'); panel.choosePersonality('custom');
  assert.equal(panel.state.config.identityPrompt,'NEW');
  panel.undo(); assert.equal(panel.state.config.identityPrompt,'ORIGINAL');
});
