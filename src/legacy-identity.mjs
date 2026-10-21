// OMD releases up to 0.19 used an earlier identity. Existing installations
// still carry it in session logs, profile patches and the data directory, so
// this module is the single place that recognises it; nothing writes it again.
export const OMD_ID = 'oh-my-dsh';
export const OMD_PRESETS = Object.freeze([OMD_ID, 'omd-ptc']);

export const LEGACY_ID = 'trisoul-x';
export const LEGACY_PACKAGE = 'trisoul_x';
// Retired V0 session writer: reasoning blocks tagged with this field and
// compaction ids carrying this prefix.
export const LEGACY_V0_REASONING_TAG = 'trisoul';
export const LEGACY_V0_COMPACTION_PREFIX = 'trisoul-';

export const isOmdPreset = id => id === LEGACY_ID || OMD_PRESETS.includes(id);

export function currentSourceName(name) {
  return typeof name === 'string' && name.startsWith(LEGACY_ID + ':') ? OMD_ID + name.slice(LEGACY_ID.length) : name;
}

export function currentModuleName(name) {
  if (name === LEGACY_PACKAGE) return OMD_ID;
  return typeof name === 'string' && name.startsWith(LEGACY_PACKAGE + '/') ? OMD_ID + name.slice(LEGACY_PACKAGE.length) : name;
}
