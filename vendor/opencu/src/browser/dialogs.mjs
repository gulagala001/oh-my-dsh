import {randomUUID} from 'node:crypto';
import {fail} from '../protocol.mjs';

const stale = () => fail('STALE_DIALOG', 'The dialog token no longer identifies an open dialog on this page', {inputDispatched:false});

/** Dialog objects and tokens belong to one Page occurrence, never the active tab. */
export function createPageDialogs(page, generation) {
  let current, session, release;
  const guards = new Set(), awaitingClose = [];
  const openError = (dialog, inputDispatched = false) => Object.assign(new Error('A JavaScript dialog is open; inspect and explicitly handle its token before continuing'),
    {code:'JS_DIALOG_OPEN',details:{dialog,inputDispatched}});
  const invalidate = () => { current = undefined; };
  const read = () => {
    if (page.isClosed() || current && current.generation !== generation()) invalidate();
    return current?.descriptor ?? null;
  };
  const dismissForRelease = entry => {
    if (!entry || release.pending.has(entry)) return;
    if (Date.now() >= release.deadline || ++release.count > 16) {
      release.failures.push('Dialog release limit reached; the page may be opening dialogs repeatedly');
      return;
    }
    // Stop/release is the only automatic dismissal scope. CDP also covers an
    // explicit handle whose outcome was uncertain, without reusing its Dialog object.
    const work = session ? session.send('Page.handleJavaScriptDialog', {accept:false}) : entry.dialog.dismiss();
    release.pending.set(entry, work);
    work.then(() => { if (current === entry) invalidate(); }, error => release?.failures.push(error.message)).catch(() => {});
  };
  const opened = dialog => {
    const entry = {dialog,generation:generation(),descriptor:{id:randomUUID(),type:dialog.type(),message:dialog.message(),defaultPrompt:dialog.defaultValue(),url:page.url()}};
    current = entry; awaitingClose.push(entry);
    for (const guard of guards) guard.interrupt(entry.descriptor);
    if (release) dismissForRelease(entry);
  };
  const navigated = frame => { if (frame === page.mainFrame()) invalidate(); };
  const terminated = () => { invalidate(); awaitingClose.length = 0; };
  // Closed events are paired in order so a late close acknowledgement cannot
  // invalidate the next dialog opened by the resumed website script.
  const dialogClosed = () => { const entry = awaitingClose.shift(); if (entry && current === entry) invalidate(); };
  page.on('dialog', opened); page.on('framenavigated', navigated); page.on('close', terminated); page.on('crash', terminated);
  function begin() {
    const dialog = read();
    if (dialog) throw openError(dialog);
    let interrupted, reject;
    const interruption = new Promise((_resolve, fail) => { reject = fail; });
    interruption.catch(() => {});
    const guard = {
      get dialog() { return interrupted; },
      interrupt(dialog) { if (!interrupted) { interrupted = dialog; reject(openError(dialog)); } },
      check() { if (interrupted) throw openError(interrupted); const dialog = read(); if (dialog) { guard.interrupt(dialog); throw openError(dialog); } },
      async wait(work) { guard.check(); const result = await Promise.race([work,interruption]); guard.check(); return result; },
      finish() { guards.delete(guard); },
    };
    guards.add(guard);
    return guard;
  }
  return {
    read,begin,openError,
    assertClosed() { const dialog = read(); if (dialog) throw openError(dialog); },
    async guard(work) {
      const guard = begin();
      try { return await guard.wait(Promise.resolve().then(() => { guard.check(); return work(); })); }
      finally { guard.finish(); }
    },
    async attach(value) { session = value; session.on('Page.javascriptDialogClosed',dialogClosed); await session.send('Page.enable'); },
    async handle({dialogId,accept,promptText}) {
      if (typeof dialogId !== 'string' || typeof accept !== 'boolean' || promptText !== undefined && typeof promptText !== 'string') fail('INVALID_ARGUMENT','handleDialog requires dialogId, boolean accept, and optional string promptText',{inputDispatched:false});
      const entry = current;
      if (!entry || entry.descriptor.id !== dialogId || entry.handling) stale();
      // Flush lifecycle events already queued on this exact CDP session before
      // deciding whether an old token can still address its original Dialog.
      try { await session?.send('Target.getTargetInfo'); } catch { stale(); }
      const descriptor = read();
      if (!descriptor || current !== entry || descriptor.id !== dialogId || entry.handling) stale();
      if (promptText !== undefined && descriptor.type !== 'prompt') fail('INVALID_ARGUMENT','promptText is only valid for prompt dialogs',{inputDispatched:false});
      entry.handling = true;
      try {
        if (accept) await entry.dialog.accept(promptText);
        else await entry.dialog.dismiss();
        if (current === entry) invalidate();
        return {handled:true};
      } catch (error) {
        if (!read() || current !== entry) stale();
        const failure = openError(entry.descriptor, true);
        failure.details.cause = error.message;
        throw failure;
      }
    },
    async beginRelease(timeoutMs) {
      if (release) fail('RELEASE_FAILED','Dialog release is already in progress');
      const state = release = {deadline:Date.now()+timeoutMs,count:0,failures:[],pending:new Map()};
      if (read()) dismissForRelease(current);
      let timer;
      try {
        const ready = await Promise.race([
          Promise.allSettled([...state.pending.values()]).then(() => true),
          new Promise(resolve => { timer=setTimeout(()=>resolve(false),timeoutMs); }),
        ]);
        if (!ready) state.failures.push('Dialog dismissal is still in flight');
      } finally { clearTimeout(timer); }
      return {failures:state.failures,finish() { if (release === state) release = undefined; }};
    },
    dispose() {
      page.off('dialog',opened); page.off('framenavigated',navigated); page.off('close',terminated); page.off('crash',terminated);
      session?.off('Page.javascriptDialogClosed',dialogClosed);
      terminated();
    },
  };
}
