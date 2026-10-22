/** Shared by the Host and REPL: an idle cell can still owe an input release. */
export function createInputReleaseState() {
  const held = new Set();
  let required = false;
  return {
    get pending() { return required || held.size > 0; },
    async request(endpoint, args, dispatch) {
      const action = endpoint === 'act' ? args?.action : null;
      const key = ['keyDown', 'key_down', 'keyUp', 'key_up'].includes(action) ? JSON.stringify([args.targetId, 'key', args.key])
        : ['mouseDown', 'mouse_down', 'mouseUp', 'mouse_up'].includes(action) ? JSON.stringify([args.targetId, 'button', args.button ?? 'left']) : null;
      if (['keyDown', 'key_down', 'mouseDown', 'mouse_down'].includes(action)) held.add(key);
      if (endpoint === 'stop') required = true;
      try {
        const result = await dispatch();
        if (result?.ok === false) {
          if (result.error?.code === 'RELEASE_FAILED') required = true;
          return result;
        }
        if (['keyUp', 'key_up', 'mouseUp', 'mouse_up'].includes(action)) held.delete(key);
        if (endpoint === 'stop') { required = false; held.clear(); }
        const outcome = result?.result ?? result;
        if (outcome?.releasePending === true || outcome?.pendingDialog && outcome.inputDispatched === true)
          held.add(JSON.stringify([args?.targetId, 'release']));
        if (action === 'handleDialog' && outcome?.handled && !outcome.releasePending)
          for (const item of held) if (JSON.parse(item)[0] === args.targetId) held.delete(item);
        return result;
      } catch (error) {
        if (error?.code === 'RELEASE_FAILED') required = true;
        throw error;
      }
    },
  };
}
