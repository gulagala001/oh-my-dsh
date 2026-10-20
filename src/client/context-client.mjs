import { CONTEXT_FREQUENCY_PRESETS } from '../frequency.mjs';
export { CONTEXT_FREQUENCY_PRESETS } from '../frequency.mjs';

export const CONTEXT_UI_VERSION = '2.0.0';
export function contextFrequencyOf(config = {}) {
  return Object.entries(CONTEXT_FREQUENCY_PRESETS).find(([, values]) => Object.entries(values).every(([key, value]) => config[key] === value))?.[0] || 'custom';
}
export function contextFrequencyPatch(name) {
  if (!Object.hasOwn(CONTEXT_FREQUENCY_PRESETS, name)) throw Error('未知频率档位');
  return { ...CONTEXT_FREQUENCY_PRESETS[name] };
}
export function contextRouteMode(config = {}) {
  const route = config.unifiedBackground || {};
  if (config.backgroundMode === 'separate') return 'separate';
  return !route.provider && !route.model && (!route.effort || route.effort === 'off') && (route.temperature == null || route.temperature === 0.7) ? 'follow' : 'unified';
}
