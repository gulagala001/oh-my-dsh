import {pressParameters} from '../../extension/key-options.js';

export const PROTOCOL_VERSION = 1;
export const EXTENSION_PATH = '/opencu-extension/v1';

export class ExtensionError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'ExtensionError'; this.code = code; this.details = details;
  }
  toJSON() { return { code: this.code, message: this.message, details: this.details }; }
}

export function targetId(identity) {
  return `extension:${identity.instanceId}/${identity.browserInstanceId}/${identity.epoch}/${identity.tabId}/${identity.documentId}`;
}

export function parseTarget(value) {
  const id = typeof value === 'string' ? value : value?.id ?? value?.targetId;
  const match = /^extension:([^/]+)\/([^/]+)\/([^/]+)\/(\d+)\/([^/]+)$/.exec(id || '');
  if (!match) throw new ExtensionError('INVALID_TARGET', 'Select a current extension tab from listTargets().');
  return { instanceId: match[1], browserInstanceId: match[2], epoch: match[3], tabId: Number(match[4]), documentId: match[5] };
}

export function normalizeAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new ExtensionError('INVALID_ACTION', 'An action object is required.');
  const aliases = { type: 'type_text', typeText: 'type_text', key: 'press_key', keypress: 'press_key', pressKey: 'press_key',
    setValue: 'set_value', fill: 'fill', mouseDown: 'mouse_down', mouseUp: 'mouse_up', mouse_move: 'move', keyDown: 'key_down', keyUp: 'key_up',
    press: 'press_key', doubleClick: 'double_click', rightClick: 'right_click', goto: 'navigate', newTab: 'new_tab', closeTab: 'close_tab', focus: 'activate', hit_test: 'hitTest', get_dom: 'getDOM', set_text: 'setText', set_style: 'setStyle', design_tweak: 'designTweak' };
  const value = { ...action, type: aliases[action.type ?? action.action] ?? (action.type ?? action.action) };
  if (Array.isArray(value.position ?? value.point)) [value.x, value.y] = value.position ?? value.point;
  if (Array.isArray(value.from)) [value.fromX, value.fromY] = value.from;
  if (Array.isArray(value.to)) [value.x, value.y] = value.to;
  if (value.type === 'drag' && Array.isArray(value.path)) {
    if (value.path.length < 2 || value.path.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) throw new ExtensionError('INVALID_ACTION', 'Drag requires at least two finite points.');
    value.fromX = value.path[0].x; value.fromY = value.path[0].y;
    value.x = value.path.at(-1).x; value.y = value.path.at(-1).y;
  }
  value.elementId ??= value.element ?? value.runtimeElementId;
  value.text ??= value.type === 'type_text' || value.type === 'setText' ? value.value : undefined;
  value.key ??= value.combo;
  value.button ??= value.mouseButton;
  if (value.type === 'press_key') pressParameters(value,{mac:process.platform === 'darwin'});
  return value;
}

export function mapScreenshotPoint(point, screenshot, preview = {}) {
  const width = preview.width ?? screenshot?.width, height = preview.height ?? screenshot?.height;
  const bounds = screenshot?.bounds;
  if (!(width > 0 && height > 0 && bounds?.width > 0 && bounds?.height > 0)) throw new ExtensionError('OBSERVATION_REQUIRED', 'A screenshot and its displayed dimensions are required.');
  const [x, y] = point;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) throw new ExtensionError('INVALID_COORDINATES', 'Point is outside the screenshot.');
  return { x: bounds.x + x * bounds.width / width, y: bounds.y + y * bounds.height / height };
}
