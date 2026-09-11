const modifiers=new Map([
  ...['cmd','command','super','meta','super_l','super_r','meta_l','meta_r'].map(key=>[key,'cmd']),
  ...['ctrl','control','control_l','control_r','ctrl_l','ctrl_r'].map(key=>[key,'ctrl']),
  ...['alt','option','alt_l','alt_r'].map(key=>[key,'alt']),
  ...['shift','shift_l','shift_r'].map(key=>[key,'shift']),
  ['fn','fn'],
]);
const aliases={return:'enter',esc:'escape',prior:'pageup',page_up:'pageup',next:'pagedown',page_down:'pagedown',back_space:'backspace',del:'delete',spacebar:'space',iso_left_tab:'tab',
  equal:'=',minus:'-',bracketleft:'[',bracketright:']',backslash:'\\',semicolon:';',apostrophe:"'",quoteright:"'",comma:',',period:'.',slash:'/',grave:'`',quoteleft:'`',
  kp_decimal:'kp_decimal',kp_delete:'kp_decimal',kp_separator:'kp_decimal',kp_plus:'kp_add',kp_minus:'kp_subtract',kp_return:'kp_enter',
};
const shifted={exclam:'1',at:'2',numbersign:'3',dollar:'4',percent:'5',asciicircum:'6',ampersand:'7',asterisk:'8',parenleft:'9',parenright:'0',underscore:'-',plus:'=',braceleft:'[',braceright:']',bar:'\\',colon:';',quotedbl:"'",less:',',greater:'.',question:'/',asciitilde:'`',
  '!':'1','@':'2','#':'3','$':'4','%':'5','^':'6','&':'7','*':'8','(':'9',')':'0','_':'-','+':'=','{':'[','}':']','|':'\\',':':';','"':"'",'<':',','>':'.','?':'/','~':'`'};
const named=new Set(['enter','tab','space','backspace','escape','home','end','pageup','pagedown','delete','left','right','up','down','help','insert','kp_decimal','kp_multiply','kp_add','kp_clear','kp_divide','kp_enter','kp_subtract','kp_equal',...Array.from({length:20},(_,i)=>'f'+(i+1)),...Array.from({length:10},(_,i)=>'kp_'+i)]);

export function nativeKeyChord(value){
  if(typeof value!=='string'||!value.trim())throw new Error('pressKey requires a key or a + separated chord.');
  const parts=value.trim()==='+'?['plus']:value.trim().split(/\s*\+\s*/),last=parts.pop(),flags=new Set();
  for(const part of parts){const modifier=modifiers.get(part.toLowerCase());if(!modifier)throw new Error('Unknown keyboard modifier: '+part);flags.add(modifier);}
  if(!last||modifiers.has(last.toLowerCase()))throw new Error('A key chord must include a non-modifier key, for example super+a.');
  let key=last.toLowerCase().replace(/^numpad_/,'kp_');
  if(/^[A-Z]$/.test(last)||key==='iso_left_tab')flags.add('shift');
  if(Object.hasOwn(shifted,key)){flags.add('shift');key=shifted[key];}else key=aliases[key]??key;
  if(!named.has(key)&&!/^[a-z0-9=\-\[\]\\;',./`]$/.test(key))throw new Error('Unsupported key: '+last);
  return {key,modifiers:[...flags]};
}

export function nativeClickOptions(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('Click options must be an object.');
  const button=({l:'left',r:'right',m:'middle'})[options.mouseButton]??options.mouseButton??'left',count=options.clickCount??1;
  if(!['left','middle','right'].includes(button))throw new Error('mouseButton must be left, middle, or right.');
  if(!Number.isInteger(count)||count<1||count>2147483647)throw new Error('clickCount must be a positive integer within the native range.');
  return {button,count};
}
