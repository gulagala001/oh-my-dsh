/** CDP bypasses macOS native key bindings, so editing commands travel with the trusted key event. */
const movement = {
  ArrowLeft: 'moveLeft', ArrowRight: 'moveRight', ArrowUp: 'moveUp', ArrowDown: 'moveDown',
  Home: 'scrollToBeginningOfDocument', End: 'scrollToEndOfDocument', PageUp: 'scrollPageUp', PageDown: 'scrollPageDown',
};
const macCommands = {
  Backspace: 'deleteBackward', Delete: 'deleteForward', Escape: 'cancelOperation',
  'Shift+Backspace': 'deleteBackward', 'Shift+Delete': 'deleteForward', 'Shift+Escape': 'cancelOperation',
  'Shift+Home': 'moveToBeginningOfDocumentAndModifySelection', 'Shift+End': 'moveToEndOfDocumentAndModifySelection',
  'Shift+PageUp': 'pageUpAndModifySelection', 'Shift+PageDown': 'pageDownAndModifySelection',
  'Meta+KeyA': 'selectAll', 'Meta+KeyC': 'copy', 'Meta+KeyX': 'cut', 'Meta+KeyV': 'paste',
  'Meta+KeyZ': 'undo', 'Shift+Meta+KeyZ': 'redo',
  'Meta+Backspace': 'deleteToBeginningOfLine', 'Shift+Meta+Backspace': 'deleteToBeginningOfLine',
  'Alt+Backspace': 'deleteWordBackward', 'Shift+Alt+Backspace': 'deleteWordBackward',
  'Alt+Delete': 'deleteWordForward', 'Shift+Alt+Delete': 'deleteWordForward',
  'Alt+PageUp': 'pageUp', 'Alt+PageDown': 'pageDown',
  'Shift+Alt+PageUp': 'pageUp', 'Shift+Alt+PageDown': 'pageDown',
  'Control+KeyA': 'moveToBeginningOfParagraph', 'Control+KeyE': 'moveToEndOfParagraph',
  'Control+KeyB': 'moveBackward', 'Control+KeyF': 'moveForward', 'Control+KeyN': 'moveDown', 'Control+KeyP': 'moveUp',
  'Control+KeyD': 'deleteForward', 'Control+KeyH': 'deleteBackward', 'Control+KeyK': 'deleteToEndOfParagraph',
  'Control+KeyT': 'transpose', 'Control+KeyV': 'pageDown', 'Control+KeyY': 'yank',
  'Control+KeyL': 'centerSelectionInVisibleArea', 'Control+Backspace': 'deleteBackwardByDecomposingPreviousCharacter',
  'Shift+Control+Backspace': 'deleteBackwardByDecomposingPreviousCharacter',
  'Control+ArrowLeft': 'moveToLeftEndOfLine', 'Control+ArrowRight': 'moveToRightEndOfLine',
  'Control+ArrowUp': 'scrollPageUp', 'Control+ArrowDown': 'scrollPageDown',
  'Shift+Control+ArrowUp': 'scrollPageUp', 'Shift+Control+ArrowDown': 'scrollPageDown',
  'Control+Alt+KeyB': 'moveWordBackward', 'Control+Alt+KeyF': 'moveWordForward',
  'Control+Alt+Backspace': 'deleteWordBackward', 'Shift+Control+Alt+Backspace': 'deleteWordBackward',
};
for (const [code, command] of Object.entries(movement)) {
  macCommands[code] = command;
  if (code.startsWith('Arrow')) macCommands['Shift+' + code] = command + 'AndModifySelection';
}
for (const [modifier, commands] of Object.entries({
  Meta: { ArrowLeft: 'moveToLeftEndOfLine', ArrowRight: 'moveToRightEndOfLine', ArrowUp: 'moveToBeginningOfDocument', ArrowDown: 'moveToEndOfDocument' },
  Alt: { ArrowLeft: 'moveWordLeft', ArrowRight: 'moveWordRight' },
})) for (const [code, command] of Object.entries(commands)) {
  macCommands[modifier + '+' + code] = command;
  macCommands['Shift+' + modifier + '+' + code] = command + 'AndModifySelection';
}
macCommands['Alt+ArrowUp'] = ['moveBackward', 'moveToBeginningOfParagraph'];
macCommands['Alt+ArrowDown'] = ['moveForward', 'moveToEndOfParagraph'];
macCommands['Shift+Alt+ArrowUp'] = 'moveParagraphBackwardAndModifySelection';
macCommands['Shift+Alt+ArrowDown'] = 'moveParagraphForwardAndModifySelection';
for (const code of ['KeyA', 'KeyE', 'KeyB', 'KeyF', 'KeyN', 'KeyP', 'ArrowLeft', 'ArrowRight']) {
  macCommands['Shift+Control+' + code] = macCommands['Control+' + code] + 'AndModifySelection';
}
for (const code of ['KeyB', 'KeyF']) macCommands['Shift+Control+Alt+' + code] = macCommands['Control+Alt+' + code] + 'AndModifySelection';

export function keyEventKey(key, modifiers) {
  return modifiers & 8 && /^[a-z]$/iu.test(key) ? key.toUpperCase() : key;
}

export function keyEventParameters(spec, down, modifiers, isMac) {
  if (!down) modifiers &= ~({ Alt: 1, Control: 2, Meta: 4, Shift: 8 }[spec.key] ?? 0);
  const key = keyEventKey(spec.key, modifiers);
  const text = down && !(modifiers & 7) ? key === 'Enter' ? '\r' : key.length === 1 ? key : undefined : undefined;
  const shortcut = [[8, 'Shift'], [2, 'Control'], [1, 'Alt'], [4, 'Meta']].filter(([mask]) => modifiers & mask).map(([, name]) => name).concat(spec.code).join('+');
  const command = down && isMac ? macCommands[shortcut] : undefined;
  return { ...spec, key, type: down ? text ? 'keyDown' : 'rawKeyDown' : 'keyUp', modifiers,
    ...(command ? { commands: Array.isArray(command) ? command : [command] } : {}),
    ...(text ? { text, unmodifiedText: text } : {}),
  };
}

// These are the event routes' actual key definitions, shared with their preflight checks.
export function guestKeySpec(value) {
  if (typeof value !== 'string' || !value) throw Object.assign(new TypeError('Input requires a key name'), { code:'INVALID_ARGUMENT', details:{inputDispatched:false,retryable:false} })
  const aliases = { ctrl: 'Control', control: 'Control', alt: 'Alt', option: 'Alt', shift: 'Shift', meta: 'Meta', cmd: 'Meta', command: 'Meta', enter: 'Enter', return: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab', space: ' ', backspace: 'Backspace', delete: 'Delete', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
  const key = aliases[value.toLowerCase()] ?? value
  const named = { Control: ['ControlLeft', 17], Alt: ['AltLeft', 18], Shift: ['ShiftLeft', 16], Meta: ['MetaLeft', 91], Enter: ['Enter', 13], Escape: ['Escape', 27], Tab: ['Tab', 9], ' ': ['Space', 32], Backspace: ['Backspace', 8], Delete: ['Delete', 46], Insert: ['Insert', 45], ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40], Home: ['Home', 36], End: ['End', 35], PageUp: ['PageUp', 33], PageDown: ['PageDown', 34], '+': ['Equal', 187], '=': ['Equal', 187], '-': ['Minus', 189] }
  const spec = named[key] ?? (/^[a-z]$/i.test(key) ? [`Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0)] : /^\d$/.test(key) ? [`Digit${key}`, key.charCodeAt(0)] : /^F([1-9]|1\d|2[0-4])$/.test(key) ? [key, 111 + Number(key.slice(1))] : undefined)
  if (!spec) throw Object.assign(new Error('Use a supported named key; insertText handles Unicode'), { code:'UNSUPPORTED_KEY', details:{inputDispatched:false,retryable:false} })
  return { key, code: spec[0], windowsVirtualKeyCode: spec[1] }
}


export function extensionKeySpec(value) {
  const names = { CTRL: 'Control', CONTROL: 'Control', ALT: 'Alt', OPTION: 'Alt', SHIFT: 'Shift', META: 'Meta', CMD: 'Meta', COMMAND: 'Meta',
    ENTER: 'Enter', RETURN: 'Enter', TAB: 'Tab', ESC: 'Escape', ESCAPE: 'Escape', SPACE: ' ', BACKSPACE: 'Backspace', DELETE: 'Delete',
    UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', HOME: 'Home', END: 'End', PAGEUP: 'PageUp', PAGEDOWN: 'PageDown' };
  const key = names[String(value).toUpperCase()] || value;
  const codes = { Control: ['ControlLeft', 17], Alt: ['AltLeft', 18], Shift: ['ShiftLeft', 16], Meta: ['MetaLeft', 91],
    Enter: ['Enter', 13], Tab: ['Tab', 9], Escape: ['Escape', 27], ' ': ['Space', 32], Backspace: ['Backspace', 8], Delete: ['Delete', 46],
    ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40],
    Home: ['Home', 36], End: ['End', 35], PageUp: ['PageUp', 33], PageDown: ['PageDown', 34], '+': ['Equal', 187] };
  let code, vk;
  if (codes[key]) [code, vk] = codes[key];
  else if (/^[a-z]$/i.test(key)) { code = 'Key' + key.toUpperCase(); vk = key.toUpperCase().charCodeAt(0); }
  else if (/^\d$/.test(key)) { code = 'Digit' + key; vk = key.charCodeAt(0); }
  else if (/^F([1-9]|1[0-2])$/.test(key)) { code = key; vk = 111 + Number(key.slice(1)); }
  else throw Object.assign(new Error('Use named keys, letters, digits or F1–F12; type_text handles other Unicode.'), {code:'UNSUPPORTED_KEY',details:{inputDispatched:false,retryable:false}});
  return { key, code, windowsVirtualKeyCode: vk };
}
