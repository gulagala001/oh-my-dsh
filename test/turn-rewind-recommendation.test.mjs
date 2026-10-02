import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendedPlugins } from '../src/recommended-plugin-catalog.mjs';
import { RecommendedPluginManager, pluginInstallSpec } from '../src/recommended-plugins.mjs';

test('rewind is pinned and listing never installs it; user action installs enabled via native manager',async()=>{
  const plugin=recommendedPlugins.find(p=>p.id==='dsh-turn-rewind'),calls=[];
  assert.equal(plugin.packageName,'@anionex/dsh-turn-rewind');assert.equal(plugin.review.version,'0.3.9');
  assert.equal(pluginInstallSpec(plugin,'0.3.9'),'https://codeload.github.com/Anionex/dsh-turn-rewind/tar.gz/9610ab93c87e2405e7512d53a099b8fb2caf6936');
  assert.throws(()=>pluginInstallSpec(plugin,'0.4.0'),/固定/);
  const manager={listBundles:async()=>[],installBundle:async(spec,options)=>{calls.push({spec,options});return {application:'applied'};}};
  const service=new RecommendedPluginManager({manager,catalog:[plugin],getConfig:()=>({}),saveConfig:async()=>{},preparePackage:async(url,sha)=>{assert.equal(sha,plugin.review.sha256);return 'file:/isolated/checked.tgz';}});
  assert.equal((await service.status()).plugins[0].installed,false);await service.tick();assert.equal(calls.length,0);
  await service.start(plugin.id,'install');assert.equal(calls.length,1);assert.equal(calls[0].spec,'@anionex/dsh-turn-rewind@file:/isolated/checked.tgz');assert.equal(calls[0].options.enabled,true);
  service.close();
});
