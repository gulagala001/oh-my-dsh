import {inputReleased} from '../protocol.mjs';

/** Shared by the Host and REPL: an idle cell can still owe an input release. */
export function createInputReleaseState() {
  const held = new Set();
  const uncertainTargets = new Set();
  const pendingDown = new Set(), targetReleases = new Map();
  const targetInputs = new Map();
  const activeControls = new Set();
  let required = false, releaseEpoch = 0, sequence = 0;
  const clear = () => { required = false; held.clear(); uncertainTargets.clear(); releaseEpoch++; targetReleases.clear(); targetInputs.clear(); };
  const clearTarget = targetId => {
    targetReleases.set(targetId, (targetReleases.get(targetId) ?? 0) + 1);
    uncertainTargets.delete(targetId);
    for (const item of held) if (JSON.parse(item)[0] === targetId) held.delete(item);
  };
  const acceptedRelease = (details, checkpoint) => {
    if (checkpoint && (checkpoint.epoch !== releaseEpoch || !Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence > sequence)) return false;
    // A completed controller shutdown is stronger than a per-target receipt.
    // Accept it only at the captured frontier, never after another request.
    if (checkpoint?.sequence === sequence && inputReleased(details?.release) && details.state?.closed === true &&
        details.state.mode === 'closed' && details.state.releasePending === false && Array.isArray(details.state.releaseErrors) && !details.state.releaseErrors.length) {
      clear(); return true;
    }
    const ids = details?.releasedTargetIds;
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string') || !inputReleased(details.release)) return false;
    let accepted = false;
    for (const id of ids) {
      if (checkpoint && (targetInputs.get(id) ?? 0) > checkpoint.sequence) continue;
      clearTarget(id); accepted = true;
    }
    return accepted;
  };
  return {
    get pending() { return required || held.size > 0 || uncertainTargets.size > 0 || pendingDown.size > 0 || activeControls.size > 0; },
    checkpoint: () => ({epoch: releaseEpoch, sequence}),
    acceptRelease: (details, checkpoint) => checkpoint ? acceptedRelease(details, checkpoint) : false,
    async request(endpoint, args, dispatch) {
      sequence++;
      if (endpoint === 'act' && typeof args?.targetId === 'string') targetInputs.set(args.targetId, sequence);
      const control = ['select','act','focus','openTarget','resume'].includes(endpoint) ? {} : null;
      if (control) activeControls.add(control);
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
      const releasesAll = endpoint === 'stop' || endpoint === 'interrupt';
      if (releasesAll) required = true;
      const failedRelease = () => {
        // Recovery dispatches no new input. Its old/global failure must not
        // become a new obligation owned by this otherwise idle session.
        if (endpoint === 'resume') return;
        if (epoch !== releaseEpoch) return;
        if (endpoint === 'act' && typeof args?.targetId === 'string') {
          if (targetEpoch === targetReleases.get(args.targetId)) uncertainTargets.add(args.targetId);
        } else required = true;
      };
      try {
        const result = await dispatch();
        if (result?.ok === false) {
          const state = result.state;
          if (['faulted', 'stopped', 'recovery_required'].includes(state?.mode) && state.releasePending === false && !state.releaseErrors?.length) clear();
          else if (!acceptedRelease(result.error?.details)) retain(result.error?.details);
          if (result.error?.code === 'RELEASE_FAILED') failedRelease();
          return result;
        }
        retain();
        if (['keyUp', 'key_up', 'mouseUp', 'mouse_up'].includes(action)) held.delete(key);
        if (releasesAll) clear();
        if (inputReleased(result?.release)) {
          if (result.state?.releasePending === false && !result.state.releaseErrors?.length) clear();
          else {
            acceptedRelease(result);
            // Explicit recovery supersedes this session's failed global-stop
            // retry. The controller keeps unrelated browser debts quarantined;
            // held/uncertain inputs on other owned targets remain pending here.
            if (result.state?.mode === 'active' && result.state.recoveryIsolated === true) required = false;
          }
        }
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
        if (['faulted','stopped','recovery_required'].includes(state?.mode) && state.releasePending === false && !state.releaseErrors?.length) clear();
        else if (!acceptedRelease(error?.details)) retain(error?.details);
        if (error?.code === 'RELEASE_FAILED') failedRelease();
        throw error;
      } finally { if (attempt) pendingDown.delete(attempt); if (control) activeControls.delete(control); }
    },
  };
}
