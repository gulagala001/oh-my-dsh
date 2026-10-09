import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontendFixture, until } from './fixtures/frontend.mjs';

const require = createRequire(import.meta.url);
test('scheme synchronization rebroadcasts only a changed marker and stops on the nested event', async () => {
  const source = await readFile(new URL('../src/client/skins/runtime.mjs', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('  const syncMode = snapshot => {'), source.indexOf('  const background = createBackgroundRuntime'));
  const state = { active: true, selected: 'codex-desktop', palette: 'theme', advanced: { enabled: false } };
  const doc = { documentElement: { dataset: { appearance: 'light' } } };
  let broadcasts = 0, views = 0, syncMode;
  const ctx = { emit(name, snapshot) { assert.equal(name, 'theme/change'); assert.ok(++broadcasts <= 2, 'a nested event must stop'); syncMode(snapshot); } };
  syncMode = new Function('state', 'document', 'ctx', 'emit', handler + '; return syncMode;')(state, doc, ctx, () => views++);
  const dark = { active: { colorScheme: 'dark' } }, light = { active: { colorScheme: 'light' } };
  syncMode(dark);
  assert.equal(doc.documentElement.dataset.appearance, 'dark');
  assert.equal(broadcasts, 1); assert.equal(views, 2);
  syncMode(dark); assert.equal(broadcasts, 1);
  syncMode(light); assert.equal(broadcasts, 2);
  state.active = false; syncMode(dark);
  assert.equal(broadcasts, 2); assert.equal(doc.documentElement.dataset.appearance, 'light');
});

async function sourceModule(file, stream) {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../src/client/' + file, import.meta.url))], bundle: true,
    platform: 'node', format: 'cjs', write: false, external: ['react', 'react-dom'],
    plugins: [{ name: 'test-source', setup(b) {
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default ""', loader: 'js' }));
      b.onResolve({ filter: /^@deepseek-ai\/dsh-api-session-controller\/client$/ }, () => ({ path: 'stream', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const SessionEventStream = __fixtureStream;', loader: 'js' }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__fixtureStream', result.outputFiles[0].text)(require, module, module.exports, stream);
  return module.exports;
}

test('history wrapper becomes transparent inside a later wrapper on unload and re-enable', async t => {
  class Stream { open(request) { return request; } prepend(request) { return request; } }
  const { applyHistorySize } = await sourceModule('history-settings.jsx', Stream);
  const previousStorage = globalThis.localStorage;
  let reads = 0;
  globalThis.localStorage = { getItem: () => { reads++; return '200'; } };
  t.after(() => { if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage; });
  const stream = new Stream(), cleanups = [];
  const ctx = { effect: fn => { const dispose = fn(); cleanups.push(dispose); return dispose; } };
  applyHistorySize(ctx);
  const wrapped = { open: Stream.prototype.open, prepend: Stream.prototype.prepend };
  for (const name of ['open', 'prepend']) Stream.prototype[name] = function (request) { return { ...wrapped[name].call(this, request), thirdParty: true }; };
  assert.equal(stream.open({ maxMessages: 50 }).maxMessages, 200);
  assert.equal(stream.prepend({ maxMessages: 500, turnWindow: { minMessages: 50, minTurns: 2 } }).maxMessages, 200);
  const jump = { maxMessages: 500, turnWindow: { minMessages: 200, minTurns: 2 } };
  assert.deepEqual(stream.prepend(jump), { ...jump, thirdParty: true });
  cleanups.pop()();
  const priorReads = reads;
  assert.deepEqual(stream.open({ maxMessages: 50 }), { maxMessages: 50, thirdParty: true });
  assert.deepEqual(stream.prepend({ maxMessages: 50 }), { maxMessages: 50, thirdParty: true });
  assert.equal(reads, priorReads, 'an unloaded adapter does not even read OMD preferences');
  applyHistorySize(ctx);
  assert.deepEqual(stream.open({ maxMessages: 50 }), { maxMessages: 200, thirdParty: true });
  cleanups.pop()();
  assert.equal(stream.open({ maxMessages: 50 }).maxMessages, 50);
});

function slotFixture() {
  const entries = new Map(), subscribers = new Map(), cleanups = [];
  const emit = name => { for (const fn of [...subscribers.get(name) ?? []]) fn(); };
  const slots = {
    entries: name => [...entries.get(name) ?? []].sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0)),
    subscribe(name, fn) { if (!subscribers.has(name)) subscribers.set(name, new Set()); subscribers.get(name).add(fn); return () => subscribers.get(name).delete(fn); },
    register({ name, ...options }, component) {
      if (!entries.has(name)) entries.set(name, []);
      if (name === 'conversation.input.model' && entries.get(name).some(entry => (entry.options.priority ?? 0) === (options.priority ?? 0))) throw Error('duplicate single-slot priority');
      const entry = { options, component, ...Object.fromEntries(['locale', 'store', 'inject', 'children'].filter(key => key in options).map(key => [key, options[key]])) };
      entries.get(name).push(entry); emit(name);
      return () => { const rows = entries.get(name), i = rows.indexOf(entry); if (i >= 0) rows.splice(i, 1); emit(name); };
    },
    inject(_name, fn) { cleanups.push(fn()); },
  };
  return { slots, cleanups };
}

test('model seat preserves a foreign winner and its contract in either registration order', async () => {
  const { applyModelPanel } = await sourceModule('model-panel.jsx');
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ dataset: {}, remove() {} }), head: { append() {} } };
  try {
    for (const foreignFirst of [false, true]) {
      const { slots, cleanups } = slotFixture();
      function ModelSelect() {} function ForeignModel() {}
      const native = { name: 'conversation.input.model', locale: 'model', inject: () => ({ directory: 'native' }) };
      const foreign = { name: 'conversation.input.model', priority: -1, locale: 'foreign', inject: () => ({ contract: 'foreign' }),
        store: { create() {} }, children: { 'fixture.model.details': { kind: 'single', scope: 'session' } } };
      slots.register(native, ModelSelect);
      let removeForeign = foreignFirst ? slots.register(foreign, ForeignModel) : null;
      const ctx = { slots, effect: fn => cleanups.push(fn()), get: () => undefined };
      applyModelPanel(ctx);
      if (!foreignFirst) {
        assert.equal(slots.entries('conversation.input.model')[0].component.name, 'Panel');
        removeForeign = slots.register(foreign, ForeignModel);
      }
      const winner = slots.entries('conversation.input.model')[0];
      assert.equal(winner.component, ForeignModel);
      for (const key of ['inject', 'store', 'children', 'locale']) assert.equal(winner[key], foreign[key]);
      assert.ok(slots.entries('conversation.input.right').some(entry => entry.options.id === 'omd-model-mode'));
      removeForeign();
      assert.equal(slots.entries('conversation.input.model')[0].component.name, 'Panel');
      for (const cleanup of cleanups.reverse()) cleanup?.();
      assert.equal(slots.entries('conversation.input.model')[0].component, ModelSelect);
    }
  } finally { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; }
});

async function coexistPlugin(t) {
  const root = await mkdtemp(join(tmpdir(), 'omd-frontend-plugin-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'omd-frontend-coexist-fixture', version: '1.0.0', type: 'module',
    exports: { '.': './index.mjs', './client': './client.js' },
    dsh: { bundle: { patch: ['./cordis.patch.yml'] }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-theme', '@deepseek-ai/dsh-client-ui-model-selection'] } },
  }));
  await writeFile(join(root, 'cordis.patch.yml'), '- insert:\n    - id: omd-frontend-coexist-fixture\n      name: omd-frontend-coexist-fixture\n');
  await writeFile(join(root, 'index.mjs'), 'export function apply() {}\n');
  await writeFile(join(root, 'client.js'), `window.__ModuleLoader__.load({id:'omd-frontend-coexist-fixture',factory:require=>{
    const React=require('react');
    return { inject:['slots','theme','sessions','modelDirectories'], apply(ctx){
      let model, theme;
      function ForeignModel(props){return React.createElement('span',null,
        React.createElement('button',{type:'button',onClick:()=>{window.__omdCoexist.clicks++;void props.choose();}},'第三方模型 '+props.contract),
        props.renderSlot('fixture.model.detail',{}));}
      const controls=window.__omdCoexist={clicks:0,themeEvents:0,
        model(enabled){ localStorage.setItem('fixture.foreignModel',enabled?'1':'0');model?.(); model=undefined; if(enabled){
          const a=ctx.slots.register({name:'conversation.input.model',priority:-1,locale:'model',
            inject:sessionId=>({contract:'原契约',choose:()=>ctx.modelDirectories.directoryFor(sessionId).select({provider:'fixture',model:'foreign-model',reasoningEffort:'high'})}),children:{'fixture.model.detail':{kind:'single',scope:'session'}}},ForeignModel);
          const b=ctx.slots.register({name:'fixture.model.detail'},()=>React.createElement('span',null,'第三方子槽'));
          model=()=>{b();a();};
        }},
        theme(enabled){theme?.();theme=enabled?ctx.theme.overrideTokens('fixture/theme',{'--dsw-alias-bg-base':{light:'#123456',dark:'#234567'}}):undefined;},
        repeatTheme(){const before=controls.themeEvents;ctx.emit('theme/change',ctx.theme.getTheme());return controls.themeEvents-before;},
      };
      ctx.on('theme/change',()=>{if(++controls.themeEvents>100)throw Error('Theme event loop');});
      ctx.slots.inject('conversation.input.right',()=>ctx.slots.register({name:'conversation.input.right',id:'foreign-toolbar',order:121},()=>React.createElement('button',{type:'button',onClick:()=>{controls.clicks++;}},'第三方工具栏')));
      ctx.slots.inject('conversation.input.model',()=>{if(localStorage.getItem('fixture.foreignModel')==='1')controls.model(true);return()=>{model?.();model=undefined;};});
      ctx.effect(()=>()=>{model?.();theme?.();delete window.__omdCoexist;});
    }};
  }});`);
  return 'file:' + root;
}

test('real Web preserves foreign model children and toolbar, retains OMD modes, and keeps theme layer order', { timeout: 150000 }, async t => {
  const plugin = await coexistPlugin(t);
  const { page, errors, sessionId } = await frontendFixture(t, { installedPackage: true, plugins: [plugin],
    modelProfile: { reasoningEfforts: { low: 'low', high: 'high', xhigh: 'xhigh' }, compat: { supportsReasoningEffort: true } },
    additionalModels: [{ id: 'foreign-model', name: '第三方选择的模型', reasoningEfforts: { low: 'low', high: 'high' }, compat: { supportsReasoningEffort: true } }],
  });
  const native = page.getByRole('button', { name: '模型与思考强度', exact: true });
  await native.waitFor();
  assert.equal(await page.getByRole('button', { name: 'OMD 模式与思考强度', exact: true }).count(), 0);
  await page.evaluate(() => window.__omdCoexist.model(true));
  const mode = async () => (await page.request.get(new URL('trisoul-x/api/model-mode?session=' + sessionId, page.url()).href)).json();
  await page.getByRole('button', { name: '第三方模型 原契约', exact: true }).click();
  await until(async () => (await mode()).selected.model === 'foreign-model');
  await page.getByText('第三方子槽', { exact: true }).waitFor();
  await page.getByRole('button', { name: '第三方工具栏', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__omdCoexist.clicks), 2);
  assert.equal(await native.count(), 0);
  await page.getByRole('button', { name: 'OMD 模式与思考强度', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '模型与思考强度', exact: true });
  const slider = panel.getByRole('slider', { name: '思考强度', exact: true });
  await panel.getByRole('button', { name: '第三方选择的模型', exact: true }).waitFor();
  await until(() => slider.isEnabled());
  await slider.press('End');
  await until(async () => (await mode()).mode === 'ultracode');
  await slider.press('ArrowLeft');
  await until(async () => (await mode()).mode === 'pro');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__omdCoexist.model(false));
  await native.waitFor();
  assert.equal(await page.getByRole('button', { name: 'OMD 模式与思考强度', exact: true }).count(), 0);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('codex-desktop');
  await page.getByLabel('主题', { exact: true }).selectOption('ios-liquid-glass');
  const colors = await page.evaluate(() => ({ body: getComputedStyle(document.body).backgroundColor,
    meta: document.querySelector('meta[name="theme-color"]')?.content }));
  assert.equal(colors.meta, colors.body, 'the native browser metadata follows the changed CSS variable palette');
  await page.evaluate(() => window.__omdCoexist.theme(true));
  const background = () => page.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--dsw-alias-bg-base').trim());
  assert.equal(await background(), '#123456');
  await page.getByLabel('主题', { exact: true }).selectOption('codex-desktop');
  assert.equal(await background(), '#123456', 'a skin update keeps the later native token override above OMD');
  await page.getByLabel('配色', { exact: true }).selectOption('ios-liquid-glass');
  assert.equal(await background(), '#123456', 'a palette update does not register OMD again');
  await page.evaluate(() => window.__omdCoexist.theme(false));
  assert.notEqual(await background(), '#123456');
  assert.match(await background(), /^(#|rgb|color)/);
  await page.getByLabel('明暗模式', { exact: true }).selectOption('dark');
  await until(async () => await page.locator('html').getAttribute('data-appearance') === 'dark');
  const darkColors = await page.evaluate(() => ({ body: getComputedStyle(document.body).backgroundColor,
    meta: document.querySelector('meta[name="theme-color"]')?.content }));
  assert.equal(darkColors.meta, darkColors.body, 'the native metadata also follows a scheme change');
  assert.equal(await page.evaluate(() => window.__omdCoexist.repeatTheme()), 1, 'a same-scheme event does not trigger another rebroadcast');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '第三方工具栏', exact: true }).click();
  await page.evaluate(() => window.__omdCoexist.model(true));
  const setOmd = async enabled => {
    const method = 'pluginManager/setBundleEnabled';
    const response = await page.request.post(new URL('/api/' + method, page.url()).href, { data: { type: 'client-request', rpcId: crypto.randomUUID(), method,
      payload: { args: { name: 'trisoul_x', enabled } } } });
    const value = await response.json(); assert.equal(value.result?.ok, true, JSON.stringify(value));
  };
  await Promise.all([page.waitForEvent('load'), setOmd(false)]);
  await page.getByRole('button', { name: '第三方模型 原契约', exact: true }).waitFor();
  await page.getByText('第三方子槽', { exact: true }).waitFor();
  await page.getByRole('button', { name: '第三方工具栏', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'OMD 模式与思考强度', exact: true }).count(), 0);
  await Promise.all([page.waitForEvent('load'), setOmd(true)]);
  await page.getByRole('button', { name: '第三方模型 原契约', exact: true }).waitFor();
  await page.getByRole('button', { name: 'OMD 模式与思考强度', exact: true }).click();
  await until(() => slider.isEnabled());
  await slider.press('End');
  await until(async () => (await mode()).mode === 'ultracode');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'OMD 模式与思考强度', exact: true }).waitFor();
  await page.getByRole('button', { name: '第三方工具栏', exact: true }).click();
  assert.deepEqual(errors, []);
});
