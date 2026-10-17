const browser = Object.freeze({ defaultInputMode: 'background', selectionActivates: false, globalInput: false,
  input: 'target-cdp', capture: 'target-page', foregroundFallback: false });

/** Describe routes, not a promise that every application accepts every action. */
export function controlCapabilities(target) {
  if (target.kind === 'tab' && ['browser', 'extension'].includes(target.backend)) return browser;
  if (target.backend !== 'native') return undefined;
  const platform = target.platform, window = target.windowId != null;
  const wayland = target.provider === 'wayland' || target.identity?.portalSession != null || target.displayServer === 'wayland';
  return { defaultInputMode: 'background', selectionActivates: false, foregroundFallback: false,
    input: platform === 'darwin' ? 'process-directed-events-and-accessibility' : 'accessibility-only',
    backgroundActions: target.kind === 'desktop' ? [] : platform === 'darwin' && !window ? ['set_value', 'ax_press', 'hitTest'] : platform === 'darwin' && window
      ? ['click', 'doubleClick', 'move', 'mouseDown', 'mouseUp', 'scroll', 'drag', 'type', 'press', 'keyDown', 'keyUp', 'set_value', 'ax_press']
      : ['set_value', 'ax_press', 'click', 'scroll', 'hitTest'],
    scroll: platform === 'darwin' ? 'target pixel events' : 'application-defined steps, not exact pixels',
    keyboard: platform === 'darwin' ? 'application-focused-window-only' : 'foreground-required; use set_value for editable elements',
    capture: platform === 'darwin' ? window ? 'target-window' : 'display; select a window for isolated capture'
      : platform === 'win32' ? 'PrintWindow; application-dependent; minimized unavailable'
      : wayland ? 'shared-monitor; occluded window pixels unavailable' : 'XComposite window pixmap required',
    limitations: 'Application support and OS permissions apply. Posted events do not verify their effect. Explicit focus changes the foreground; foreground input requires user permission.' };
}
