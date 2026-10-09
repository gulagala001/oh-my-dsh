import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHostModule, mountHostComponent} from '../src/host-component.mjs';

test('host factories retain the active Loader dependency identity even when ordinary Node resolution is unavailable',async()=>{
 const identity=Symbol('active-host-capability'),imports=[];
 const tree={ctx:{baseUrl:'file:///stale-profile/node_modules/'},import:async name=>{imports.push(name);assert.equal(name,'@deepseek-ai/dsh-scope');return {identity};}};
 const ctx={loader:{entries:()=>[{options:{name:'@deepseek-ai/dsh-tools'},parent:{tree}}]}};
 const result=await loadHostModule(ctx,'tools',require=>({identity:require('@deepseek-ai/dsh-scope').identity,fs:require('node:fs').readFile}),['@deepseek-ai/dsh-scope','node:fs']);
 assert.equal(result.identity,identity);
 assert.equal(typeof result.fs,'function');
 assert.deepEqual(imports,['@deepseek-ai/dsh-scope']);
});

test('host migration keeps the CommonJS native addon value through dynamic-import interop', async () => {
 const native = { load() { return 'native-library'; } };
 const tree = { import: async specifier => { assert.equal(specifier, 'koffi'); return { default: native }; } };
 const ctx = { loader: { entries: () => [{ options: { name: '@deepseek-ai/dsh-session-persistence-jsonl' }, parent: { tree } }] } };
 const result = await loadHostModule(ctx, 'session-persistence-jsonl', require => {
   // The generated CommonJS factory wraps dynamic imports with a default value.
   const namespace = { default: require('koffi') };
   return namespace.default;
 }, ['koffi']);
 assert.equal(result, native);
 assert.equal(result.load(), 'native-library');
});

test('a provider with a custom row id inherits its own configuration instead of an unrelated jobs row', async () => {
 const tree = { import: async name => {
  assert.equal(name, '@deepseek-ai/cordis-plugin-loader'); return { interpolate: (_ctx, value) => value };
 } };
 const provider = { options: { id: 'custom-background-provider', name: '@deepseek-ai/dsh-jobs-local', config: { maxJobs: 3, maxOutputBytes: 1200 } }, parent: { tree } };
 const unrelated = { options: { id: 'jobs', name: 'third-party/jobs-panel', config: { maxJobs: 99 } }, parent: { tree } };
 let mounted;
 const ctx = { loader: { entries: () => [unrelated, provider] }, plugin(_component, config) { mounted = config; return Promise.resolve(); }, on() {} };
 await mountHostComponent(ctx, 'jobs-local', () => ({ apply() {} }), [], { maxOutputBytes: 2048 });
 assert.deepEqual(mounted, { maxJobs: 3, maxOutputBytes: 2048 });
});

test('native provider configuration reload reaches the retained extension without replacing unrelated overrides', async () => {
 const tree = { import: async () => ({ interpolate: (_ctx, value) => value }) };
 const provider = { options: { id: 'jobs', name: '@deepseek-ai/dsh-jobs-local', config: { maxJobs: 3 } }, parent: { tree } };
 const listeners = [], fiber = Promise.resolve(); let current;
 fiber.update = async config => { current = config; };
 const ctx = { loader: { entries: () => [provider] }, plugin(_component, config) { current = config; return fiber; },
  on(name, fn) { assert.equal(name, 'app-boot/config-reload'); listeners.push(fn); } };
 await mountHostComponent(ctx, 'jobs-local', () => ({ apply() {} }), [], { maxOutputBytes: 2048 });
 assert.deepEqual(current, { maxJobs: 3, maxOutputBytes: 2048 });
 provider.options.config = { maxJobs: 6, maxOutputBytes: 128 };
 for (const listener of listeners) await listener();
 assert.deepEqual(current, { maxJobs: 6, maxOutputBytes: 2048 });
});
