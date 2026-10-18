const invalid = message => { throw Object.assign(new TypeError(message), {
  code: 'INVALID_ARGUMENT', details: { inputDispatched: false, retryable: false },
}); };

/** Shared by the host wrappers and all Chromium event routes. No input is sent here. */
export function clickParameters(options = {}, { mac = false, count = 1 } = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) invalid('Click options must be an object');
  const button = options.button ?? options.mouseButton ?? 'left';
  if (!['left', 'middle', 'right'].includes(button)) invalid('mouseButton/button must be left, middle, or right');
  if (options.button !== undefined && options.mouseButton !== undefined && options.button !== options.mouseButton) invalid('button and mouseButton must agree');
  if (count === 2 && options.clickCount !== undefined && options.clickCount !== 2) invalid('doubleClick requires clickCount 2');
  count = options.clickCount ?? count;
  if (![1, 2].includes(count)) invalid('clickCount must be 1 or 2');
  const durationMs = options.durationMs ?? 0;
  if (options.durationMs !== undefined && (!Number.isInteger(options.durationMs) || options.durationMs < 0 || options.durationMs > 10000)) invalid('durationMs must be an integer from 0 to 10000');
  const keys = [];
  if (options.key !== undefined) {
    if (typeof options.key !== 'string' || !options.key.trim()) invalid('Click key must be a non-empty modifier chord');
    const aliases = { SHIFT: 'Shift', CONTROL: 'Control', CTRL: 'Control', ALT: 'Alt', OPTION: 'Alt',
      META: 'Meta', CMD: 'Meta', COMMAND: 'Meta', SUPER: 'Meta', CONTROLORMETA: mac ? 'Meta' : 'Control' };
    for (const part of options.key.split('+')) {
      const key = aliases[part.trim().toUpperCase()];
      if (!key) invalid('Click key supports only Shift, Control/Ctrl, Alt/Option, Meta/Cmd/Command/Super, or ControlOrMeta');
      if (keys.includes(key)) invalid('Click modifier chord contains duplicate aliases');
      keys.push(key);
    }
  }
  return { button, count, keys, durationMs, transactional: options.key !== undefined || options.durationMs !== undefined };
}

export function checkClickHeld({ keys, buttons }, click) {
  if (buttons.has(click.button) || click.transactional && (keys.size || buttons.size)) {
    throw Object.assign(new Error('Release explicitly held input before a modified or timed click; a click cannot reuse a held mouse button'), {
      code: 'INPUT_ALREADY_HELD', details: { inputDispatched: false, retryable: false },
    });
  }
}

/** Bounded backend transaction wait; cancellation is checked without replaying input. */
export async function holdClick(durationMs, check) {
  const deadline = performance.now() + durationMs;
  for (;;) {
    check();
    const remaining = deadline - performance.now();
    if (remaining <= 0) return;
    await new Promise(resolve => setTimeout(resolve, Math.min(20, remaining)));
  }
}
