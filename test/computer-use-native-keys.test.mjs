import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeKeyChord,nativeClickOptions} from '../src/computer-use/native-keys.mjs';

test('native chords preserve case, xdotool aliases, shifted punctuation and keypad identity',()=>{
  for(const [input,expected]of [
    [' Control_L + Shift_L + period ',{key:'.',modifiers:['ctrl','shift']}],
    ['Super_R+a',{key:'a',modifiers:['cmd']}],['A',{key:'a',modifiers:['shift']}],
    ['plus',{key:'=',modifiers:['shift']}],['+',{key:'=',modifiers:['shift']}],
    ['greater',{key:'.',modifiers:['shift']}],['KP_0',{key:'kp_0',modifiers:[]}],
    ['Numpad_Enter',{key:'kp_enter',modifiers:[]}],['ISO_Left_Tab',{key:'tab',modifiers:['shift']}],
    ['Page_Down',{key:'pagedown',modifiers:[]}],['F20',{key:'f20',modifiers:[]}],
  ])assert.deepEqual(nativeKeyChord(input),expected,input);
});
test('invalid or modifier-only native input is rejected before dispatch',()=>{
  for(const input of ['',null,123,'Shift_L','super+Shift_R','ctrl++a','unknown+a','F21','super+not_a_key'])assert.throws(()=>nativeKeyChord(input),undefined,String(input));
  assert.deepEqual(nativeClickOptions({mouseButton:'m',clickCount:5}),{button:'middle',count:5});
  for(const options of [null,'right',{mouseButton:'other'},{clickCount:0},{clickCount:-1},{clickCount:1.5},{clickCount:Infinity}])assert.throws(()=>nativeClickOptions(options));
});
