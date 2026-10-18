const invalid = message => { throw Object.assign(new TypeError(message), {
  code: 'INVALID_ARGUMENT', details: { inputDispatched: false, retryable: false },
}); };
const keyName = (key, mac) => ({ SHIFT:'Shift', CONTROL:'Control', CTRL:'Control', ALT:'Alt', OPTION:'Alt',
  META:'Meta', CMD:'Meta', COMMAND:'Meta', SUPER:'Meta', CONTROLORMETA:mac ? 'Meta' : 'Control' })[String(key).toUpperCase()] ?? key;

/** Validate the complete chord and hold before focusing or sending any key. */
export function pressParameters(options = {}, { mac = false, identity = key => key } = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) invalid('pressKey options must be an object');
  if (options.durationMs !== undefined && (!Number.isInteger(options.durationMs) || options.durationMs < 0 || options.durationMs > 10000)) invalid('durationMs must be an integer from 0 to 10000');
  if (typeof options.key !== 'string' || !options.key) invalid('key must be a non-empty string');
  const parts = [];
  let token = '';
  for (const character of options.key) {
    if (character === '+' && token) { parts.push(token); token = ''; }
    else token += character;
  }
  parts.push(token);
  const keys = parts.map(part => {
    if (!part) invalid('Shortcut contains an empty key');
    return keyName(part,mac);
  });
  const identities = keys.map(identity);
  if (new Set(identities).size !== identities.length) invalid('A key chord cannot contain duplicate physical keys or aliases');
  return {keys, durationMs:options.durationMs ?? 0};
}

export function checkPressHeld({ keys }, chord, {mac = false, identity = key => key} = {}) {
  const held = new Set([...keys.keys()].map(key => identity(keyName(key,mac))));
  if (chord.some(key => held.has(identity(keyName(key,mac))))) throw Object.assign(new Error('pressKey cannot reuse an explicitly held key; release it first'), {
    code:'INPUT_ALREADY_HELD', details:{inputDispatched:false,retryable:false},
  });
}
