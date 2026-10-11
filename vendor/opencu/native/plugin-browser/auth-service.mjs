import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { localCredentialPlan, localCredentialMetadata, matchesCredentialRegistration, wipeCredential } from './auth-credentials.mjs';

export const AUTH_BROKER_METHODS = new Set(['browser.authBroker.bind', 'browser.authBroker.register',
  'browser.authBroker.wait', 'browser.authBroker.complete', 'browser.authBroker.close',
  'browser.authBroker.present', 'browser.authBroker.status', 'browser.authBroker.qrCodeSnapshot']);

const CHALLENGE_ID = /^[A-Za-z0-9_-]{32,128}$/;
const FIELD_ID = /^[A-Za-z0-9_-]{1,48}$/;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const TYPES = new Set(['text', 'password', 'email', 'tel', 'number', 'url']);
const STATUSES = new Set(['submitted', 'declined', 'cancelled', 'unavailable', 'expired',
  'origin_changed', 'page_changed', 'locator_invalid', 'submission_failed']);
const MAX_SESSIONS = 128;
const require = createRequire(import.meta.url);
let qrWriter;
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => Object.assign(new Error('Private browser authentication is unavailable'),
  { code: 'BROWSER_AUTH_UNAVAILABLE' });
const identifier = value => typeof value === 'string' && FIELD_ID.test(value) && !RESERVED_IDS.has(value);
const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const equal = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

function qrPayload(value) {
  if (typeof value !== 'string' || !value.length || Buffer.byteLength(value, 'utf8') > 32768) throw unavailable();
  return value;
}

function qrUrl(payload) {
  try {
    const url = new URL(payload);
    if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) return payload;
  } catch {}
  return undefined;
}

async function encodeQr(payload) {
  qrWriter ??= (async () => {
    const writer = await import('zxing-wasm/writer');
    const bytes = await readFile(require.resolve('zxing-wasm/writer/zxing_writer.wasm'));
    await writer.prepareZXingModule({ overrides: {
      wasmBinary: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      print: () => {}, printErr: () => {},
    } });
    return writer;
  })().catch(() => { qrWriter = undefined; throw unavailable(); });
  const writer = await qrWriter;
  let output;
  try { output = await writer.writeBarcode(payload, { format: 'QRCode', scale: 4, addQuietZones: true }); }
  catch { throw unavailable(); }
  if (output?.error || !output?.image || typeof output.image.arrayBuffer !== 'function') throw unavailable();
  const bytes = Buffer.from(await output.image.arrayBuffer());
  if (bytes.length < 8 || bytes.length > 4 * 1024 * 1024
    || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw unavailable();
  return 'data:image/png;base64,' + bytes.toString('base64');
}

function deferred() {
  let resolve, reject, settled = false;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => {});
  return { promise, resolve(value) { if (!settled) { settled = true; resolve(value); } },
    reject(error) { if (!settled) { settled = true; reject(error); } } };
}

function wipe(values) {
  for (const key of Object.keys(values ?? {})) { values[key] = ''; delete values[key]; }
}

function origin(value) {
  if (typeof value !== 'string') throw unavailable();
  let parsed;
  try { parsed = new URL(value); } catch { throw unavailable(); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.origin !== value) throw unavailable();
  return value;
}

function scope(params) {
  if (!object(params) || !Number.isSafeInteger(params.tabId) || params.tabId <= 0
    || !identity(params.leaseId) || !identity(params.actorId) || !identity(params.sessionId)) throw unavailable();
  return { tabId: params.tabId, leaseId: params.leaseId, actorId: params.actorId, sessionId: params.sessionId };
}

function sameScope(left, right) {
  return ['tabId', 'leaseId', 'actorId', 'sessionId'].every(key => left[key] === right[key]);
}

function sameDocument(left, right) {
  return left.tab === right.tab && ['tabId', 'frameId', 'loaderId', 'targetId', 'documentGeneration',
    'documentBackendNodeId', 'origin', 'frameOrigin'].every(key => left[key] === right[key]);
}

function checkBinding(binding, tabId, protectedDocument) {
  if (!object(binding) || !object(binding.tab) || binding.tabId !== tabId
    || !identity(binding.frameId) || !identity(binding.loaderId) || !identity(binding.targetId)
    || !Number.isSafeInteger(binding.documentBackendNodeId) || binding.documentBackendNodeId <= 0
    || !Number.isSafeInteger(binding.documentGeneration) || binding.documentGeneration < 0
    || typeof binding.assertCurrent !== 'function' || binding.assertCurrent() !== true) throw unavailable();
  origin(binding.origin); origin(binding.frameOrigin);
  if (protectedDocument && (typeof binding.assertProtected !== 'function'
    || binding.assertProtected() !== true)) throw unavailable();
}

function registration(input, boundScope) {
  if (!object(input) || input.type !== 'register' || !Array.isArray(input.fields) || input.fields.length > 6
    || !object(input.origins)) throw unavailable();
  const supported = new Set(['type', 'fields', 'options', 'origins', 'qr_code', 'manual_save_fields',
    'manual_save_session_id', 'credential_binding', 'email_otp_session_id']);
  if (Object.keys(input).some(key => !supported.has(key)) || input.qr_code != null && input.qr_code !== true
    || input.email_otp_session_id != null) throw unavailable();
  if (Object.keys(input.origins).some(key => !['origin', 'frame_origin'].includes(key))) throw unavailable();
  const fields = [], ids = new Set();
  for (const field of input.fields) {
    if (!object(field) || Object.keys(field).some(key => !['id', 'required'].includes(key))
      || !identifier(field.id) || ids.has(field.id) || typeof field.required !== 'boolean') throw unavailable();
    ids.add(field.id); fields.push({ id: field.id, required: field.required });
  }
  let options;
  if (input.options != null) {
    if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 10) throw unavailable();
    const optionIds = new Set();
    options = input.options.map(option => {
      if (!object(option) || Object.keys(option).some(key => !['id', 'field_ids'].includes(key))
        || !identifier(option.id) || optionIds.has(option.id) || !Array.isArray(option.field_ids)
        || option.field_ids.length > 6 || new Set(option.field_ids).size !== option.field_ids.length
        || option.field_ids.some(id => !ids.has(id))) throw unavailable();
      optionIds.add(option.id); return { id: option.id, field_ids: [...option.field_ids] };
    });
    const referenced = new Set(options.flatMap(option => option.field_ids));
    if (fields.some(field => field.required || !referenced.has(field.id))) throw unavailable();
  }
  if (!fields.length && !options && input.qr_code !== true) throw unavailable();
  const topOrigin = origin(input.origins.origin), frameOrigin = origin(input.origins.frame_origin);
  let manualSaveFields, credentialBinding;
  if (input.manual_save_fields != null || input.manual_save_session_id != null) {
    const manual = input.manual_save_fields;
    if (!object(manual) || Object.keys(manual).some(key => !['username', 'password'].includes(key))
      || !identifier(manual.password) || !ids.has(manual.password)
      || manual.username !== undefined && (!identifier(manual.username) || !ids.has(manual.username)
        || manual.username === manual.password)
      || input.manual_save_session_id !== boundScope.sessionId) throw unavailable();
    manualSaveFields = { password: manual.password, ...(manual.username ? { username: manual.username } : {}) };
  }
  if (input.credential_binding != null) {
    const native = input.credential_binding;
    if (!object(native) || Object.keys(native).some(key => !['fields', 'session_id', 'submission_origin', 'submission'].includes(key))
      || native.session_id !== boundScope.sessionId || origin(native.submission_origin) !== topOrigin
      || native.submission !== undefined && native.submission !== 'ordinary'
      || !Array.isArray(native.fields) || native.fields.length < 1 || native.fields.length > 2) throw unavailable();
    const boundIds = new Set(), kinds = new Set();
    const nativeFields = native.fields.map(field => {
      if (!object(field) || Object.keys(field).some(key => !['id', 'kind'].includes(key))
        || !identifier(field.id) || !ids.has(field.id) || boundIds.has(field.id)
        || !['username', 'password'].includes(field.kind) || kinds.has(field.kind)) throw unavailable();
      boundIds.add(field.id); kinds.add(field.kind); return { id: field.id, kind: field.kind };
    });
    if (!kinds.has('password') || native.submission === undefined && !kinds.has('username')) throw unavailable();
    credentialBinding = { fields: nativeFields, sessionId: native.session_id, submissionOrigin: topOrigin,
      ...(native.submission ? { submission: native.submission } : {}) };
    if (native.submission === 'ordinary' && (!manualSaveFields
      || manualSaveFields.password !== nativeFields.find(field => field.kind === 'password')?.id
      || manualSaveFields.username !== nativeFields.find(field => field.kind === 'username')?.id)) throw unavailable();
  }
  if ((manualSaveFields || credentialBinding) && (input.qr_code === true || !topOrigin.startsWith('https://')
    || topOrigin !== frameOrigin || !manualSaveFields?.username && manualSaveFields
      && (fields.length !== 1 || options))) throw unavailable();
  return { fields, ...(options ? { options } : {}),
    origin: topOrigin, frameOrigin, qrCode: input.qr_code === true, manualSaveFields, credentialBinding };
}

function publicPrompt(params, entry) {
  const input = params.meta ?? params.metadata ?? params;
  if (!object(input) || input.browser_auth_challenge_id !== undefined
    && input.browser_auth_challenge_id !== entry.id || input.challenge_id !== undefined
    && input.challenge_id !== entry.id || input.codex_approval_kind !== undefined
    && input.codex_approval_kind !== 'browser_auth' || !Array.isArray(input.fields)
    || input.fields.length > 6 || origin(input.origin) !== entry.registration.origin
    || origin(input.frame_origin) !== entry.registration.frameOrigin
    || input.otp_handle != null) throw unavailable();
  if (entry.registration.qrCode) {
    if (input.qr_code !== true || typeof input.qr_code_only !== 'boolean') throw unavailable();
    qrPayload(input.qr_code_payload);
    if (input.qr_code_only && (entry.registration.fields.length || entry.registration.options)) throw unavailable();
    if (input.qr_code_url !== undefined && input.qr_code_url !== qrUrl(input.qr_code_payload)) throw unavailable();
  } else if (input.qr_code != null || input.qr_code_payload != null || input.qr_code_only != null
    || input.qr_code_url != null) throw unavailable();
  const requested = new Map(entry.registration.fields.map(field => [field.id, field]));
  const fields = [], ids = new Set();
  for (const field of input.fields) {
    if (!object(field) || !identifier(field.id) || ids.has(field.id) || typeof field.label !== 'string'
      || field.label.length > 2048 || !TYPES.has(field.type) || typeof field.required !== 'boolean'
      || field.autocomplete != null && (typeof field.autocomplete !== 'string'
        || field.autocomplete.length > 256)) throw unavailable();
    ids.add(field.id);
    const registered = requested.get(field.id);
    if (!registered) {
      if (!entry.registration.options) throw unavailable();
      continue;
    }
    if (!entry.registration.options && field.required !== registered.required) throw unavailable();
    fields.push({ id: field.id, label: field.label, type: field.type, required: field.required,
      ...(field.autocomplete == null ? {} : { autocomplete: field.autocomplete }) });
  }
  if ([...requested.keys()].some(id => !ids.has(id))) throw unavailable();
  let options;
  if (entry.registration.options) {
    if (!Array.isArray(input.options) || input.options.length !== entry.registration.options.length) throw unavailable();
    options = input.options.map((option, index) => {
      const registered = entry.registration.options[index];
      if (!object(option) || option.id !== registered.id || typeof option.label !== 'string'
        || !option.label.trim() || option.label.length > 120 || !Array.isArray(option.field_ids)
        || !equal(option.field_ids, registered.field_ids)) throw unavailable();
      return { id: option.id, label: option.label, fieldIds: [...option.field_ids] };
    });
  } else if (input.options != null) throw unavailable();
  return { id: entry.id, origin: entry.registration.origin, frameOrigin: entry.registration.frameOrigin,
    fields, ...(options ? { options } : {}),
    ...(typeof input.locale === 'string' && input.locale.length <= 64 ? { locale: input.locale } : {}),
    ...(['light', 'dark'].includes(input.theme) ? { theme: input.theme } : {}) };
}

function uiOutcome(entry) {
  const saved = entry.saveProviderId ? { credentialSave: { providerId: entry.saveProviderId,
    status: entry.saveStatus ?? 'not-saved', ...(entry.savedAccountLabel !== undefined ? { accountLabel: entry.savedAccountLabel } : {}) } } : {};
  if (entry.status === 'submitted') return { id: entry.id, state: 'submitted', fillStatus: 'submitted',
    ...(entry.saveStatus ? { saveStatus: entry.saveStatus } : {}), ...saved };
  if (entry.status === 'declined') return { id: entry.id, state: 'skipped', fillStatus: 'not_submitted' };
  if (entry.status === 'cancelled' || entry.status === 'expired') return {
    id: entry.id, state: 'closed', fillStatus: entry.submitted ? 'unknown' : 'not_submitted', ...saved };
  return { id: entry.id, state: entry.submitted ? 'uncertain' : 'failed',
    fillStatus: entry.submitted ? 'unknown' : 'not_submitted', ...saved };
}

function elicitation(entry) {
  return { action: entry.status === 'declined' ? 'decline'
    : entry.status === 'cancelled' || entry.status === 'expired' ? 'cancel' : 'accept', content: {} };
}

// This service is reachable only through the authenticated parent/main channel.
// Credentials are released once to Ch's private wait, never to a public renderer.
export class PluginBrowserAuthService {
  #browser; #prompts; #passwordStore; #ownsPasswordStore;
  #entries = new Map(); #sessions = new Map(); #disposed = false; #disposing;

  constructor({ browser, prompts, passwordStore, credentialStore }) {
    if (typeof browser?.browserAuthBinding !== 'function' || typeof prompts?.open !== 'function'
      || typeof prompts?.close !== 'function') throw unavailable();
    this.#browser = browser; this.#prompts = prompts;
    this.#passwordStore = passwordStore ?? credentialStore;
    this.#ownsPasswordStore = passwordStore === undefined && credentialStore !== undefined;
  }

  #passwordsAvailable() {
    const value = this.#passwordStore?.capabilities;
    return this.#passwordStore?.available === true && value?.provider === 'opencu-password-store'
      && value.persistentReady === true && value.originBinding === true && value.fieldBinding === true
      && value.oneTimeReceipts === true && ['initialize', 'list', 'read', 'save', 'remove', 'createUserReceipt', 'revokeReceipt']
        .every(method => typeof this.#passwordStore[method] === 'function');
  }

  async #initializePasswords() {
    if (typeof this.#passwordStore?.initialize !== 'function') throw unavailable();
    await this.#passwordStore.initialize();
    if (!this.#passwordsAvailable()) throw unavailable();
  }

  #capabilities(binding) {
    const available = this.#passwordsAvailable(), protectedDelivery = typeof binding.assertProtected === 'function';
    return Object.freeze({ schemaVersion: 1, provider: 'opencu-password-store', nativePasswordStore: false,
      pluginPasswordStore: available, available, persistentReady: available,
      originBinding: available, fieldBinding: available, oneTimeReceipts: available,
      privateCredentialDelivery: available && protectedDelivery, credentialObservationProtection: available && protectedDelivery,
      ordinaryCredentialDelivery: available && protectedDelivery, manualCredentialSave: available && protectedDelivery,
      passwordOnly: available && protectedDelivery });
  }

  async handle(method, params, { signal } = {}) {
    if (!AUTH_BROKER_METHODS.has(method) || !object(params) || this.#disposed) throw unavailable();
    if (method !== 'browser.authBroker.close') signal?.throwIfAborted();
    if (method === 'browser.authBroker.bind') return await this.#bind(params, signal);
    if (method === 'browser.authBroker.register') return await this.#register(params, signal);
    if (method === 'browser.authBroker.status') return this.#status(params);
    if (method === 'browser.authBroker.close') return await this.#close(params);
    const entry = this.#entry(params);
    if (method === 'browser.authBroker.wait') return await this.#wait(entry, signal);
    if (method === 'browser.authBroker.complete') return await this.#complete(entry, params);
    if (method === 'browser.authBroker.qrCodeSnapshot') return await this.#qrSnapshot(entry, params, signal);
    return await this.#present(entry, params, signal);
  }

  async #bind(params, signal) {
    const boundScope = scope(params);
    if (params.protectionId !== undefined || params.registration !== undefined) throw unavailable();
    const binding = await this.#browser.browserAuthBinding(boundScope, signal);
    try { await this.#initializePasswords(); } catch {}
    signal?.throwIfAborted(); checkBinding(binding, boundScope.tabId, false);
    if (this.#disposed) throw unavailable();
    const previous = this.#sessions.get(boundScope.sessionId);
    if (previous?.challenges.size && (!sameScope(previous.scope, boundScope)
      || !sameDocument(previous.binding, binding))) throw unavailable();
    if (!previous && this.#sessions.size >= MAX_SESSIONS) throw unavailable();
    this.#sessions.set(boundScope.sessionId, { scope: boundScope, binding,
      challenges: previous?.challenges ?? new Set(), used: previous?.used === true });
    return { bound: true, sessionId: boundScope.sessionId, capabilities: this.#capabilities(binding) };
  }

  async #register(params, signal) {
    const boundScope = scope(params), registered = registration(params.registration, boundScope);
    if (registered.manualSaveFields || registered.credentialBinding) {
      try { await this.#initializePasswords(); } catch { throw unavailable(); }
    }
    if (!identity(params.protectionId) || this.#entries.size >= MAX_SESSIONS) throw unavailable();
    const session = this.#sessions.get(boundScope.sessionId);
    if (!session || !sameScope(session.scope, boundScope)) throw unavailable();
    const binding = await this.#browser.browserAuthBinding({ ...boundScope,
      protectionId: params.protectionId, registration: params.registration }, signal);
    signal?.throwIfAborted(); checkBinding(binding, boundScope.tabId, true);
    if (this.#disposed || this.#sessions.get(boundScope.sessionId) !== session
      || this.#entries.size >= MAX_SESSIONS || !sameDocument(session.binding, binding)
      || registered.origin !== binding.origin || registered.frameOrigin !== binding.frameOrigin) throw unavailable();
    const id = randomBytes(32).toString('base64url');
    const entry = { id, scope: boundScope, binding, registration: registered, protectionId: params.protectionId,
      controller: new AbortController(), submission: deferred(), completion: deferred(), presentation: deferred(),
      status: null, submitted: false, waited: false, delivered: false, presented: false, values: undefined,
      opening: null, cleanup: null, listeners: new Set(), monitor: null,
      qrInitialPayload: undefined, qrPayload: undefined, qrImage: undefined,
      qrOnly: false, qrWatching: false, qrDisappeared: false, qrQueue: Promise.resolve(), presenting: false };
    entry.credentialReceipts = new Map(); entry.providers = new Map(); entry.passwordSubmitted = false;
    this.#entries.set(id, entry); session.challenges.add(id);
    entry.monitor = setInterval(() => {
      if (entry.status != null || entry.submitted || entry.qrWatching) return;
      try { this.#assertCurrent(entry); this.#assertProtected(entry); }
      catch { void this.#finish(entry, 'page_changed').catch(() => {}); }
    }, 250);
    entry.monitor.unref?.();
    return { type: 'registered', challenge_id: id, password_submission_metadata: true };
  }

  #status(params) {
    if (!identity(params.session_id)) throw unavailable();
    const session = this.#sessions.get(params.session_id);
    if (!session) throw unavailable();
    return { type: 'native_observation_status', used: session.used };
  }

  #entry(params) {
    const id = params.challenge_id ?? params.browser_auth_challenge_id
      ?? params.meta?.browser_auth_challenge_id ?? params.metadata?.browser_auth_challenge_id;
    if (typeof id !== 'string' || !CHALLENGE_ID.test(id)) throw unavailable();
    const entry = this.#entries.get(id);
    if (!entry || params.challenge_id !== undefined && params.challenge_id !== id
      || params.browser_auth_challenge_id !== undefined && params.browser_auth_challenge_id !== id
      || params.sessionId !== undefined && params.sessionId !== entry.scope.sessionId
      || params.tabId !== undefined && params.tabId !== entry.scope.tabId
      || params.leaseId !== undefined && params.leaseId !== entry.scope.leaseId
      || params.actorId !== undefined && params.actorId !== entry.scope.actorId
      || params.protectionId !== undefined && params.protectionId !== entry.protectionId) throw unavailable();
    return entry;
  }

  #assertCurrent(entry) {
    if (this.#disposed || this.#entries.get(entry.id) !== entry || entry.status != null
      || entry.controller.signal.aborted || entry.binding.assertCurrent() !== true) throw unavailable();
    return true;
  }

  #assertProtected(entry) {
    this.#assertCurrent(entry);
    if (entry.binding.assertProtected() !== true) throw unavailable();
    return true;
  }

  #listen(entry, signal) {
    if (!signal) return () => {};
    const abort = () => { void this.#finish(entry, 'cancelled').catch(() => {}); };
    if (signal.aborted) { abort(); return () => {}; }
    signal.addEventListener('abort', abort, { once: true });
    const remove = () => { signal.removeEventListener('abort', abort); entry.listeners.delete(remove); };
    entry.listeners.add(remove); return remove;
  }

  async #wait(entry, signal) {
    if (entry.waited) throw unavailable();
    entry.waited = true;
    const remove = this.#listen(entry, signal);
    try {
      const result = await entry.submission.promise;
      if (result.type === 'submission') {
        if (entry.status != null) return { type: 'completed', challenge_id: entry.id, status: entry.status };
        this.#assertCurrent(entry); this.#assertProtected(entry); entry.delivered = true;
        if (['native', 'ordinary', 'manual', 'stored'].includes(entry.deliveryMode)) {
          const session = this.#sessions.get(entry.scope.sessionId);
          if (!session || !sameScope(session.scope, entry.scope)) throw unavailable();
          session.used = true;
        }
      }
      return result;
    } catch (error) {
      await this.#finish(entry, signal?.aborted ? 'cancelled' : 'unavailable'); throw error;
    } finally { remove(); }
  }

  async #present(entry, params, signal) {
    if (entry.presented || entry.presenting) throw unavailable();
    const prompt = publicPrompt(params, entry);
    entry.presenting = true;
    if (entry.registration.qrCode) {
      const input = params.meta ?? params.metadata ?? params;
      if (entry.qrInitialPayload !== undefined && entry.qrInitialPayload !== input.qr_code_payload) throw unavailable();
      entry.qrOnly = input.qr_code_only;
      await entry.qrQueue;
      if (entry.qrPayload === undefined) await this.#updateQr(entry, input.qr_code_payload, false);
      if (entry.qrDisappeared && !entry.qrOnly) throw unavailable();
      if (entry.qrDisappeared && entry.qrOnly) {
        await this.#finish(entry, 'submitted'); return await entry.presentation.promise;
      }
      prompt.qr = this.#qrState(entry);
    }
    this.#assertCurrent(entry); this.#assertProtected(entry);
    entry.credentialPlan = localCredentialPlan(prompt, params.meta ?? params.metadata ?? params, entry.binding,
      { passwordOnly: entry.registration.manualSaveFields?.username === undefined && !!entry.registration.manualSaveFields });
    if ((entry.registration.manualSaveFields || entry.registration.credentialBinding)
      && !matchesCredentialRegistration(entry.credentialPlan, entry.registration)) throw unavailable();
    if (entry.credentialPlan) await this.#credentialProviders(entry, prompt);
    this.#assertCurrent(entry); this.#assertProtected(entry);
    entry.presented = true; entry.prompt = prompt;
    this.#listen(entry, signal);
    entry.opening = Promise.resolve().then(() => this.#prompts.open({ prompt,
      assertCurrent: () => this.#assertCurrent(entry), assertProtected: () => this.#assertProtected(entry),
      onSubmit: (values, submissionSignal) => this.#submit(entry, values, submissionSignal),
      onUseCredential: (selection, submissionSignal) => this.#useCredential(entry, selection, submissionSignal),
      onRemoveCredential: (selection, operationSignal) => this.#removeCredential(entry, selection, operationSignal),
      onSkip: () => { void this.#finish(entry, 'declined').catch(() => {}); return uiOutcome(entry); },
      onClosed: () => { void this.#finish(entry, 'cancelled').catch(() => {}); },
      signal: entry.controller.signal }));
    try { await entry.opening; entry.qrWatching = entry.qrOnly; }
    catch (error) {
      await this.#finish(entry, signal?.aborted ? 'cancelled' : 'unavailable');
      if (entry.status === 'unavailable') throw error;
    }
    return await entry.presentation.promise;
  }

  async #credentialProviders(entry, prompt) {
    const plan = entry.credentialPlan, providers = [];
    const install = async (id, name, store, canUse, canSave) => {
      if (!store) return;
      if (!canUse) { providers.push({ id, name, available: false, canSave: false, passwordOnly: plan.passwordOnly, accounts: [] }); return; }
      try {
        await store.initialize(); this.#assertCurrent(entry); this.#assertProtected(entry);
        if (store !== this.#passwordStore || !this.#passwordsAvailable()) throw unavailable();
        const records = await store.list(prompt.origin, plan.scope);
        this.#assertCurrent(entry); this.#assertProtected(entry);
        const accounts = localCredentialMetadata(records).map(account => ({ ...account, providerName: name }));
        const view = { id, name, available: true, canSave,
          ...(canSave ? { saveFieldIds: [plan.usernameId, plan.passwordId] } : {}),
          ...(plan.optionId ? { optionId: plan.optionId } : {}), passwordOnly: plan.passwordOnly, accounts };
        entry.providers.set(id, { store, accounts, view }); providers.push(view);
      } catch { providers.push({ id, name, available: false, canSave: false, passwordOnly: plan.passwordOnly, accounts: [] }); }
    };
    await install('local', 'OpenCU Passwords', this.#passwordStore,
      !plan.passwordOnly || !!entry.registration.credentialBinding, !plan.passwordOnly);
    if (providers.length) prompt.credentials = { providers,
      defaultProviderId: providers.find(provider => provider.available)?.id };
    const local = entry.providers.get('local');
    entry.localCredentials = local?.accounts;
    if (local && !plan.passwordOnly) prompt.localCredentials = { available: true, providerName: local.view.name,
      saveFieldIds: [...local.view.saveFieldIds], optionId: local.view.optionId, accounts: local.accounts };
    else if (this.#passwordStore && !plan.passwordOnly) prompt.localCredentials = { available: false };
  }

  #provider(entry, providerId, credentialId) {
    const provider = entry.providers.get(providerId);
    if (!provider || !provider.view.available || credentialId !== undefined
      && !provider.accounts.some(account => account.id === credentialId)) throw unavailable();
    return provider;
  }

  #receipt(entry, providerId, input) {
    const provider = this.#provider(entry, providerId);
    const receipt = provider.store.createUserReceipt(input);
    entry.credentialReceipts.set(receipt, provider.store);
    return receipt;
  }

  async #revoke(entry, receipt) {
    const store = entry.credentialReceipts.get(receipt);
    if (store) { entry.credentialReceipts.delete(receipt); await store.revokeReceipt(receipt); }
  }

  async #submit(entry, input, signal) {
    const values = Object.create(null);
    try {
      this.#assertCurrent(entry); this.#assertProtected(entry); signal?.throwIfAborted();
      if (entry.submitted || entry.credentialMutation || !object(input) || input.id !== entry.id || !object(input.fields)
        || Object.keys(input).some(key => !['id', 'fields', 'selected_option', 'save_local', 'save_provider', 'credential_provider'].includes(key))
        || input.save_local !== undefined && typeof input.save_local !== 'boolean'
        || input.save_provider !== undefined && input.save_provider !== 'local'
        || input.credential_provider !== undefined && input.credential_provider !== 'local'
        || input.save_local === true && input.save_provider !== undefined && input.save_provider !== 'local') throw unavailable();
      const option = entry.prompt.options?.find(value => value.id === input.selected_option);
      if (entry.prompt.options ? !option : input.selected_option !== undefined) throw unavailable();
      const fields = entry.prompt.fields.filter(field => !option || option.fieldIds.includes(field.id));
      const allowed = new Set(fields.map(field => field.id));
      let length = 0;
      for (const [id, value] of Object.entries(input.fields)) {
        if (!allowed.has(id) || typeof value !== 'string' || value.length > 16384
          || (length += value.length) > 98304) throw unavailable();
        values[id] = value;
      }
      if (fields.some(field => field.required && !values[field.id])) throw unavailable();
      const saveProviderId = input.save_provider ?? (input.save_local === true ? 'local' : undefined);
      if (saveProviderId) {
        const plan = entry.credentialPlan;
        const provider = this.#provider(entry, saveProviderId);
        if (!plan || !provider.view.canSave || plan.passwordOnly || input.selected_option !== plan.optionId
          || !values[plan.usernameId] || !values[plan.passwordId]) throw unavailable();
        entry.saveProviderId = saveProviderId;
        entry.saveRecord = { origin: entry.prompt.origin, scope: plan.scope,
          username: values[plan.usernameId], password: values[plan.passwordId] };
        entry.saveReceipt = this.#receipt(entry, saveProviderId, { action: 'save', origin: entry.prompt.origin,
          username: values[plan.usernameId], scope: plan.scope });
      }
      const stored = input.credential_provider === 'local', manual = !!saveProviderId && !!entry.registration.manualSaveFields;
      const bound = stored && !!entry.registration.credentialBinding;
      const ordinary = bound && !manual && entry.registration.credentialBinding.submission === 'ordinary';
      if (stored && !this.#passwordsAvailable()
        || manual && (!this.#passwordsAvailable() || !matchesCredentialRegistration(entry.credentialPlan, entry.registration))) throw unavailable();
      entry.deliveryMode = manual ? 'manual' : ordinary ? 'ordinary' : bound ? 'native' : stored ? 'stored' : 'user';
      entry.submitted = true; entry.values = values;
      this.#listen(entry, signal);
      // The native-named delivery bit is an inherited private protection mode,
      // while the advertised provider remains the plugin's encrypted store.
      entry.submission.resolve({ type: 'submission', challenge_id: entry.id, fields: values,
        ...(option ? { selected_option: option.id } : {}), ...(manual ? { manual_credential_save: true }
          : ordinary ? { ordinary_credential_delivery: true } : bound ? { native_credential_delivery: true } : {}) });
      await entry.completion.promise;
      return uiOutcome(entry);
    } catch {
      void this.#finish(entry, signal?.aborted ? 'cancelled' : 'unavailable').catch(() => {});
      return uiOutcome(entry);
    } finally { wipe(values); wipe(input?.fields); }
  }

  async #useCredential(entry, input, signal) {
    let credential, receipt;
    const fields = Object.create(null);
    try {
      this.#assertCurrent(entry); this.#assertProtected(entry); signal?.throwIfAborted();
      const plan = entry.credentialPlan;
      const providerId = input?.providerId ?? 'local', provider = this.#provider(entry, providerId, input?.credentialId);
      if (!plan || entry.submitted || entry.credentialMutation || input?.id !== entry.id
        || Object.keys(input).some(key => !['id', 'providerId', 'credentialId'].includes(key))) throw unavailable();
      receipt = this.#receipt(entry, providerId, { action: 'read',
        id: input.credentialId, origin: entry.prompt.origin, scope: plan.scope,
        username: provider.accounts.find(account => account.id === input.credentialId).accountLabel });
      credential = await provider.store.read(input.credentialId, entry.prompt.origin, plan.scope, receipt);
      this.#assertCurrent(entry); this.#assertProtected(entry); signal?.throwIfAborted();
      if (!credential || credential.origin !== entry.prompt.origin || typeof credential.username !== 'string'
        || typeof credential.password !== 'string' || plan.usernameId && !credential.username || !credential.password) throw unavailable();
      if (plan.usernameId) fields[plan.usernameId] = credential.username;
      fields[plan.passwordId] = credential.password;
      wipeCredential(credential);
      return await this.#submit(entry, { id: entry.id, fields,
        credential_provider: providerId, ...(plan.optionId ? { selected_option: plan.optionId } : {}) }, signal);
    } catch { void this.#finish(entry, signal?.aborted ? 'cancelled' : 'unavailable').catch(() => {}); return uiOutcome(entry); }
    finally { wipeCredential(credential); wipe(fields); await this.#revoke(entry, receipt); }
  }

  async #removeCredential(entry, input, signal) {
    this.#assertCurrent(entry); this.#assertProtected(entry); signal?.throwIfAborted();
    const plan = entry.credentialPlan;
    const providerId = input?.providerId ?? 'local', provider = this.#provider(entry, providerId, input?.credentialId);
    const account = provider.accounts.find(value => value.id === input.credentialId);
    if (!plan || entry.submitted || entry.credentialMutation
      || input?.id !== entry.id || Object.keys(input).some(key => !['id', 'providerId', 'credentialId'].includes(key))
      || !account) throw unavailable();
    entry.credentialMutation = true;
    let receipt;
    try {
      this.#assertCurrent(entry); this.#assertProtected(entry); signal?.throwIfAborted();
      receipt = this.#receipt(entry, providerId, { action: 'remove', origin: entry.prompt.origin,
        id: input.credentialId, username: account.accountLabel, scope: plan.scope });
      const result = await provider.store.remove(input.credentialId, entry.prompt.origin, receipt);
      this.#assertCurrent(entry); this.#assertProtected(entry); signal?.throwIfAborted();
      if (typeof result?.removed !== 'boolean') throw unavailable();
      provider.accounts = provider.accounts.filter(account => account.id !== input.credentialId);
      provider.view.accounts = provider.accounts;
      if (providerId === 'local') {
        entry.localCredentials = provider.accounts;
        if (entry.prompt.localCredentials) entry.prompt.localCredentials.accounts = provider.accounts;
      }
      return { id: entry.id, providerId, credentialId: input.credentialId, removed: result.removed };
    } finally { entry.credentialMutation = false; await this.#revoke(entry, receipt); }
  }

  async #complete(entry, params) {
    if (params.password_submitted !== undefined && typeof params.password_submitted !== 'boolean') throw unavailable();
    if (!STATUSES.has(params.status) || params.status === 'submitted'
      && !entry.delivered && !(entry.qrOnly && entry.qrDisappeared)) throw unavailable();
    if (entry.status != null && entry.status !== params.status) throw unavailable();
    if (entry.status == null) {
      entry.passwordSubmitted = params.password_submitted === true;
      if (entry.passwordSubmitted && (!entry.delivered || !entry.prompt?.fields.some(field => field.type === 'password'
        && typeof entry.values?.[field.id] === 'string' && entry.values[field.id].length > 0))) throw unavailable();
    }
    await this.#finish(entry, params.status);
    return { type: 'completed', challenge_id: entry.id, status: entry.status };
  }

  #qrState(entry) {
    return { state: entry.qrDisappeared ? 'disappeared'
      : entry.qrPayload === entry.qrInitialPayload ? 'ready' : 'rotated',
      ...(entry.qrDisappeared ? {} : { imageDataUrl: entry.qrImage }),
      requiresApp: qrUrl(entry.qrPayload) === undefined, only: entry.qrOnly };
  }

  async #updateQr(entry, payload, disappeared) {
    if (entry.status != null) throw unavailable();
    let changed = false;
    if (disappeared) {
      if (entry.qrPayload !== payload || entry.registration.fields.length || entry.registration.options
        || entry.presented && !entry.qrOnly) throw unavailable();
      changed = !entry.qrDisappeared; entry.qrDisappeared = true; entry.qrImage = undefined;
    } else {
      this.#assertCurrent(entry); this.#assertProtected(entry);
      if (entry.qrDisappeared) throw unavailable();
      if (entry.qrPayload !== payload) {
        const image = await encodeQr(payload);
        this.#assertCurrent(entry); this.#assertProtected(entry);
        entry.qrInitialPayload ??= payload; entry.qrPayload = payload; entry.qrImage = image;
        changed = true;
      }
    }
    if (entry.presented && changed) {
      await entry.opening;
      if (entry.status != null) return;
      if (typeof this.#prompts.updateQr !== 'function') throw unavailable();
      await this.#prompts.updateQr(entry.id, this.#qrState(entry));
      if (entry.qrOnly && entry.qrDisappeared) await this.#finish(entry, 'submitted');
    }
  }

  async #qrSnapshot(entry, params, signal) {
    if (!entry.registration.qrCode || params.type !== undefined && params.type !== 'qr_code_snapshot'
      || params.disappeared !== undefined && params.disappeared !== true) throw unavailable();
    const payload = qrPayload(params.payload);
    if (entry.status != null) return { updated: false };
    const operation = entry.qrQueue.then(async () => {
      signal?.throwIfAborted();
      if (entry.status != null) return;
      await this.#updateQr(entry, payload, params.disappeared === true);
      signal?.throwIfAborted();
    });
    entry.qrQueue = operation.catch(() => {});
    try { await operation; }
    catch (error) { await this.#finish(entry, signal?.aborted ? 'cancelled' : 'unavailable'); throw error; }
    return { updated: true };
  }

  #finish(entry, status) {
    if (entry.status == null) {
      entry.status = status;
      clearInterval(entry.monitor); entry.monitor = null;
      for (const remove of [...entry.listeners]) remove();
      const result = { type: 'completed', challenge_id: entry.id, status };
      entry.submission.resolve(result);
      entry.finalization = (async () => {
        try {
          const pending = [...entry.credentialReceipts.keys()].filter(receipt => receipt !== entry.saveReceipt);
          const revoked = await Promise.allSettled(pending.map(receipt => this.#revoke(entry, receipt)));
          if (revoked.some(result => result.status === 'rejected')) entry.receiptCleanupError = unavailable();
          if (status === 'submitted' && entry.passwordSubmitted && entry.saveRecord && entry.saveReceipt) {
            const provider = this.#provider(entry, entry.saveProviderId);
            await provider.store.save(entry.saveRecord, entry.saveReceipt);
            entry.savedAccountLabel = entry.saveRecord.username; entry.saveStatus = 'saved';
          } else if (entry.saveProviderId) {
            entry.saveStatus = 'not-saved';
          }
        } catch { entry.saveStatus = 'failed'; }
        finally {
          try { await this.#revoke(entry, entry.saveReceipt); } catch { entry.receiptCleanupError = unavailable(); }
          wipeCredential(entry.saveRecord); entry.saveRecord = undefined; entry.saveReceipt = undefined;
          wipe(entry.values); entry.values = undefined;
          entry.completion.resolve(result);
        }
      })();
      entry.qrInitialPayload = undefined; entry.qrPayload = undefined; entry.qrImage = undefined;
      if (entry.prompt?.qr) entry.prompt.qr = { state: 'unavailable', only: entry.qrOnly, requiresApp: false };
    }
    if (!entry.cleanup) {
      entry.cleanup = Promise.resolve().then(async () => {
        await entry.finalization;
        entry.controller.abort(unavailable());
        await Promise.allSettled([entry.opening].filter(Boolean));
        await this.#prompts.close(entry.id);
        if (entry.receiptCleanupError) throw entry.receiptCleanupError;
        entry.presentation.resolve(elicitation(entry));
      }).catch(error => { entry.presentation.reject(error); throw error; });
      void entry.cleanup.catch(() => {});
    }
    return entry.cleanup;
  }

  async #close(params) {
    const id = params.challenge_id;
    if (typeof id !== 'string' || !CHALLENGE_ID.test(id)) throw unavailable();
    const entry = this.#entries.get(id);
    if (!entry) return { closed: true };
    this.#entry(params);
    await this.#finish(entry, 'cancelled');
    this.#entries.delete(id); this.#sessions.get(entry.scope.sessionId)?.challenges.delete(id);
    return { closed: true };
  }

  async dispose() {
    if (this.#disposing) return await this.#disposing;
    this.#disposed = true;
    this.#disposing = (async () => {
      const results = await Promise.allSettled([...this.#entries.values()].map(entry => this.#finish(entry, 'cancelled')));
      this.#entries.clear(); this.#sessions.clear();
      const stores = await Promise.allSettled(this.#ownsPasswordStore ? [this.#passwordStore?.dispose()] : []);
      const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
      failures.push(...stores.filter(result => result.status === 'rejected').map(result => result.reason));
      if (failures.length) throw new AggregateError(failures, 'Private browser authentication cleanup failed');
    })();
    return await this.#disposing;
  }
}
