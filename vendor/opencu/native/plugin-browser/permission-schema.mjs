import { fail, record } from './ipc.mjs';

export const PERMISSION_SOURCE = 'opencu-permission-store';

// Preserve the existing Chromium 152 descriptor IDs. These settings are
// enforced by Electron callbacks, not by a Chromium content settings map.
const entries = [
  [4, 'geolocation', 'geolocation'], [6, 'notifications', 'notifications'],
  [9, 'media-stream-mic', 'microphone'], [10, 'media-stream-camera', 'camera'],
  [14, 'midi-sysex', 'midiSysex'], [16, 'protected-media-identifier', 'mediaKeySystem'],
  [19, 'durable-storage', 'persistent-storage'], [28, 'midi', 'midi'],
  [33, 'sensors', 'sensors'], [36, 'usb-guard', 'usb'],
  [39, 'idle-detection', 'idle-detection'], [40, 'serial-guard', 'serial'],
  [44, 'hid-guard', 'hid'], [52, 'clipboard', 'clipboard-read'],
  [60, 'window-management', 'window-management'], [61, 'local-fonts', 'local-fonts'],
  [95, 'speaker-selection', 'speaker-selection'], [97, 'keyboard-lock', 'keyboard-lock'],
  [98, 'pointer-lock', 'pointerLock'],
];
export const DEVICE_TYPES = new Map([['usb', 36], ['serial', 40], ['hid', 44]]);
export const PERMISSION_DESCRIPTORS = entries.map(([type, name, permissionKey]) => Object.freeze({
  type, name, permissionKey, settingKind: 'content-setting',
  settingValues: DEVICE_TYPES.has(permissionKey) ? ['block', 'ask'] : ['allow', 'block', 'ask'],
  supportsTemporaryGrant: !DEVICE_TYPES.has(permissionKey), enforcement: 'electron-permission-handler',
}));
export const PERMISSION_TYPES = new Map(PERMISSION_DESCRIPTORS.map(item => [item.type, item]));
const byPermission = new Map(PERMISSION_DESCRIPTORS.map(item => [item.permissionKey, item.type]));
export const permissionType = value => {
  if (!Number.isSafeInteger(value) || !PERMISSION_TYPES.has(value)) throw fail('Unsupported website permission type', 'INVALID_ARGUMENT');
  return value;
};
export const permissionTypes = value => {
  if (!Array.isArray(value) || !value.length || value.length > PERMISSION_TYPES.size
    || new Set(value).size !== value.length) throw fail('Distinct website permission types are required', 'INVALID_ARGUMENT');
  return value.map(permissionType);
};
export function exactOrigin(value) {
  if (typeof value !== 'string' || value.length > 8192) throw fail('An exact website origin is required', 'INVALID_ORIGIN');
  let url;
  try { url = new URL(value); } catch { throw fail('An exact website origin is required', 'INVALID_ORIGIN'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== value)
    throw fail('An exact HTTP(S) website origin is required', 'INVALID_ORIGIN');
  return url.origin;
}
export function providedOrigin(value) {
  if (typeof value !== 'string' || value.length > 8192) throw fail('The permission origin is unavailable', 'INVALID_ORIGIN');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || ![url.origin, `${url.origin}/`].includes(value)) throw fail('The permission origin is unavailable', 'INVALID_ORIGIN');
  return url.origin;
}
export function selection(value) {
  if (value.scope === 'default') {
    if (value.requestingOrigin !== undefined || value.embeddingOrigin !== undefined)
      throw fail('Default permission settings cannot contain origins', 'INVALID_ARGUMENT');
    return { scope: 'default' };
  }
  if (value.scope !== 'origin') throw fail('Permission scope must be origin or default', 'INVALID_ARGUMENT');
  return { scope: 'origin', requestingOrigin: exactOrigin(value.requestingOrigin), embeddingOrigin: exactOrigin(value.embeddingOrigin) };
}
export const settingValue = value => {
  if (!['allow', 'block', 'ask'].includes(value)) throw fail('Permission setting must be allow, block or ask', 'INVALID_ARGUMENT');
  return value;
};
export function typeSetting(type, value) {
  settingValue(value);
  if (!PERMISSION_TYPES.get(permissionType(type)).settingValues.includes(value))
    throw fail('This setting is not enforceable for the permission type', 'INVALID_ARGUMENT');
  return value;
}
export const siteKey = (type, requestingOrigin, embeddingOrigin) => JSON.stringify([type, requestingOrigin, embeddingOrigin]);
export function requestedTypes(permission, details, { check = false } = {}) {
  if (permission !== 'media') {
    const type = byPermission.get(permission);
    if (type === undefined) throw fail('This permission is not exposed by the website permission service', 'UNSUPPORTED_OPERATION');
    return [type];
  }
  const mediaTypes = check ? [details?.mediaType] : details?.mediaTypes;
  if (!Array.isArray(mediaTypes) || !mediaTypes.length || mediaTypes.length > 2
    || mediaTypes.some(type => !['audio', 'video'].includes(type)) || new Set(mediaTypes).size !== mediaTypes.length)
    throw fail('Electron did not identify the requested media access', 'PERMISSION_IDENTITY_UNAVAILABLE');
  return mediaTypes.map(type => type === 'audio' ? 9 : 10);
}
export function onlyKeys(value, keys) {
  if (!record(value) || Object.keys(value).some(key => !keys.includes(key))) throw fail('Invalid permission request fields', 'INVALID_ARGUMENT');
}
