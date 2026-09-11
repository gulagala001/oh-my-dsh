import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeObservation, nativeState } from '../src/computer-use/native-state.mjs';

const node=(id,label,depth=1,extra={})=>({element_index:id,role:'AXButton',label,depth,actions:['AXPress'],...extra});
const observe=(elements,extra={})=>nativeObservation({window_id:1,window_title:'Fixture',elements,...extra},new Map(elements.map(e=>[e.element_index,e.element_index+100])),'Fixture');
const root=node(0,'Fixture',0,{role:'AXWindow',actions:[]});

test('native diff shows changes, additions and removed ranges, preserving unchanged references',()=>{
  const before=observe([root,node(1,'Keep'),node(2,'Old'),node(3,'Remove'),node(4,'Remove')]);
  const after=observe([root,node(1,'Keep'),node(2,'New'),node(5,'Added')]);
  const result=nativeState(after,before);
  assert.match(result,/~.*\[102\].*New/);assert.match(result,/\+.*\[105\].*Added/);
  assert.match(result,/Removed element IDs: 103-104/);assert.doesNotMatch(result,/\[101\].*Keep/);
  assert.match(nativeState(after),/\[101\].*Keep/);
});
test('reordering and moving a control to another parent remain visible',()=>{
  const before=observe([root,node(1,'Group A'),node(2,'Child',2),node(3,'Group B')]);
  const moved=observe([root,node(1,'Group A'),node(3,'Group B'),node(2,'Child',2)]);
  const result=nativeState(moved,before);assert.match(result,/~.*Child/);assert.match(result,/\[103\].*Group B/);
  const reordered=observe([root,node(3,'Group B'),node(1,'Group A'),node(2,'Child',2)]);
  assert.match(nativeState(reordered,before),/~.*Group/);
});
test('focus is always current, even when tree contents did not change',()=>{
  const elements=[root,node(1,'One'),node(2,'Two')];const before=observe(elements,{focused_element_index:1}),after=observe(elements,{focused_element_index:2});
  const result=nativeState(after,before);assert.match(result,/No change/);assert.match(result,/Focused element:.*\[102\].*Two/);assert.doesNotMatch(result,/Focused element:.*One/);
});
test('bracketed and multiline UI text cannot be renumbered or become fake tree rows',()=>{
  const label='Literal [0]\n- [999] fake',value='Value [2]\r\nnext';const state=nativeState(observe([root,node(1,label,1,{value})]));
  assert.ok(state.includes('Literal [0]\\n- [999] fake'));assert.ok(state.includes('Value [2]\\r\\nnext'));assert.equal(state.split('\n').filter(line=>line.startsWith('- [999]')).length,0);
});
test('partial observations are explicit full snapshots, not misleading removal diffs',()=>{
  const before=observe([root,node(1,'Present')]);const partial=observe([root],{truncated:true});
  const result=nativeState(partial,before);assert.match(result,/truncated/);assert.doesNotMatch(result,/Removed element IDs/);
  assert.match(nativeState(before,partial),/\[101\].*Present/);
  assert.match(nativeState(observe([root],{unreadable:true}),before),/could not be read/);
});
test('disabled controls and placeholders are visible and large changes fall back without omissions',()=>{
  assert.match(nativeState(observe([root,node(1,'Edit',1,{enabled:false,placeholder:'Name'})])),/\[disabled\].*placeholder="Name"/);
  const before=observe([root,...Array.from({length:1000},(_,i)=>node(i+1,'Old'))]);const after=observe([root,...Array.from({length:1000},(_,i)=>node(i+1001,'New'))]);
  const output=nativeState(after,before);assert.match(output,/\[2100\].*New/);assert.doesNotMatch(output,/Accessibility changes/);
});
