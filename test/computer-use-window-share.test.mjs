import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeHost } from '../src/computer-use/native.mjs';
import { keyboardFixture } from './fixtures/computer-use/keyboard.mjs';

const socket=process.env.TRISOUL_CU_NATIVE_SOCKET;
test('window sharing reads alongside another input owner without changing its target, AX baseline or input', { skip: !socket || process.platform!=='darwin', timeout:15000 }, async t=>{
  const fixture=await keyboardFixture(),host=new NativeHost(fixture.root,{socket});
  t.after(async()=>{await host.close();await fixture.close();});
  const target=await host.bind('model',fixture.bundle);
  await host.invoke('model',target.id,'getAXStateAndScreenshot');
  const record=host.targets.get(target.id),tokens=new Map(record.elements),observation=record.observation;
  const editor=[...observation.nodes.values()].find(node=>node.line.includes('AXTextArea 编辑区'));
  assert.ok(editor);
  const before=await fixture.command('sample');
  const windows=await host.shareWindows(),selected=windows.find(window=>window.app_id===fixture.bundle);
  assert.ok(selected,'the actual fixture window is selectable');
  const snapshot=await host.shareWindow({...selected,app_name:'spoofed',app_id:'spoofed'});
  assert.equal(Buffer.from(snapshot.screenshot,'base64').readUInt32BE(0),0x89504e47);
  assert.match(snapshot.text,/AXTextArea 编辑区/);assert.ok(snapshot.text.includes(fixture.bundle));assert.doesNotMatch(snapshot.text,/spoofed/);
  assert.equal(snapshot.mediaType,'image/png');
  assert.equal(host.targets.get(target.id),record);assert.equal(record.observation,observation);assert.deepEqual(record.elements,tokens);
  assert.equal(host.owners.get(record.key),'model');
  // Empty system titlebar groups can acquire fresh AX objects on every read,
  // even without a share. Assert the model's actual baseline/IDs above, and
  // that its original editable control remains addressable in the next read.
  assert.ok((await host.invoke('model',target.id,'getAXState')).state.includes(editor.line.trim()));
  assert.deepEqual([...host.connections.keys()],['model'],'sharing closes its read-only sessions');
  const after=await fixture.command('sample');assert.equal(after.text,before.text);assert.equal(after.frontmostPid,before.frontmostPid);assert.deepEqual(after.mouse,before.mouse);
  await assert.rejects(host.shareWindow({...selected,process_identity:'restarted'}),/restarted/);
  await assert.rejects(host.shareWindow({...selected,window_id:2147483647}),/closed|different process/);
  assert.equal(host.owners.get(record.key),'model','a refused sharing request cannot release the model lease');
});
