import {randomUUID} from 'node:crypto';
import {filePaths} from '../../extension/file-input.js';
const failure = (code,message,details = {}) => Object.assign(new Error(message),{code,details});

/** Subscribe before the next action; polls always release the controller lane. */
export function createFileChooserWait(context,options) {
  return value => {
    const {timeoutMs} = options(value,['timeoutMs']);
    return context.track(async signal => {
      if (!context.fileChooser?.supported()) throw failure('UNSUPPORTED','File chooser events require a standalone browser with the fileChooserEvents capability. DSH in-app and extension targets support explicit upload to an observed file input.',{inputDispatched:false});
      const id = randomUUID(), deadline = timeoutMs === 0 ? Infinity : Date.now()+timeoutMs;
      const command = async (action,args = {}) => {
        const reply = await context.fileChooser.act(action,{fileChooserId:id,...args});
        return reply?.result?.value ?? reply?.value ?? reply;
      };
      const check = () => {
        signal.throwIfAborted();
        if (Date.now() >= deadline) throw failure('FILE_CHOOSER_TIMEOUT',`File chooser timed out after ${timeoutMs}ms. Observe the original target before deciding another action; do not replay its trigger.`,{timeoutMs});
      };
      let handedOff = false;
      try {
        check();
        // This call is deliberately started before yielding to a following click.
        await command('fileChooserArm',{timeoutMs});
        for (;;) {
          check();let state;
          try {state = await command('fileChooserPoll');}catch (error) {check();throw error;}
          check();
          if (!state || state.id !== id || !['waiting','ready'].includes(state.status) || state.status === 'ready' && typeof state.multiple !== 'boolean')
            throw failure('INVALID_FILE_CHOOSER','The browser returned an invalid file chooser descriptor',{inputDispatched:false});
          if (state.status === 'ready') {
            handedOff = true;
            return Object.freeze({
              isMultiple: () => state.multiple,
              setFiles(files,value) {
                const paths = filePaths(files,{allowString:true}), {timeoutMs} = options(value,['timeoutMs']);
                return context.track(async signal => {
                  signal.throwIfAborted();
                  await command('fileChooserSetFiles',{files:paths,timeoutMs,...(timeoutMs ? {deadline:Date.now()+timeoutMs} : {})});
                  signal.throwIfAborted();
                });
              },
            });
          }
          await new Promise((resolve,reject) => {
            const done = () => {signal.removeEventListener('abort',abort);resolve();};
            const timer = setTimeout(done,Math.min(50,Math.max(1,deadline-Date.now())));
            const abort = () => {clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};
            signal.addEventListener('abort',abort,{once:true});if (signal.aborted) abort();
          });
        }
      } finally {
        if (!handedOff) await command('fileChooserCancel').catch(error => {
          // Target shutdown/cancellation already revokes its active subscription.
          // Other failures must remain visible; interception may still be active.
          if (!signal.aborted && !['TARGET_CLOSED','CONTROL_STOPPED','STALE_TARGET','BINDING_REQUIRED'].includes(error.code)) throw error;
        });
      }
    });
  };
}
