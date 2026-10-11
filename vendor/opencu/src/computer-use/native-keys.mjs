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
const windowsSymbols={exclam:'!',at:'@',numbersign:'#',dollar:'$',percent:'%',asciicircum:'^',ampersand:'&',asterisk:'*',parenleft:'(',parenright:')',underscore:'_',plus:'+',braceleft:'{',braceright:'}',bar:'|',colon:':',quotedbl:'"',less:'<',greater:'>',question:'?',asciitilde:'~'};
const named=new Set(['enter','tab','space','backspace','escape','home','end','pageup','pagedown','delete','left','right','up','down','help','insert','kp_decimal','kp_multiply','kp_add','kp_clear','kp_divide','kp_enter','kp_subtract','kp_equal',...Array.from({length:20},(_,i)=>'f'+(i+1)),...Array.from({length:10},(_,i)=>'kp_'+i)]);

function parseChord(value,platform,allowModifierOnly=false){
  if(!['darwin','win32'].includes(platform))throw new Error('Unsupported native keyboard platform: '+platform);
  const platformModifiers=platform==='win32'?new Map([...modifiers].filter(([key])=>!['cmd','command','fn'].includes(key)).map(([key,value])=>[key,value==='cmd'?'win':value]).concat([['win','win'],['windows','win'],['win_l','win'],['win_r','win']])):modifiers;
  if(typeof value!=='string'||!value.trim())throw new Error('pressKey requires a key or a + separated chord.');
  const parts=value.trim()==='+'?['plus']:value.trim().split(/\s*\+\s*/),last=parts.pop(),flags=new Set();
  for(const part of parts){const modifier=platformModifiers.get(part.toLowerCase());if(!modifier)throw new Error('Unknown keyboard modifier: '+part);flags.add(modifier);}
  if(!last)throw new Error('A key chord must include a non-modifier key, for example super+a.');
  if(platformModifiers.has(last.toLowerCase())){
    if(!allowModifierOnly)throw new Error('A key chord must include a non-modifier key, for example super+a.');
    flags.add(platformModifiers.get(last.toLowerCase()));
    return {key:last.toLowerCase(),modifiers:[...flags]};
  }
  let key=last.toLowerCase().replace(/^numpad_/,'kp_');
  if(/^[A-Z]$/.test(last)||key==='iso_left_tab')flags.add('shift');
  if(platform==='win32')key=windowsSymbols[key]??aliases[key]??key;
  else if(Object.hasOwn(shifted,key)){flags.add('shift');key=shifted[key];}else key=aliases[key]??key;
  if(!named.has(key)&&!(platform==='darwin'&&['caps_lock','shift_lock'].includes(key))&&!(platform==='win32'&&(/^f2[1-4]$/.test(key)||/^[!@#$%^&*()_+{}|:"<>?~]$/.test(key)))&&!/^[a-z0-9=\-\[\]\\;',./`]$/.test(key))throw new Error('Unsupported key: '+last);
  if(platform==='win32'&&['fn','kp_equal'].includes(key))throw new Error('Unsupported Windows key: '+last);
  return {key,modifiers:[...flags]};
}

function objectOptions(options,name){
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error(name+' options must be an object.');
}

function holdDuration(options,platform){
  if(options.durationMs===undefined)return {};
  const milliseconds=options.durationMs;
  if(!Number.isSafeInteger(milliseconds)||milliseconds<0||milliseconds>30000)throw new Error('durationMs must be an integer from 0 to 30000 milliseconds.');
  if(platform==='win32')throw new Error('Held input duration is not available in the Windows native runtime.');
  return {duration_ms:milliseconds};
}

export function nativeKeyChord(value,platform='darwin',options={}){
  objectOptions(options,'Keyboard');
  if(platform!=='darwin'||typeof value!=='string'||!value.trim())return {...parseChord(value,platform),...holdDuration(options,platform)};
  const chords=value.trim().replace(/\s*\+\s*/g,'+').split(/ +/).map(chord=>parseChord(chord,platform));
  return {...(chords.length===1?chords[0]:{chords}),...holdDuration(options,platform)};
}

export function nativeClickOptions(options={},platform='darwin'){
  if(!['darwin','win32'].includes(platform))throw new Error('Unsupported native keyboard platform: '+platform);
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('Click options must be an object.');
  const rawButton=options.mouseButton??'left';
  if(typeof rawButton!=='string'&&typeof rawButton!=='number')throw new Error('mouseButton must be left, middle, right, or 0, 1, 2.');
  const normalized=typeof rawButton==='string'?rawButton.trim().toLowerCase():rawButton;
  const button=typeof normalized==='number'?({0:'left',1:'right',2:'middle'})[normalized]:({l:'left',r:'right',m:'middle'})[normalized]??normalized,count=options.clickCount??1;
  if(!['left','middle','right'].includes(button))throw new Error('mouseButton must be left, middle, or right.');
  if(!Number.isInteger(count)||count<1||count>2147483647)throw new Error('clickCount must be a positive integer within the native range.');
  const duration=holdDuration(options,platform),hold={};
  if(options.key!==undefined){
    if(platform==='win32')throw new Error('Holding a key during a click is not available in the Windows native runtime.');
    const chord=parseChord(options.key,platform,true);
    if(chord.key)hold.hold_key=chord.key;
    hold.hold_modifiers=chord.modifiers;
  }
  return {button,count,...hold,...duration};
}

export function nativeScrollOptions(direction,pages=1){
  if(typeof direction!=='string')throw new Error('direction must be up, down, left, or right.');
  const normalized=direction.trim().toLowerCase();
  const value=({u:'up',d:'down',l:'left',r:'right'})[normalized]??normalized;
  if(!['up','down','left','right'].includes(value))throw new Error('direction must be up, down, left, or right.');
  if(typeof pages!=='number'||!Number.isFinite(pages)||pages<=0)throw new Error('pages must be a finite number > 0.');
  return {direction:value,amount:pages,by:'page'};
}

export function nativeSelectionOptions(options={},platform='darwin'){
  objectOptions(options,'Selection');
  if(!['darwin','win32'].includes(platform))throw new Error('Unsupported native keyboard platform: '+platform);
  const raw=options.selectionType??'text';
  if(typeof raw!=='string')throw new Error('selectionType must be text, cursor_before, or cursor_after.');
  const kind=({select:'text',before:'cursor_before',after:'cursor_after'})[raw]??raw;
  if(!['text','cursor_before','cursor_after'].includes(kind))throw new Error('selectionType must be text, cursor_before, or cursor_after.');
  for(const name of ['prefix','suffix'])if(options[name]!==undefined&&typeof options[name]!=='string')throw new Error(name+' must be a string.');
  return {selection_type:platform==='win32'?({text:'select',cursor_before:'before',cursor_after:'after'})[kind]:kind,...(options.prefix===undefined?{}:{prefix:options.prefix}),...(options.suffix===undefined?{}:{suffix:options.suffix})};
}
