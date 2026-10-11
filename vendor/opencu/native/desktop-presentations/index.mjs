import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let addon;

/** Loads the macOS binding without creating windows or an AppKit application. */
export function loadDesktopPresentations() {
  if (process.platform !== 'darwin') throw new Error('Desktop presentations require macOS.');
  addon ??= require('./build/desktop-presentations.node');
  return addon;
}
