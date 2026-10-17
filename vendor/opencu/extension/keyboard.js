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
