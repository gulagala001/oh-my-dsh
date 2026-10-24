import {inputReleased} from '../protocol.mjs';

/** Shared by the Host and REPL: an idle cell can still owe an input release. */
export function createInputReleaseState() {
  const held = new Set();
  const pendingDown = new Set(), targetReleases = new Map();
  let required = false, releaseEpoch = 0;
  const clear = () => { required = false; held.clear(); releaseEpoch++; targetReleases.clear(); };
  const clearTarget = targetId => {
    targetReleases.set(targetId, (targetReleases.get(targetId) ?? 0) + 1);
    for (const item of held) if (JSON.parse(item)[0] === targetId) held.delete(item);
  };
  const acceptedRelease = details => {
    const ids = details?.releasedTargetIds;
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string') || !inputReleased(details.release)) return false;
    for (const id of ids) clearTarget(id);
    return true;
  };
  return {
    get pending() { return required || held.size > 0 || pendingDown.size > 0; },
    async request(endpoint, args, dispatch) {
      const action = endpoint === 'act' ? args?.action : null;
      const key = ['keyDown', 'key_down', 'keyUp', 'key_up'].includes(action) ? JSON.stringify([args.targetId, 'key', args.key])
        : ['mouseDown', 'mouse_down', 'mouseUp', 'mouse_up'].includes(action) ? JSON.stringify([args.targetId, 'button', args.button ?? 'left']) : null;
      const down = ['keyDown', 'key_down', 'mouseDown', 'mouse_down'].includes(action);
      const epoch = releaseEpoch, targetEpoch = targetReleases.get(args?.targetId);
      const attempt = down ? {} : null;
      if (attempt) pendingDown.add(attempt);
      const retain = details => {
        if (down && details?.inputDispatched !== false && epoch === releaseEpoch && targetEpoch === targetReleases.get(args?.targetId)) held.add(key);
      };
      if (endpoint === 'stop') required = true;
      try {
        const result = await dispatch();
        if (result?.ok === false) {
          const state = result.state;
          if (['faulted', 'stopped'].includes(state?.mode) && state.releasePending === false && !state.releaseErrors?.length) clear();
          else if (!acceptedRelease(result.error?.details)) retain(result.error?.details);
          if (result.error?.code === 'RELEASE_FAILED') required = true;
          return result;
        }
        retain();
        if (['keyUp', 'key_up', 'mouseUp', 'mouse_up'].includes(action)) held.delete(key);
        if (endpoint === 'stop') clear();
        const outcome = result?.result ?? result;
        if (inputReleased(outcome?.release)) clearTarget(args?.targetId);
        if (outcome?.releasePending === true || outcome?.pendingDialog && outcome.inputDispatched === true)
          held.add(JSON.stringify([args?.targetId, 'release']));
        if (action === 'handleDialog' && outcome?.handled && !outcome.releasePending) {
          clearTarget(args.targetId);
        }
        return result;
      } catch (error) {
        const state = error?.details?.control;
        if (['faulted','stopped'].includes(state?.mode) && state.releasePending === false && !state.releaseErrors?.length) clear();
        else if (!acceptedRelease(error?.details)) retain(error?.details);
        if (error?.code === 'RELEASE_FAILED') required = true;
        throw error;
      } finally { if (attempt) pendingDown.delete(attempt); }
    },
  };
}
