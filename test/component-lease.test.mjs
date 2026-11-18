import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { leaseComponent } from '../vendor/workflow/src/component-lease.mjs';

test('all embedded runtimes use the same isolate lease protocol', async () => {
  const paths = ['vendor/workflow', 'vendor/rewind', 'vendor/btw', 'vendor/response-id-reuse', 'plugins/dsh-extensions', 'plugins/deepseek-workbench'];
  const modules = await Promise.all(paths.map(path => readFile(new URL('../' + path + '/src/component-lease.mjs',import.meta.url),'utf8')));
  assert.equal(new Set(modules).size,1);
});

test('failed startup and release keep the original fiber until cleanup succeeds', async () => {
  const key=Symbol(), scope=Symbol(), owners=[];
  const ready=Promise.withResolvers();let created=0, disposeCalls=0, failCleanup=true;
  const host={plugin(){const n=++created;const fiber=n===1?ready.promise:Promise.resolve();
    fiber.dispose=async()=>{disposeCalls++;if(failCleanup)throw Error('release');};return fiber;}};
  const root={extend:()=>host};
  function acquire(component={}){const ctx={root,[Context.isolate]:{},fiber:{},effect(fn){owners.push(fn());}};
    return {ctx,load:()=>leaseComponent(ctx,key,scope,component)};}
  const first=acquire(),loading=first.load();ready.reject(Error('start'));
  await assert.rejects(loading,e=>e.errors.map(x=>x.message).join('/')==='start/release');
  await assert.rejects(first.load(),/release/);assert.equal(created,1);
  failCleanup=false;await first.load();assert.equal(created,2);assert.equal(owners.length,1);
  const second=acquire();await second.load();await owners[0]();assert.equal(root[key].size,1);
  await owners[1]();assert.equal(root[key].size,0);assert.equal(disposeCalls,4);
});

test('a new owner during last release waits, and an older revision cannot replace the new one', async () => {
  const gate=Promise.withResolvers(),entered=Promise.withResolvers(), seen=[], releases=[];
  const key=Symbol(), scope=Symbol(), root={extend:()=>({plugin(c){seen.push(c.runtimeRevision);const fiber=Promise.resolve();
    fiber.dispose=async()=>{entered.resolve();await gate.promise;};return fiber;}})};
  const acquire=revision=>leaseComponent({root,[Context.isolate]:{},fiber:{},effect(fn){releases.push(fn());}},key,scope,{runtimeRevision:revision});
  await acquire(3);const leaving=releases[0]();await entered.promise;
  const joining=acquire(4);await Promise.resolve();assert.deepEqual(seen,[3]);gate.resolve();await Promise.all([joining,leaving]);
  await acquire(2);assert.deepEqual(seen,[3,4]);
  for(const release of releases.slice(1))await release();assert.equal(root[key].size,0);
});
