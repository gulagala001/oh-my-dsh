import { IMAGE_OFFLOAD_REQUIRED_CODE } from '@deepseek-ai/dsh-llm';
const localCodes = new Set([IMAGE_OFFLOAD_REQUIRED_CODE, 'OMD_IMAGE_OFFLOAD_REQUIRED']);
export function isLocalImagePreflight(entry) {
  return entry.status === 'error' && !entry.hasOutput && localCodes.has(entry.failure?.code)
    && !Object.values(entry.usage ?? {}).some(value => typeof value === 'number' && value > 0);
}
export function localImageEvent(entry, recovered = false) {
  return { id: 'image-preflight:' + entry.id, kind: 'imagePreparation', at: entry.at,
    status: recovered ? 'recovered' : 'local', replace: recovered,
    title: recovered ? '图片预检后已恢复' : '本地图片预检',
    detail: entry.failure?.message ?? entry.error,
    data: { code: entry.failure?.code, nativeCallId: entry.id, turn: entry.turn, step: entry.step, providerRequestSent: false, recovered } };
}

const pending = new WeakMap();
export function imagePreflightsFor(owner) {
  if (!pending.has(owner)) pending.set(owner, new Map());
  return pending.get(owner);
}
