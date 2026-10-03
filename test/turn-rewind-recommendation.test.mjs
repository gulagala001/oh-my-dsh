import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendedPlugins } from '../src/recommended-plugin-catalog.mjs';
import { RecommendedPluginManager, pluginInstallSpec } from '../src/recommended-plugins.mjs';

test('rewind stays pinned and incompatible installation is rejected before preparing a package',async()=>{
  const plugin=recommendedPlugins.find(p=>p.id==='dsh-turn-rewind'),calls=[];
  assert.equal(plugin.packageName,'@anionex/dsh-turn-rewind');assert.equal(plugin.review.version,'0.3.9');
  assert.equal(pluginInstallSpec(plugin,'0.3.9'),'https://codeload.github.com/Anionex/dsh-turn-rewind/tar.gz/9610ab93c87e2405e7512d53a099b8fb2caf6936');
  assert.throws(()=>pluginInstallSpec(plugin,'0.4.0'),/固定/);
  const manager={listBundles:async()=>[],installBundle:async(spec,options)=>{calls.push({spec,options});return {application:'applied'};}};
  const service=new RecommendedPluginManager({manager,catalog:[plugin],getConfig:()=>({}),saveConfig:async()=>{},preparePackage:async(url,sha)=>{assert.equal(sha,plugin.review.sha256);return 'file:/isolated/checked.tgz';}});
  assert.equal((await service.status()).plugins[0].installed,false);await service.tick();assert.equal(calls.length,0);
  assert.match(plugin.unavailable,/尚不兼容 DSH 0\.2\.1-alpha\.1/);
  assert.throws(()=>service.start(plugin.id,'install'),/尚不兼容/);
  assert.throws(()=>service.start(plugin.id,'update'),/尚不兼容/);
  assert.equal(calls.length,0);
  service.close();
});
