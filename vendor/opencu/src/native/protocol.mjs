import {clickParameters} from '../../extension/click-options.js';
import {pressParameters} from '../../extension/key-options.js';

export class NativeBackendError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'NativeBackendError';
    this.code = code;
    this.details = details;
    this.retryable = details.retryable === true;
  }
  toJSON() { return { code: this.code, message: this.message, details: this.details }; }
}

export function nativeError(value, operation) {
  if (value instanceof NativeBackendError) return value;
  return new NativeBackendError(value?.code ?? 'NATIVE_FAILURE', value?.message ?? String(value), {
    ...value?.details, operation,
  });
}

export function normalizeAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    throw new NativeBackendError('INVALID_ACTION', 'An action object is required.');
  }
  const type = action.type ?? action.action;
  const aliases = { doubleClick: 'double_click', rightClick: 'right_click', mouseDown: 'mouse_down',
    mouseUp: 'mouse_up', keyDown: 'key_down', keyUp: 'key_up', setValue: 'set_value',
    keypress: 'press_key', press: 'press_key', pressKey: 'press_key', type: 'type_text', typeText: 'type_text', input: 'type_text',
    fill: 'set_value', mouse_move: 'move', key: 'press_key', focus: 'activate', hitTest: 'hit_test',
    selectText: 'select_text', performSecondaryAction: 'perform_secondary_action' };
  const value = { ...action, type: aliases[type] ?? type, inputMode: action.inputMode ?? 'background' };
  if (!['background', 'foreground'].includes(value.inputMode)) throw new NativeBackendError('INVALID_ACTION', 'inputMode must be background or foreground; foreground input requires explicit user permission.');
  if (Array.isArray(value.position)) [value.x, value.y] = value.position;
  if (Array.isArray(value.point)) [value.x, value.y] = value.point;
  if (Array.isArray(value.to)) [value.x, value.y] = value.to;
  if (Array.isArray(value.from)) [value.fromX, value.fromY] = value.from;
  if (value.type === 'drag' && Array.isArray(value.path)) {
    if (value.path.length < 2 || value.path.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) throw new NativeBackendError('INVALID_ACTION', 'Drag requires at least two finite points.');
    value.fromX = value.path[0].x; value.fromY = value.path[0].y;
    value.x = value.path.at(-1).x; value.y = value.path.at(-1).y;
  }
  value.elementId ??= value.element ?? value.runtimeElementId ?? value.id;
  value.text ??= value.value;
  value.key ??= value.combo;
  value.button ??= value.mouseButton;
  if (value.type === 'press_key') {
    // The legacy helper also accepts explicit keyCode/keys; validate their hold
    // without replacing those backend-specific key representations.
    pressParameters({...value,key:value.key ?? (value.keyCode !== undefined || Array.isArray(value.keys) ? 'explicit' : value.key)}, {mac:process.platform === 'darwin'});
  }
  if (['click','double_click','right_click'].includes(value.type)) {
    const click = clickParameters({...value,...(value.type === 'right_click' ? {button:'right'} : {})}, {mac:process.platform === 'darwin',count:value.type === 'double_click' ? 2 : 1});
    if (value.key !== undefined) value.key = click.keys.join('+');
    value.button = click.button;
  }
  if (value.clickCount === 2 && value.type === 'click') value.type = 'double_click';
  return value;
}

export function mapScreenshotPoint(point, screenshot) {
  const { width, height, bounds } = screenshot ?? {};
  if (!(width > 0 && height > 0 && bounds?.width > 0 && bounds?.height > 0)) {
    throw new NativeBackendError('OBSERVATION_REQUIRED', 'A screenshot coordinate mapping is required.');
  }
  const [x, y] = point;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) {
    throw new NativeBackendError('INVALID_COORDINATES', 'Point is outside the latest screenshot.', { point, width, height });
  }
  return { x: bounds.x + x * bounds.width / width, y: bounds.y + y * bounds.height / height };
}
