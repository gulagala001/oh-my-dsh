const browser = Object.freeze({ defaultInputMode: 'background', selectionActivates: false, globalInput: false,
  input: 'target-cdp', capture: 'target-page', foregroundFallback: false,
  pressKey:{durationMs:{min:0,max:10000,integer:true},hold:'complete chord; no synthesized auto-repeat',rejectsHeldChordKeys:true,preservesUnrelatedHeldKeysOnSuccess:true},
  click: {modifiers:['Shift','Control','Alt','Meta'],durationMs:{min:0,max:10000,integer:true},clickCount:[1,2],holdPerClick:true,requiresNoHeldInputsForOptions:true} });

/** Describe routes, not a promise that every application accepts every action. */
export function controlCapabilities(target) {
  if (target.kind === 'tab' && ['browser', 'extension'].includes(target.backend)) return {...browser,
    waits: target.provider === 'extension' || target.backend === 'extension'
      ? {navigation:false,download:false,reason:'Extension identity is document scoped; download history is browser wide. Use inventory and cua.downloads.list().'}
      : {navigation:['commit','domcontentloaded','load'],download:'New target-owned download; verified complete file attachment. path() returns null; private storage paths are not exposed.',networkidle:false}};
  if (target.backend !== 'native') return undefined;
  const platform = target.platform, window = target.windowId != null;
  const axExtensions = platform === 'darwin' && target.kind !== 'desktop' ? ['selectText', 'paste', 'performSecondaryAction'] : [];
  const wayland = target.provider === 'wayland' || target.identity?.portalSession != null || target.displayServer === 'wayland';
  return { defaultInputMode: 'background', selectionActivates: false, foregroundFallback: false,
    pressKey: platform === 'darwin'
      ? {durationMs:{min:0,max:10000,integer:true},hold:'complete chord; no synthesized auto-repeat',rejectsHeldChordKeys:true,preservesUnrelatedHeldKeysOnSuccess:true,route:'existing keyboard route; selected application keyboard window required'}
      : {durationMs:false,reason:'Timed native pressKey requires macOS'},
    click: platform === 'darwin'
      ? {modifiers:['Shift','Control','Alt','Meta'],durationMs:{min:0,max:10000,integer:true},clickCount:[1,2],holdPerClick:true,requiresNoHeldInputsForOptions:true,route:'process-directed-events; no AXPress for modified/timed clicks'}
      : {modifiers:false,durationMs:false,reason:'Modified and timed native clicks require macOS'},
    input: platform === 'darwin' ? 'process-directed-events-and-accessibility' : target.input ?? 'accessibility-only',
    backgroundActions: target.kind === 'desktop' ? [] : platform === 'darwin' && !window ? ['set_value', 'ax_press', 'hitTest', ...axExtensions] : platform === 'darwin' && window
      ? ['click', 'doubleClick', 'move', 'mouseDown', 'mouseUp', 'scroll', 'drag', 'type', 'press', 'keyDown', 'keyUp', 'set_value', 'ax_press', ...axExtensions]
      : Array.isArray(target.backgroundActions) ? target.backgroundActions : ['set_value', 'ax_press', 'click', 'scroll', 'hitTest'],
    scroll: platform === 'darwin' ? 'target pixel events' : 'application-defined steps, not exact pixels',
    keyboard: platform === 'darwin' ? 'application-focused-window-only' : 'foreground-required; use set_value for editable elements',
    textEditing: platform === 'darwin' ? 'selectText: exact full AXValue/UTF-16 selection; paste: writable AXSelectedText only, text/md literal; no clipboard/focus fallback' : 'selectText/paste unsupported',
    secondaryAction: platform === 'darwin' ? 'explicit observed AX action name or documented alias; live capability checked before dispatch' : 'performSecondaryAction unsupported',
    capture: platform === 'darwin' ? window ? 'target-window' : 'display; select a window for isolated capture'
      : platform === 'win32' ? 'PrintWindow; application-dependent; minimized unavailable'
      : wayland ? 'shared-monitor; occluded window pixels unavailable' : 'XComposite window pixmap required',
    limitations: 'Application support and OS permissions apply. Posted events do not verify their effect. Explicit focus changes the foreground; foreground input requires user permission.' };
}
