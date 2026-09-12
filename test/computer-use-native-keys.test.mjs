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
test('Windows chords use Win independently of Ctrl and preserve Mac mappings',()=>{
  for(const name of ['win','Windows','Super_R','Meta_L','win_r'])assert.deepEqual(nativeKeyChord(name+'+e','win32'),{key:'e',modifiers:['win']});
  assert.deepEqual(nativeKeyChord('Control_L+Alt_L+Delete','win32'),{key:'delete',modifiers:['ctrl','alt']});
  assert.deepEqual(nativeKeyChord('Ctrl+Shift+greater','win32'),{key:'>',modifiers:['ctrl','shift']});
  assert.deepEqual(nativeKeyChord('at','win32'),{key:'@',modifiers:[]});
  assert.deepEqual(nativeKeyChord('+','win32'),{key:'+',modifiers:[]});
  assert.deepEqual(nativeKeyChord('F24','win32'),{key:'f24',modifiers:[]});
  assert.deepEqual(nativeKeyChord('KP_Enter','win32'),{key:'kp_enter',modifiers:[]});
  for(const name of ['cmd+a','command+c','fn+left','Win','kp_equal','F25'])assert.throws(()=>nativeKeyChord(name,'win32'));
  assert.deepEqual(nativeKeyChord('super+a','darwin'),{key:'a',modifiers:['cmd']});
  assert.throws(()=>nativeKeyChord('win+a','darwin'));
});
