// Exercise the bundled consumer; detailed lifecycle regressions live in OpenCU.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBrowserHost} from '../vendor/opencu/src/dsh/browser-host.mjs';

test('bundled sidebar keeps unresolved input and fences replacement connections', async t => {
  const host = createBrowserHost(), rendererId = randomUUID();
  t.after(() => host.close());
  const target = {id:'dsh:bundled-fixture',identity:{rendererId,guestId:'bundled-guest'}};
  const first = await host.handle('browser/connect',{rendererId});
  await host.handle('browser/publish',{...first,targets:[target]});
  const action = host.backend.act(target,{action:'keyDown',key:'Shift'});
  const [command] = (await host.handle('browser/poll',first)).commands;
  await host.handle('browser/result',{...first,id:command.id,result:{accepted:true}});
  await action;
  await host.handle('browser/disconnect',first);
  assert.equal((await host.backend.release()).released,false,'offline is not a release acknowledgement');

  const current = await host.handle('browser/connect',{rendererId});
  await host.handle('browser/publish',{...current,targets:[target]});
  await assert.rejects(host.handle('browser/publish',{...first,targets:[]}),{code:'BROWSER_HOST_DISCONNECTED'});
  await assert.rejects(host.backend.act(target,{action:'type',text:'must not dispatch'}),{code:'RECOVERY_REQUIRED'});
  const release = host.backend.release();
  const [releasing] = (await host.handle('browser/poll',current)).commands;
  assert.equal(releasing.method,'release');
  await host.handle('browser/result',{...current,id:releasing.id,result:{released:true}});
  assert.equal((await release).released,true);
  await host.handle('browser/disconnect',{...first,released:true});
  assert.equal((await host.backend.listTargets()).length,1,'an old receipt cannot disconnect the replacement');
});
