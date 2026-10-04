import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { ProjectlessDrafts, submitDraft, copyPermissions } from '../src/client/projectless-state.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const blank = () => ({ draft: '', occurrences: [], attachmentIds: [] });
function observable(value) {
  const listeners = new Set();
  return {
    getSnapshot() { return value; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const fn of listeners) fn(); },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('asynchronous operation did not settle');
}

function fixture(t) {
  const shells = new Map(), byId = {}, requests = [], creates = [], opened = [], notifications = [], navigation = [], retains = [], fileOwners = new Map(), sinkCalls = [];
  const uploads = {}, uploadListeners = new Set();
  const attachmentEntries = new Map(), copiedDrafts = [];
  let currentId = 'temporary-a', createdIndex = 0, freshFileIndex = 0, defaultAdmission = 'success';
  const storage = {
    values: new Map(), rejectWrites: false,
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { if (this.rejectWrites) throw Error('storage refused'); this.values.set(key, value); },
  };
  function addSession(id, draft = blank(), cwd = '/existing/project') {
    byId[id] = { cwd, blank: true };
    const submissionListeners = new Set();
    const shell = {
      draft: clone(draft), submissions: [], focused: 0, admission: defaultAdmission, command: false,
      state: observable({ phase: 'plain', ...clone(draft) }), notices: observable(null),
      onSubmission(fn) { submissionListeners.add(fn); return () => submissionListeners.delete(fn); },
      emitSubmission(event) { for (const fn of submissionListeners) fn(event); },
      captureDraft() { return clone(this.draft); },
      restoreDraft(value) { this.draft = clone(value); this.state.set({ phase: 'plain', ...clone(value) }); },
      completeAdmission(kind = 'success', text = 'native admission failed') {
        if (kind === 'success') {
          if (!this.command) for (const attachmentId of this.submissions.at(-1)?.input.attachmentIds || []) attachmentEntries.delete(attachmentId);
          this.restoreDraft(blank());
          if (!this.command) { byId[id].blank = false; this.emitSubmission({ kind: 'success' }); }
        } else if (this.command) this.notices.set({ level: 'error', text });
        else this.emitSubmission({ kind: 'error', text });
      },
      submit(mode, ...args) {
        this.submissions.push({ mode, args, input: this.captureDraft() });
        if (this.admission === 'throw') throw Error('native submit threw');
        if (!this.command) this.emitSubmission({ kind: 'pending' });
        this.state.set({ phase: this.command ? 'adjudicating' : 'submitting', ...this.captureDraft() });
        if (this.admission !== 'manual') queueMicrotask(() => this.completeAdmission(this.admission));
      },
      focus() { this.focused++; },
      notify(level, message) { notifications.push({ id, level, message }); },
    };
    shells.set(id, shell);
    for (const attachment of draft.attachmentIds) {
      fileOwners.set(attachment, id); uploads[attachment] = { status: 'uploaded' };
      attachmentEntries.set(attachment, { id: attachment, file: new File([`contents of ${attachment}`], `${attachment}.txt`, { type: 'text/plain' }) });
    }
    return shell;
  }
  const source = addSession('temporary-a', { draft: '第一份原稿', occurrences: [{ start: 0, end: 2 }], attachmentIds: ['file-a'] });
  const other = addSession('temporary-b', { draft: '第二份原稿', occurrences: [], attachmentIds: ['file-b'] });
  addSession('elsewhere');
  function navigate(id) { currentId = id; for (const controller of navigation) controller.abort(); }
  const conversation = {
    fileUploads: { getSnapshot() { return uploads; }, subscribe(fn) { uploadListeners.add(fn); return () => uploadListeners.delete(fn); } },
    input: {
      for(binding) { return shells.get(binding.id); },
      requestDraftInitialization(binding, options) { shells.get(binding.ctx.id).restoreDraft(options); },
    },
    rebindDraftFiles(id, attachmentIds) { for (const file of attachmentIds) fileOwners.set(file, id); },
    resolveDraftAttachments(ids) { return ids.map(id => attachmentEntries.get(id)).filter(Boolean); },
    createDrafts(id, files) {
      copiedDrafts.push({ id, files });
      return files.map(file => {
        const entry = { id: `fresh-file-${++freshFileIndex}`, file };
        attachmentEntries.set(entry.id, entry); fileOwners.set(entry.id, id); uploads[entry.id] = { status: 'uploaded' };
        return entry;
      });
    },
    async sendSession(session, text, attachmentIds, mode, signal) {
      sinkCalls.push({ id: session.id, text, attachmentIds: clone(attachmentIds), mode, signal });
      const outcome = await f.sendSession(session, text, attachmentIds, mode, signal);
      if (outcome.kind === 'success') {
        byId[session.id].blank = false;
        for (const attachmentId of attachmentIds) attachmentEntries.delete(attachmentId);
      }
      return outcome;
    },
  };
  const ctx = {
    sessions: {
      list: { getSnapshot() { return { ids: Object.keys(byId), byId }; } },
      retainInfo(id) { return { getSnapshot() { return { retainedBy: { mainView: id === currentId ? 1 : 0 } }; } }; },
      binding(id) { return { ctx: { id } }; },
      async create(options) {
        creates.push(clone(options));
        const id = options.sessionId || `new-${++createdIndex}`;
        if (!shells.has(id)) addSession(id, blank(), options.cwd);
        return id;
      },
      retain(id) {
        const ref = { id, ready: Promise.resolve(), binding: { ctx: { id }, session: { id } }, released: false, release() { this.released = true; } };
        retains.push(ref); return ref;
      },
    },
    layout: { beginNavigation() { const controller = new AbortController(); navigation.push(controller); return controller.signal; } },
    get(name) { assert.equal(name, 'conversation'); return conversation; },
    uiWorkspace: { openSession(id) { opened.push(id); navigate(id); } },
  };
  const f = {
    ctx, storage, shells, source, other, requests, creates, opened, notifications, retains, fileOwners, sinkCalls, copiedDrafts,
    navigate, addSession, current: () => currentId,
    setAdmission(value) { defaultAdmission = value; },
    registerFile(id, file, owner = 'temporary-a') { attachmentEntries.set(id, { id, file }); fileOwners.set(id, owner); uploads[id] = { status: 'uploaded' }; },
    attachment(id) { return attachmentEntries.get(id); },
    setUpload(id, value) { uploads[id] = value; for (const fn of uploadListeners) fn(); },
    request: async (_path, body) => ({ cwd: `/managed/${body.requestId}` }),
    sendSession: async () => ({ kind: 'success' }),
    copySettings: async () => {},
  };
  function newController() {
    const controller = new ProjectlessDrafts(ctx, {
      storage,
      request(path, body, signal) { requests.push({ path, body: clone(body), signal }); return f.request(path, body, signal); },
    });
    controller.copySettings = (...args) => f.copySettings(...args);
    t.after(() => controller.dispose());
    return controller;
  }
  f.newController = newController;
  f.state = newController();
  f.state.mark('temporary-a'); f.state.mark('temporary-b');
  f.install = (id = 'temporary-a', state = f.state) => { const uninstall = state.installSubmit(id); t.after(uninstall); return shells.get(id); };
  f.finish = (id = 'temporary-a', state = f.state) => until(() => !state.isBusy(id));
  return f;
}

test('first submit is singleflight and transfers one original draft with attachment ownership', async t => {
  const f = fixture(t), gate = deferred(), original = f.source.captureDraft();
  f.request = () => gate.promise;
  const shell = f.install();
  shell.submit('queue', 'first'); shell.submit('interrupt', 'duplicate'); shell.submit();
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.source.captureDraft(), original);
  assert.deepEqual(f.opened, []);
  gate.resolve({ cwd: '/managed/独立聊天' });
  await f.finish();
  assert.equal(f.creates.length, 1);
  const targetId = f.creates[0].sessionId, target = f.shells.get(targetId);
  assert.deepEqual(target.submissions, [{ mode: 'queue', args: ['first'], input: original }]);
  assert.deepEqual(f.source.submissions, []);
  assert.deepEqual(f.source.captureDraft(), blank());
  assert.equal(f.fileOwners.get('file-a'), targetId);
  assert.deepEqual(f.opened, [targetId]);
  assert.equal(target.focused, 1);
  assert.equal(f.state.isDraft('temporary-a'), false);
  assert.ok(f.retains.every(ref => ref.released));
});

test('native admission remains busy without clearing or leaving the source until success', async t => {
  const f = fixture(t), original = f.source.captureDraft();
  f.setAdmission('manual');
  f.install().submit('interrupt', 'first');
  await until(() => f.creates.length === 1 && f.shells.get(f.creates[0].sessionId).submissions.length === 1);
  const targetId = f.creates[0].sessionId, target = f.shells.get(targetId);
  assert.equal(f.state.isBusy('temporary-a'), true);
  assert.equal(f.current(), 'temporary-a');
  assert.equal(f.state.isDraft('temporary-a'), true);
  assert.deepEqual(f.source.captureDraft(), original);
  assert.deepEqual(f.opened, []);
  f.source.submit('queue', 'duplicate');
  assert.equal(f.requests.length, 1);
  assert.equal(target.submissions.length, 1);
  target.completeAdmission('success'); await f.finish();
  assert.deepEqual(target.submissions[0], { mode: 'interrupt', args: ['first'], input: original });
  assert.deepEqual(f.source.captureDraft(), blank());
  assert.equal(f.state.isDraft('temporary-a'), false);
  assert.equal(f.current(), targetId);
  assert.deepEqual(f.opened, [targetId]);
  assert.equal(f.fileOwners.get('file-a'), targetId);
});

test('source text changed while native admission is pending remains a new draft with a new identity', async t => {
  const f = fixture(t);
  const original = { draft: '已经开始发送的旧原稿', occurrences: [], attachmentIds: [] };
  const edited = { draft: '等待期间编辑的新原稿', occurrences: [{ start: 0, end: 4 }], attachmentIds: [] };
  f.source.restoreDraft(original); f.setAdmission('manual'); f.install().submit();
  await until(() => f.creates.length === 1 && f.shells.get(f.creates[0].sessionId).submissions.length === 1);
  const originalChoice = { ...f.state.drafts['temporary-a'] }, target = f.shells.get(f.creates[0].sessionId);
  f.source.restoreDraft(edited);
  target.completeAdmission('success'); await f.finish();
  assert.deepEqual(target.submissions[0].input, original);
  assert.equal(target.submissions.length, 1);
  assert.deepEqual(f.source.captureDraft(), edited);
  assert.equal(f.state.isDraft('temporary-a'), true);
  assert.equal(f.current(), 'temporary-a');
  assert.deepEqual(f.opened, []);
  assert.equal(f.state.isManaged(originalChoice.sessionId), true);
  const newChoice = f.state.drafts['temporary-a'];
  assert.notEqual(newChoice.requestId, originalChoice.requestId);
  assert.notEqual(newChoice.sessionId, originalChoice.sessionId);
  assert.ok(f.notifications.some(item => item.level === 'info' && item.message.includes('新的草稿已保留')));
  f.setAdmission('success'); f.source.submit(); await f.finish();
  assert.equal(f.requests[1].body.requestId, newChoice.requestId);
  assert.equal(f.creates[1].sessionId, newChoice.sessionId);
  assert.deepEqual(f.shells.get(newChoice.sessionId).submissions[0].input, edited);
  assert.deepEqual(f.opened, [newChoice.sessionId]);
});

test('source edits retaining admitted image and file attachments recreate fresh IDs without losing content', async t => {
  const f = fixture(t);
  const image = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'image.png', { type: 'image/png' });
  const document = new File(['用户的文档内容'], 'document.txt', { type: 'text/plain' });
  const added = new File(['等待期间添加的新附件'], 'new.txt', { type: 'text/plain' });
  f.registerFile('submitted-image', image); f.registerFile('submitted-file', document); f.registerFile('new-file', added);
  const original = { draft: '旧消息和图文附件', occurrences: [], attachmentIds: ['submitted-image', 'submitted-file'] };
  const edited = { draft: '新消息继续保留图文附件', occurrences: [{ start: 0, end: 3 }], attachmentIds: [...original.attachmentIds, 'new-file'] };
  f.source.restoreDraft(original); f.setAdmission('manual'); f.install().submit();
  await until(() => f.creates.length === 1 && f.shells.get(f.creates[0].sessionId).submissions.length === 1);
  const originalChoice = { ...f.state.drafts['temporary-a'] }, target = f.shells.get(originalChoice.sessionId);
  f.source.restoreDraft(edited);
  target.completeAdmission('success'); await f.finish();
  assert.deepEqual(target.submissions[0].input, original);
  assert.equal(f.attachment('submitted-image'), undefined, 'native admission releases the old image draft');
  assert.equal(f.attachment('submitted-file'), undefined, 'native admission releases the old file draft');
  const remaining = f.source.captureDraft();
  assert.equal(remaining.draft, edited.draft);
  assert.deepEqual(remaining.occurrences, edited.occurrences);
  assert.equal(remaining.attachmentIds.length, 3);
  assert.notEqual(remaining.attachmentIds[0], original.attachmentIds[0]);
  assert.notEqual(remaining.attachmentIds[1], original.attachmentIds[1]);
  assert.equal(remaining.attachmentIds[2], 'new-file');
  assert.equal(f.copiedDrafts.length, 2);
  assert.ok(f.copiedDrafts.every(call => call.id === 'temporary-a'));
  assert.equal(f.copiedDrafts[0].files[0], image);
  assert.equal(f.copiedDrafts[1].files[0], document);
  for (const [index, expected] of [image, document, added].entries()) {
    const id = remaining.attachmentIds[index], actual = f.attachment(id).file;
    assert.equal(actual.name, expected.name);
    assert.equal(actual.type, expected.type);
    assert.deepEqual(Buffer.from(await actual.arrayBuffer()), Buffer.from(await expected.arrayBuffer()));
    assert.equal(f.fileOwners.get(id), 'temporary-a');
  }
  assert.equal(f.state.isDraft('temporary-a'), true);
  assert.equal(f.current(), 'temporary-a');
  assert.deepEqual(f.opened, []);
  const newChoice = f.state.drafts['temporary-a'];
  assert.notEqual(newChoice.requestId, originalChoice.requestId);
  assert.notEqual(newChoice.sessionId, originalChoice.sessionId);
  f.setAdmission('success'); f.source.submit(); await f.finish();
  assert.equal(f.requests[1].body.requestId, newChoice.requestId);
  assert.deepEqual(f.shells.get(newChoice.sessionId).submissions[0].input, remaining);
  assert.deepEqual(f.opened, [newChoice.sessionId]);
});

test('native admission failure leaves a reachable source that can reopen and retry the same IDs', async t => {
  const f = fixture(t), original = f.source.captureDraft();
  f.setAdmission('manual'); f.install().submit();
  await until(() => f.creates.length === 1 && f.shells.get(f.creates[0].sessionId).submissions.length === 1);
  const targetId = f.creates[0].sessionId, target = f.shells.get(targetId);
  target.completeAdmission('error', 'server rejected first admission'); await f.finish();
  assert.equal(f.current(), 'temporary-a');
  assert.equal(f.state.isDraft('temporary-a'), true);
  assert.deepEqual(f.source.captureDraft(), original);
  assert.deepEqual(target.captureDraft(), blank());
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
  assert.deepEqual(f.opened, []);
  assert.ok(f.notifications.some(item => item.message === 'server rejected first admission'));
  f.navigate('elsewhere'); f.navigate('temporary-a');
  assert.deepEqual(f.source.captureDraft(), original);
  target.admission = 'success'; f.source.submit(); await f.finish();
  assert.equal(f.requests[0].body.requestId, f.requests[1].body.requestId);
  assert.equal(f.creates[0].sessionId, f.creates[1].sessionId);
  assert.equal(target.submissions.length, 2);
  assert.deepEqual(target.submissions[1].input, original);
  assert.deepEqual(f.opened, [targetId]);
});

test('navigation while native admission is pending does not get stolen by late success', async t => {
  const f = fixture(t), original = f.source.captureDraft();
  f.setAdmission('manual'); f.install().submit();
  await until(() => f.creates.length === 1 && f.shells.get(f.creates[0].sessionId).submissions.length === 1);
  const targetId = f.creates[0].sessionId, target = f.shells.get(targetId);
  f.navigate('elsewhere');
  assert.deepEqual(f.source.captureDraft(), original);
  assert.equal(f.state.isBusy('temporary-a'), true);
  target.completeAdmission('success'); await f.finish();
  assert.equal(f.current(), 'elsewhere');
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.source.captureDraft(), blank());
  assert.equal(f.state.isDraft('temporary-a'), false);
  assert.equal(f.fileOwners.get('file-a'), targetId);
});

test('navigation while native admission is pending retains the source on late failure', async t => {
  const f = fixture(t), original = f.source.captureDraft();
  f.setAdmission('manual'); f.install().submit();
  await until(() => f.creates.length === 1 && f.shells.get(f.creates[0].sessionId).submissions.length === 1);
  const target = f.shells.get(f.creates[0].sessionId);
  f.navigate('elsewhere'); target.completeAdmission('error'); await f.finish();
  assert.equal(f.current(), 'elsewhere');
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.source.captureDraft(), original);
  assert.deepEqual(target.captureDraft(), blank());
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
  assert.equal(f.state.isDraft('temporary-a'), true);
  f.navigate('temporary-a');
  assert.deepEqual(f.source.captureDraft(), original);
});

test('copy failure retains source draft and attachments; retry reuses directory request and target IDs', async t => {
  const f = fixture(t), original = f.source.captureDraft();
  f.copySettings = async () => { throw Error('settings copy failed'); };
  f.install().submit(); await f.finish();
  const targetId = f.creates[0].sessionId;
  assert.deepEqual(f.source.captureDraft(), original);
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
  assert.deepEqual(f.shells.get(targetId).captureDraft(), blank());
  assert.deepEqual(f.shells.get(targetId).submissions, []);
  assert.deepEqual(f.opened, []);
  assert.ok(f.notifications.some(item => item.message === 'settings copy failed'));
  assert.ok(f.retains.every(ref => ref.released));
  f.copySettings = async () => {};
  f.source.submit(); await f.finish();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].body.requestId, f.requests[1].body.requestId);
  assert.equal(f.creates[1].sessionId, targetId);
  assert.equal(f.shells.get(targetId).submissions.length, 1);
  assert.deepEqual(f.shells.get(targetId).submissions[0].input, original);
});

test('late directory response after navigation cannot take back the current chat', async t => {
  const f = fixture(t), gate = deferred(), original = f.source.captureDraft();
  f.request = () => gate.promise;
  f.install().submit();
  f.navigate('elsewhere');
  gate.resolve({ cwd: '/managed/late' }); await f.finish();
  assert.deepEqual(f.creates, []);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.source.captureDraft(), original);
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
  assert.equal(f.state.isDraft('temporary-a'), true);
});

test('late settings copy after navigation does not transfer or submit a draft', async t => {
  const f = fixture(t), gate = deferred(), original = f.source.captureDraft();
  let copying = false;
  f.copySettings = () => { copying = true; return gate.promise; };
  f.install().submit(); await until(() => copying);
  f.navigate('elsewhere'); gate.resolve(); await f.finish();
  const target = f.shells.get(f.creates[0].sessionId);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(target.captureDraft(), blank());
  assert.deepEqual(target.submissions, []);
  assert.deepEqual(f.source.captureDraft(), original);
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
});

test('storage rejection before ownership transfer preserves the source and permits the same retry', async t => {
  const f = fixture(t), original = f.source.captureDraft();
  f.storage.rejectWrites = true;
  f.install().submit(); await f.finish();
  assert.deepEqual(f.source.captureDraft(), original);
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
  assert.equal(f.state.isDraft('temporary-a'), true);
  assert.deepEqual(f.opened, []);
  const targetId = f.creates[0].sessionId;
  assert.deepEqual(f.shells.get(targetId).submissions, []);
  assert.ok(f.notifications.some(item => item.message === 'storage refused'));
  f.storage.rejectWrites = false;
  f.source.submit(); await f.finish();
  assert.equal(f.requests[0].body.requestId, f.requests[1].body.requestId);
  assert.equal(f.creates[1].sessionId, targetId);
  assert.deepEqual(f.shells.get(targetId).submissions[0].input, original);
});

test('storage rejection after native success cannot turn admission into a replayable failure', async t => {
  const f = fixture(t);
  f.setAdmission('manual'); f.install().submit();
  await until(() => f.creates.length === 1 && f.shells.get(f.creates[0].sessionId).submissions.length === 1);
  const targetId = f.creates[0].sessionId, target = f.shells.get(targetId);
  f.storage.rejectWrites = true;
  target.completeAdmission('success'); await f.finish();
  assert.deepEqual(f.source.captureDraft(), blank());
  assert.equal(f.state.isDraft('temporary-a'), false);
  assert.equal(f.fileOwners.get('file-a'), targetId);
  assert.deepEqual(f.opened, [targetId]);
  assert.equal(target.submissions.length, 1);
  assert.equal(f.requests.length, 1);
  assert.ok(!f.notifications.some(item => item.message === 'storage refused'));
  const restored = f.newController();
  assert.equal(restored.isDraft('temporary-a'), false, 'persisted stale retry identity must not replay an admitted target');
});

test('storage rejection while marking a blank carrier does not allocate or navigate', async t => {
  const f = fixture(t);
  f.storage.rejectWrites = true;
  await f.state.startDraft('temporary-a');
  assert.equal(f.requests.length, 0);
  assert.equal(f.creates.length, 1);
  assert.equal(f.state.isDraft('new-1'), false);
  assert.deepEqual(f.opened, []);
  assert.ok(f.notifications.some(item => item.message === 'storage refused'));
});

test('empty and whitespace-only drafts do not allocate a directory', async t => {
  const f = fixture(t), source = f.install();
  for (const draft of ['', '  \n  ']) {
    source.restoreDraft({ ...blank(), draft }); source.submit();
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.requests.length, 0);
  assert.equal(f.creates.length, 0);
  assert.deepEqual(f.source.submissions, []);
  assert.equal(f.state.isBusy('temporary-a'), false);
});

test('an attachment-only first message uses the native sink and transfers image and text attachments', async t => {
  const f = fixture(t);
  const draft = { ...blank(), attachmentIds: ['image-a', 'text-a'] };
  for (const id of draft.attachmentIds) { f.fileOwners.set(id, 'temporary-a'); f.setUpload(id, { status: 'uploaded' }); }
  f.source.restoreDraft(draft);
  f.install().submit('interrupt'); await f.finish();
  const targetId = f.creates[0].sessionId;
  assert.equal(f.requests.length, 1);
  assert.equal(f.sinkCalls.length, 1);
  assert.equal(f.sinkCalls[0].id, targetId);
  assert.equal(f.sinkCalls[0].text, '');
  assert.equal(f.sinkCalls[0].mode, 'interrupt');
  assert.deepEqual(f.sinkCalls[0].attachmentIds, draft.attachmentIds);
  assert.deepEqual(f.shells.get(targetId).submissions, []);
  assert.deepEqual(f.source.captureDraft(), blank());
  assert.deepEqual(f.shells.get(targetId).captureDraft(), blank());
  for (const id of draft.attachmentIds) assert.equal(f.fileOwners.get(id), targetId);
});

test('attachment-only admission failure restores the source and retry keeps its request and target', async t => {
  const f = fixture(t), gate = deferred();
  const draft = { ...blank(), attachmentIds: ['image-a', 'text-a'] };
  for (const id of draft.attachmentIds) { f.fileOwners.set(id, 'temporary-a'); f.setUpload(id, { status: 'uploaded' }); }
  f.source.restoreDraft(draft); f.sendSession = () => gate.promise;
  f.install().submit(); await until(() => f.sinkCalls.length === 1);
  const targetId = f.creates[0].sessionId;
  assert.deepEqual(f.source.captureDraft(), draft);
  assert.equal(f.current(), 'temporary-a');
  assert.equal(f.state.isBusy('temporary-a'), true);
  assert.deepEqual(f.opened, []);
  gate.resolve({ kind: 'error', text: 'attachment admission failed' }); await f.finish();
  assert.deepEqual(f.source.captureDraft(), draft);
  assert.deepEqual(f.shells.get(targetId).captureDraft(), blank());
  for (const id of draft.attachmentIds) assert.equal(f.fileOwners.get(id), 'temporary-a');
  assert.equal(f.state.isDraft('temporary-a'), true);
  assert.ok(f.notifications.some(item => item.message === 'attachment admission failed'));
  f.navigate('elsewhere'); f.navigate('temporary-a');
  f.sendSession = async () => ({ kind: 'success' });
  f.source.submit(); await f.finish();
  assert.equal(f.requests[0].body.requestId, f.requests[1].body.requestId);
  assert.equal(f.creates[0].sessionId, f.creates[1].sessionId);
  assert.equal(f.sinkCalls.length, 2);
  assert.deepEqual(f.sinkCalls[1].attachmentIds, draft.attachmentIds);
  assert.deepEqual(f.source.captureDraft(), blank());
  assert.deepEqual(f.opened, [targetId]);
  for (const id of draft.attachmentIds) assert.equal(f.fileOwners.get(id), targetId);
});

test('attachment migration failure retains the original draft and restores source ownership', async t => {
  const f = fixture(t), original = f.source.captureDraft();
  f.setUpload('file-a', { status: 'error', message: 'attachment copy failed' });
  f.install().submit(); await f.finish();
  assert.deepEqual(f.source.captureDraft(), original);
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.shells.get(f.creates[0].sessionId).captureDraft(), blank());
  assert.deepEqual(f.shells.get(f.creates[0].sessionId).submissions, []);
  assert.ok(f.notifications.some(item => item.message === 'attachment copy failed'));
  f.setUpload('file-a', { status: 'uploaded' });
  f.source.submit(); await f.finish();
  assert.equal(f.requests[0].body.requestId, f.requests[1].body.requestId);
  assert.equal(f.creates[0].sessionId, f.creates[1].sessionId);
  assert.deepEqual(f.shells.get(f.creates[1].sessionId).submissions[0].input, original);
});

test('navigation during attachment migration cancels admission and restores source ownership', async t => {
  const f = fixture(t), original = f.source.captureDraft();
  f.setUpload('file-a', { status: 'uploading' });
  f.install().submit();
  await until(() => f.fileOwners.get('file-a') !== 'temporary-a');
  assert.equal(f.state.isBusy('temporary-a'), true);
  assert.deepEqual(f.opened, []);
  f.navigate('elsewhere'); await f.finish();
  assert.deepEqual(f.source.captureDraft(), original);
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
  assert.deepEqual(f.shells.get(f.creates[0].sessionId).submissions, []);
  assert.deepEqual(f.opened, []);
});

test('different temporary chats keep independent requests and draft ownership during concurrent sends', async t => {
  const f = fixture(t), a = deferred(), b = deferred();
  const originalA = f.source.captureDraft(), originalB = f.other.captureDraft();
  f.request = (_path, body) => body.prompt === originalA.draft ? a.promise : b.promise;
  f.install('temporary-a').submit();
  f.navigate('temporary-b'); f.install('temporary-b').submit();
  assert.equal(f.requests.length, 2);
  assert.notEqual(f.requests[0].body.requestId, f.requests[1].body.requestId);
  a.resolve({ cwd: '/managed/a' }); b.resolve({ cwd: '/managed/b' });
  await Promise.all([f.finish('temporary-a'), f.finish('temporary-b')]);
  assert.deepEqual(f.source.captureDraft(), originalA);
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
  const targetB = f.creates[0].sessionId;
  assert.deepEqual(f.shells.get(targetB).submissions[0].input, originalB);
  assert.equal(f.fileOwners.get('file-b'), targetB);
  f.navigate('temporary-a'); f.source.submit(); await f.finish();
  assert.equal(f.requests[2].body.requestId, f.requests[0].body.requestId);
  const targetA = f.creates[1].sessionId;
  assert.notEqual(targetA, targetB);
  assert.deepEqual(f.shells.get(targetA).submissions[0].input, originalA);
  assert.equal(f.fileOwners.get('file-a'), targetA);
});

test('source edits made during admission are retained instead of sending the old snapshot', async t => {
  const f = fixture(t), gate = deferred();
  let copying = false;
  f.copySettings = () => { copying = true; return gate.promise; };
  f.install().submit(); await until(() => copying);
  const edited = { draft: '用户刚改了原稿', occurrences: [], attachmentIds: ['file-a'] };
  f.source.restoreDraft(edited); gate.resolve(); await f.finish();
  assert.deepEqual(f.source.captureDraft(), edited);
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.shells.get(f.creates[0].sessionId).submissions, []);
  assert.ok(f.notifications.some(item => item.message.includes('草稿已变化')));
});

test('an existing target draft is preserved when a retry encounters it', async t => {
  const f = fixture(t), original = f.source.captureDraft();
  const targetId = f.state.drafts['temporary-a'].sessionId;
  const targetDraft = { draft: '目标自己的原稿', occurrences: [], attachmentIds: ['target-file'] };
  f.addSession(targetId, targetDraft);
  f.install().submit(); await f.finish();
  assert.deepEqual(f.source.captureDraft(), original);
  assert.deepEqual(f.shells.get(targetId).captureDraft(), targetDraft);
  assert.equal(f.fileOwners.get('file-a'), 'temporary-a');
  assert.equal(f.fileOwners.get('target-file'), targetId);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.shells.get(targetId).submissions, []);
});

test('a controller reconstructed from storage retries with the original request and target IDs', async t => {
  const f = fixture(t);
  f.copySettings = async () => { throw Error('first failed'); };
  const originalState = f.state;
  await originalState.send('temporary-a', f.source, 'queue', []);
  originalState.dispose();
  f.copySettings = async () => {};
  const restored = f.newController();
  await restored.send('temporary-a', f.source, 'queue', []);
  assert.equal(f.requests[0].body.requestId, f.requests[1].body.requestId);
  assert.equal(f.creates[0].sessionId, f.creates[1].sessionId);
  assert.equal(f.shells.get(f.creates[1].sessionId).submissions.length, 1);
});

test('ordinary submission waits for success rather than a cleared input state', async t => {
  const f = fixture(t), shell = f.source, signal = new AbortController().signal;
  shell.admission = 'manual';
  let settled = false;
  const result = submitDraft(shell, 'queue', [], signal).then(() => { settled = true; });
  shell.restoreDraft(blank());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  shell.completeAdmission('success'); await result;
  assert.equal(settled, true);
});

test('slash command admission succeeds through native input state without an ordinary event', async t => {
  const f = fixture(t), shell = f.source;
  shell.command = true; shell.admission = 'manual';
  shell.restoreDraft({ ...blank(), draft: '/status' });
  const result = submitDraft(shell, 'queue', [], new AbortController().signal);
  assert.equal(shell.state.getSnapshot().phase, 'adjudicating');
  shell.completeAdmission('success'); await result;
  assert.deepEqual(shell.captureDraft(), blank());
});

test('slash command error notices reject admission and retain its draft', async t => {
  const f = fixture(t), shell = f.source;
  shell.command = true; shell.admission = 'manual';
  const original = { ...blank(), draft: '/unsupported' };
  shell.restoreDraft(original);
  const result = submitDraft(shell, 'queue', [], new AbortController().signal);
  const rejected = assert.rejects(result, /unknown command/);
  shell.completeAdmission('error', 'unknown command'); await rejected;
  assert.deepEqual(shell.captureDraft(), original);
});

test('native submission throws and lifetime aborts reject admission without losing the draft', async t => {
  const f = fixture(t), shell = f.source, original = shell.captureDraft();
  shell.admission = 'throw';
  await assert.rejects(submitDraft(shell, 'queue', [], new AbortController().signal), /native submit threw/);
  assert.deepEqual(shell.captureDraft(), original);
  shell.admission = 'manual';
  const lifetime = new AbortController();
  const result = submitDraft(shell, 'queue', [], lifetime.signal);
  const rejected = assert.rejects(result, /disposed/);
  lifetime.abort(Error('disposed')); await rejected;
  assert.deepEqual(shell.captureDraft(), original);
});

function permissionsFixture(t, sourceValue, targetValue) {
  const events = [], commands = [], listeners = new Set();
  let currentValue = targetValue;
  const lifetime = new AbortController();
  t.after(() => lifetime.abort());
  const selection = {
    getSnapshot() { return { currentValue }; },
    subscribe(fn) {
      events.push('subscribe'); listeners.add(fn);
      return () => { events.push('unsubscribe'); listeners.delete(fn); };
    },
    set(value) { currentValue = value; for (const fn of listeners) fn(); },
  };
  const source = { projections: { faceOf(name) { assert.equal(name, 'permissions'); return { getSnapshot: () => ({ currentValue: sourceValue }) }; } } };
  const f = {
    source, selection, lifetime, events, commands,
    subscriptions: () => listeners.size,
    command: async () => ({ ok: true, value: { matched: true } }),
  };
  f.target = {
    projections: { faceOf(name) { assert.equal(name, 'permissions'); return selection; } },
    command(text) { commands.push(text); events.push('command'); return f.command(text); },
  };
  return f;
}

test('permission presets already matching need no command or projection subscription', async t => {
  for (const value of ['standard', 'unrestricted', undefined]) {
    const f = permissionsFixture(t, value, value);
    await copyPermissions(f.source, f.target, f.lifetime.signal);
    assert.deepEqual(f.commands, []);
    assert.deepEqual(f.events, []);
    assert.equal(f.subscriptions(), 0);
  }
});

test('different permission presets issue a command before waiting and require a matching projection', async t => {
  const f = permissionsFixture(t, 'unrestricted', 'standard'), gate = deferred();
  f.command = () => gate.promise;
  let settled = false;
  const result = copyPermissions(f.source, f.target, f.lifetime.signal).then(() => { settled = true; });
  assert.deepEqual(f.commands, ['/permission unrestricted']);
  assert.deepEqual(f.events, ['command']);
  assert.equal(f.subscriptions(), 0, 'projection wait begins after command admission');
  gate.resolve({ ok: true, value: { matched: true } });
  await until(() => f.subscriptions() === 1);
  assert.equal(settled, false, 'matched only confirms command recognition, not the permission state');
  f.selection.set('sandboxed');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'an unrelated projection must not admit a user message');
  f.selection.set('unrestricted'); await result;
  assert.equal(settled, true);
  assert.equal(f.subscriptions(), 0);
  assert.deepEqual(f.events, ['command', 'subscribe', 'unsubscribe']);
  assert.deepEqual(f.commands, ['/permission unrestricted']);
});

test('an early permission projection still waits for command success', async t => {
  const f = permissionsFixture(t, 'unrestricted', 'standard'), gate = deferred();
  f.command = () => gate.promise;
  let settled = false;
  const result = copyPermissions(f.source, f.target, f.lifetime.signal).then(() => { settled = true; });
  f.selection.set('unrestricted');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(f.subscriptions(), 0);
  gate.resolve({ ok: true, value: { matched: true } }); await result;
  assert.equal(settled, true);
  assert.equal(f.subscriptions(), 0);
});

test('custom permission policies explicitly reject without running a preset command', async t => {
  for (const target of ['standard', 'custom']) {
    const f = permissionsFixture(t, 'custom', target);
    await assert.rejects(copyPermissions(f.source, f.target, f.lifetime.signal), /请先选择一个权限预设.*草稿已保留/);
    assert.deepEqual(f.commands, []);
    assert.equal(f.subscriptions(), 0);
  }
});

test('failed or unmatched permission commands reject without waiting for projection settlement', async t => {
  for (const scenario of [
    { outcome: { ok: false, error: { message: 'permission command failed' } }, expected: /permission command failed/ },
    { outcome: { ok: true, value: { matched: false } }, expected: /无法保留当前权限设置.*草稿已保留/ },
    { error: Error('permission command transport failed'), expected: /permission command transport failed/ },
  ]) {
    const f = permissionsFixture(t, 'unrestricted', 'standard');
    f.command = async () => { if (scenario.error) throw scenario.error; return scenario.outcome; };
    await assert.rejects(copyPermissions(f.source, f.target, f.lifetime.signal), scenario.expected);
    assert.deepEqual(f.commands, ['/permission unrestricted']);
    assert.equal(f.subscriptions(), 0);
    assert.deepEqual(f.events, ['command']);
  }
});

test('aborting permission projection settlement rejects and releases its subscription', async t => {
  const f = permissionsFixture(t, 'unrestricted', 'standard');
  const result = copyPermissions(f.source, f.target, f.lifetime.signal);
  const rejected = assert.rejects(result, /权限设置未同步.*草稿已保留/);
  await until(() => f.subscriptions() === 1);
  f.lifetime.abort(Error('navigation cancelled')); await rejected;
  assert.equal(f.subscriptions(), 0);
  assert.deepEqual(f.events, ['command', 'subscribe', 'unsubscribe']);
  f.selection.set('unrestricted');
  assert.equal(f.subscriptions(), 0);
  assert.equal(f.commands.length, 1);
});
