import { BrowserWindow, ipcMain, nativeImage, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REQUEST = 'opencu-browser-auth:request';
const STATE = 'opencu-browser-auth:state';
const PAGE = fileURLToPath(new URL('../../lib/browser-auth/index.html', import.meta.url));
const PRELOAD = fileURLToPath(new URL('./auth-preload.cjs', import.meta.url));
const FIELD_ID = /^[A-Za-z0-9_-]{1,48}$/;
const terminal = new Set(['submitted', 'uncertain', 'closed', 'skipped', 'failed']);
let installedHost;

const invalid = () => new Error('Private browser sign-in is unavailable');
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && FIELD_ID.test(value)
  && !['__proto__', 'constructor', 'prototype'].includes(value);
const wipe = values => {
  for (const name of Object.keys(values ?? {})) {
    if (object(values[name])) values[name].value = '';
    delete values[name];
  }
};
function origin(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.origin !== value) throw invalid();
  return value;
}
function publicQr(value) {
  if (!object(value) || Object.keys(value).some(key => !['state', 'only', 'requiresApp', 'imageDataUrl', 'matrix'].includes(key))
    || !['waiting', 'ready', 'rotated', 'disappeared', 'expired', 'unavailable'].includes(value.state)
    || typeof value.only !== 'boolean' || typeof value.requiresApp !== 'boolean') throw invalid();
  let imageDataUrl, matrix;
  if (value.imageDataUrl !== undefined) {
    if (typeof value.imageDataUrl !== 'string' || value.imageDataUrl.length > 4 * 1024 * 1024) throw invalid();
    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.imageDataUrl);
    if (!match) throw invalid();
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length < 33 || bytes.toString('base64') !== match[1]
      || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw invalid();
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width > 2048 || height > 2048) throw invalid();
    const decoded = nativeImage.createFromBuffer(bytes);
    if (decoded.isEmpty() || decoded.getSize().width !== width || decoded.getSize().height !== height) throw invalid();
    imageDataUrl = value.imageDataUrl;
  }
  if (value.matrix !== undefined) {
    const input = value.matrix;
    if (!object(input) || Object.keys(input).some(key => !['size', 'data'].includes(key))
      || !Number.isSafeInteger(input.size) || input.size < 21 || input.size > 177 || (input.size - 21) % 4
      || !(Array.isArray(input.data) || ArrayBuffer.isView(input.data) && input.data.BYTES_PER_ELEMENT === 1)
      || input.data.length !== input.size * input.size) throw invalid();
    const data = Array.from(input.data);
    if (data.some(cell => cell !== false && cell !== true && cell !== 0 && cell !== 1)) throw invalid();
    matrix = { size: input.size, data: data.map(cell => cell === true || cell === 1) };
  }
  const ready = ['ready', 'rotated'].includes(value.state);
  if (ready && !imageDataUrl && !matrix) throw invalid();
  return { state: value.state, only: value.only, requiresApp: value.requiresApp,
    ...(ready && imageDataUrl ? { imageDataUrl } : {}), ...(ready && matrix ? { matrix } : {}) };
}
function publicPrompt(value) {
  if (!object(value) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(value.id)
    || !Array.isArray(value.fields) || value.fields.length > 6) throw invalid();
  const fields = [], ids = new Set();
  for (const field of value.fields) {
    if (!object(field) || !identifier(field.id) || ids.has(field.id) || typeof field.label !== 'string'
      || field.label.length > 2048 || !['text', 'password', 'email', 'tel', 'number', 'url'].includes(field.type)
      || typeof field.required !== 'boolean') throw invalid();
    ids.add(field.id);
    fields.push({ id: field.id, label: field.label, type: field.type, required: field.required,
      ...(typeof field.autocomplete === 'string' && field.autocomplete.length <= 256 ? { autocomplete: field.autocomplete } : {}) });
  }
  let options;
  if (value.options !== undefined) {
    if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 10) throw invalid();
    const optionIds = new Set();
    options = value.options.map(option => {
      if (!object(option) || !identifier(option.id) || optionIds.has(option.id) || typeof option.label !== 'string'
        || !option.label.trim() || option.label.length > 120 || !Array.isArray(option.fieldIds)
        || option.fieldIds.length > 6 || new Set(option.fieldIds).size !== option.fieldIds.length
        || option.fieldIds.some(id => !ids.has(id))) throw invalid();
      optionIds.add(option.id);
      return { id: option.id, label: option.label, fieldIds: [...option.fieldIds] };
    });
  }
  const qr = value.qr === undefined ? undefined : publicQr(value.qr);
  if (qr?.only && (fields.length || options) || !fields.length && !options && !qr?.only) throw invalid();
  let localCredentials;
  if (value.localCredentials !== undefined) {
    const local = value.localCredentials;
    if (!object(local) || typeof local.available !== 'boolean') throw invalid();
    if (local.available) {
      if (qr?.only || typeof local.providerName !== 'string' || local.providerName.length > 120
        || !Array.isArray(local.saveFieldIds) || local.saveFieldIds.length !== 2
        || new Set(local.saveFieldIds).size !== 2 || local.saveFieldIds.some(id => !ids.has(id))
        || !fields.some(field => field.id === local.saveFieldIds[1] && field.type === 'password')
        || !Array.isArray(local.accounts) || local.accounts.length > 32
        || local.optionId !== undefined && !options?.some(option => option.id === local.optionId
          && local.saveFieldIds.every(id => option.fieldIds.includes(id)))) throw invalid();
      const accounts = [], accountIds = new Set();
      for (const account of local.accounts) {
        if (!object(account) || typeof account.id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(account.id)
          || accountIds.has(account.id) || typeof account.accountLabel !== 'string' || account.accountLabel.length > 16384
          || typeof account.reference !== 'string' || account.reference.length > 128) throw invalid();
        accountIds.add(account.id); accounts.push({ id: account.id, accountLabel: account.accountLabel,
          reference: account.reference, providerName: local.providerName });
      }
      localCredentials = { available: true, providerName: local.providerName,
        saveFieldIds: [...local.saveFieldIds], ...(local.optionId ? { optionId: local.optionId } : {}), accounts };
    } else localCredentials = { available: false };
  }
  let credentials;
  if (value.credentials !== undefined) {
    if (!object(value.credentials) || !Array.isArray(value.credentials.providers)
      || value.credentials.providers.length > 2) throw invalid();
    const providerIds = new Set();
    const providers = value.credentials.providers.map(provider => {
      if (!object(provider) || !['chromium', 'local'].includes(provider.id) || providerIds.has(provider.id)
        || typeof provider.name !== 'string' || !provider.name || provider.name.length > 120
        || typeof provider.available !== 'boolean' || typeof provider.canSave !== 'boolean'
        || typeof provider.passwordOnly !== 'boolean' || !Array.isArray(provider.accounts)
        || provider.accounts.length > 32 || !provider.available && (provider.canSave || provider.accounts.length)
        || provider.passwordOnly && (provider.canSave || fields.length !== 1 || fields[0]?.type !== 'password' || options)) throw invalid();
      providerIds.add(provider.id);
      let saveFieldIds;
      if (provider.canSave) {
        if (!Array.isArray(provider.saveFieldIds) || provider.saveFieldIds.length !== 2
          || new Set(provider.saveFieldIds).size !== 2 || provider.saveFieldIds.some(id => !ids.has(id))
          || !fields.some(field => field.id === provider.saveFieldIds[1] && field.type === 'password')) throw invalid();
        saveFieldIds = [...provider.saveFieldIds];
      } else if (provider.saveFieldIds !== undefined) throw invalid();
      if (provider.optionId !== undefined && !options?.some(option => option.id === provider.optionId
        && (!saveFieldIds || saveFieldIds.every(id => option.fieldIds.includes(id))))) throw invalid();
      const accountIds = new Set(), accounts = provider.accounts.map(account => {
        if (!object(account) || typeof account.id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(account.id)
          || accountIds.has(account.id) || typeof account.accountLabel !== 'string' || account.accountLabel.length > 16384
          || typeof account.reference !== 'string' || account.reference.length > 128) throw invalid();
        accountIds.add(account.id); return { id: account.id, accountLabel: account.accountLabel,
          reference: account.reference, providerName: provider.name };
      });
      return { id: provider.id, name: provider.name, available: provider.available, canSave: provider.canSave,
        passwordOnly: provider.passwordOnly, accounts, ...(saveFieldIds ? { saveFieldIds } : {}),
        ...(provider.optionId ? { optionId: provider.optionId } : {}) };
    });
    if (value.credentials.defaultProviderId !== undefined
      && !providers.some(provider => provider.available && provider.id === value.credentials.defaultProviderId)) throw invalid();
    credentials = { providers, ...(value.credentials.defaultProviderId ? { defaultProviderId: value.credentials.defaultProviderId } : {}) };
  }
  return { id: value.id, origin: origin(value.origin), fields, ...(options ? { options } : {}),
    ...(qr ? { qr } : {}),
    ...(localCredentials ? { localCredentials } : {}),
    ...(credentials ? { credentials } : {}),
    ...(value.frameOrigin !== undefined ? { frameOrigin: origin(value.frameOrigin) } : {}),
    ...(typeof value.locale === 'string' && value.locale.length <= 64 ? { locale: value.locale } : {}),
    ...(['light', 'dark'].includes(value.theme) ? { theme: value.theme } : {}) };
}
function outcome(id, value) {
  if (!object(value) || value.id !== id || !terminal.has(value.state)
    || !['submitted', 'unknown', 'not_submitted'].includes(value.fillStatus)) throw invalid();
  let credentialSave;
  if (value.credentialSave !== undefined) {
    const save = value.credentialSave;
    if (!object(save) || !['chromium', 'local'].includes(save.providerId)
      || !['saved', 'failed', 'not-saved'].includes(save.status)
      || save.accountLabel !== undefined && (typeof save.accountLabel !== 'string' || save.accountLabel.length > 16384)) throw invalid();
    credentialSave = { providerId: save.providerId, status: save.status,
      ...(save.accountLabel !== undefined ? { accountLabel: save.accountLabel } : {}) };
  }
  return { id, state: value.state, fillStatus: value.fillStatus,
    ...(credentialSave ? { credentialSave } : {}),
    ...(['saved', 'failed'].includes(value.saveStatus) ? { saveStatus: value.saveStatus } : {}) };
}

function whenDestroyed(target, event) {
  if (target.isDestroyed()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer); target.removeListener(event, onDestroyed);
      if (error) reject(error); else resolve();
    };
    const onDestroyed = () => finish();
    const timer = setTimeout(() => finish(invalid()), 10000);
    target.once(event, onDestroyed);
  });
}

// Private windows are never entered into the automation browser's tab registry.
// The controller must establish its observation barrier before creating one.
export class BrowserAuthPromptHost {
  #entries = new Map(); #disposed = false;
  constructor() {
    if (installedHost) throw invalid();
    ipcMain.handle(REQUEST, (event, input) => this.#request(event, input));
    installedHost = this;
  }

  async open({ prompt: rawPrompt, assertCurrent, assertProtected, onSubmit, onUseCredential, onRemoveCredential, onSkip, onClosed, signal }) {
    const prompt = publicPrompt(rawPrompt);
    if (this.#disposed || this.#entries.has(prompt.id)
      || [assertCurrent, assertProtected, onSubmit, onSkip].some(value => typeof value !== 'function')) throw invalid();
    signal?.throwIfAborted();
    if (await assertCurrent() !== true || await assertProtected() !== true) throw invalid();
    signal?.throwIfAborted();
    const isolated = session.fromPartition('opencu-private-sign-in-' + randomUUID(), { cache: false });
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.webRequest.onBeforeRequest((details, callback) => {
      let allowed = false;
      try {
        const url = new URL(details.url);
        allowed = url.protocol === 'file:' && (url.href === pathToFileURL(PAGE).href
          || url.href === new URL('./index.js', pathToFileURL(PAGE)).href);
        if (url.protocol === 'data:' && details.resourceType === 'image'
          && details.url === prompt.qr?.imageDataUrl) allowed = true;
      } catch {}
      callback({ cancel: !allowed });
    });
    const window = new BrowserWindow({ show: false, width: 480, height: 680, minWidth: 360, minHeight: 480,
      title: 'OpenCU', autoHideMenuBar: true, webPreferences: { preload: PRELOAD, session: isolated,
        sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, devTools: false } });
    window.setContentProtection(true);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    const controller = new AbortController();
    const entry = { prompt, assertCurrent, assertProtected, onSubmit, onUseCredential, onRemoveCredential, onSkip, onClosed, isolated, window, contents: window.webContents,
      controller, signal: AbortSignal.any([controller.signal, signal].filter(Boolean)),
      state: { id: prompt.id, state: 'pending', fillStatus: 'not_submitted', ...(prompt.qr ? { qr: prompt.qr } : {}) }, attempted: false,
      operation: null, closing: null, destroyed: false };
    this.#entries.set(prompt.id, entry);
    entry.abort = () => { void this.close(prompt.id).catch(() => {}); };
    entry.signal.addEventListener('abort', entry.abort, { once: true });
    window.on('close', event => { if (!entry.destroyed) { event.preventDefault(); void this.close(prompt.id).catch(() => {}); } });
    window.webContents.on('render-process-gone', entry.abort);
    try {
      await window.loadFile(PAGE);
      await this.#current(entry);
      window.show();
      if (process.argv.includes('--opencu-test-keychain')) console.error('OpenCU isolated private auth window ready');
      return { id: prompt.id, state: entry.state.state };
    } catch (error) { await this.close(prompt.id); throw error; }
  }

  #alive(entry) {
    entry.signal.throwIfAborted();
    if (this.#disposed || this.#entries.get(entry.prompt.id) !== entry || entry.closing
      || entry.window.isDestroyed() || entry.contents.isDestroyed()) throw invalid();
  }
  async #current(entry) {
    this.#alive(entry);
    if (await entry.assertCurrent() !== true || await entry.assertProtected() !== true) throw invalid();
    this.#alive(entry);
  }
  #publish(entry, value) {
    if (terminal.has(value.state)) { delete entry.prompt.qr; delete entry.prompt.localCredentials; delete entry.prompt.credentials; }
    entry.state = { ...value, ...(entry.prompt.qr ? { qr: entry.prompt.qr } : {}),
      ...(entry.prompt.credentials ? { credentials: entry.prompt.credentials } : {}) };
    if (!entry.window.isDestroyed() && !entry.contents.isDestroyed()) entry.contents.send(STATE, entry.state);
    return { ...entry.state };
  }
  async updateQr(id, rawQr) {
    const entry = this.#entries.get(id), qr = publicQr(rawQr);
    if (!entry || !entry.prompt.qr || qr.only !== entry.prompt.qr.only || terminal.has(entry.state.state)) throw invalid();
    if (qr.state === 'disappeared' && qr.only) this.#alive(entry);
    else await this.#current(entry);
    entry.prompt.qr = qr;
    this.#publish(entry, { id, state: entry.state.state, fillStatus: entry.state.fillStatus });
  }
  async #request(event, input) {
    const entry = [...this.#entries.values()].find(value => value.contents === event.sender);
    if (!entry || entry.window.isDestroyed() || entry.contents.isDestroyed()
      || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== pathToFileURL(PAGE).href
      || !object(input) || !['read-prompt', 'submit', 'use-local', 'remove-local', 'use-credential', 'remove-credential', 'skip'].includes(input.op)) throw invalid();
    if (input.op === 'skip') this.#alive(entry);
    else await this.#current(entry);
    if (input.op === 'read-prompt') {
      if (process.argv.includes('--opencu-test-keychain')) console.error('OpenCU isolated private auth prompt delivered');
      return { prompt: structuredClone(entry.prompt), state: { ...entry.state } };
    }
    if (input.id !== entry.prompt.id || entry.attempted || entry.operation || entry.state.state !== 'pending') throw invalid();
    const providerId = ['use-local', 'remove-local'].includes(input.op) ? 'local' : input.providerId;
    const provider = entry.prompt.credentials?.providers.find(value => value.id === providerId && value.available);
    if (['remove-local', 'remove-credential'].includes(input.op)) {
      if (Object.keys(input).some(key => !['op', 'id', 'credentialId', ...(input.op === 'remove-credential' ? ['providerId'] : [])].includes(key))
        || typeof entry.onRemoveCredential !== 'function' || !provider
        || !provider.accounts.some(account => account.id === input.credentialId)) throw invalid();
      const operation = Promise.resolve().then(async () => {
        await this.#current(entry);
        return await entry.onRemoveCredential({ id: input.id, providerId, credentialId: input.credentialId }, entry.signal);
      });
      entry.operation = operation;
      try {
        const result = await operation;
        await this.#current(entry);
        if (!object(result) || result.id !== input.id || result.providerId !== providerId || result.credentialId !== input.credentialId
          || typeof result.removed !== 'boolean') throw invalid();
        provider.accounts = provider.accounts.filter(account => account.id !== input.credentialId);
        if (providerId === 'local' && entry.prompt.localCredentials) entry.prompt.localCredentials.accounts = provider.accounts;
        this.#publish(entry, { id: input.id, state: 'pending', fillStatus: 'not_submitted' });
        return { id: input.id, providerId, credentialId: input.credentialId, removed: result.removed };
      } finally { if (entry.operation === operation) entry.operation = null; }
    }
    const values = Object.create(null);
    try {
      let option;
      if (['use-local', 'use-credential'].includes(input.op)) {
        if (Object.keys(input).some(key => !['op', 'id', 'credentialId', ...(input.op === 'use-credential' ? ['providerId'] : [])].includes(key))
          || typeof entry.onUseCredential !== 'function' || !provider
          || !provider.accounts.some(account => account.id === input.credentialId)) throw invalid();
      }
      if (input.op === 'submit') {
        if (Object.keys(input).some(key => !['op', 'id', 'optionId', 'values', 'saveLocal', 'saveProviderId'].includes(key))
          || input.saveLocal !== undefined && typeof input.saveLocal !== 'boolean'
          || input.saveProviderId !== undefined && !['chromium', 'local'].includes(input.saveProviderId)
          || input.saveLocal === true && input.saveProviderId !== undefined && input.saveProviderId !== 'local') throw invalid();
        if (!object(input.values)) throw invalid();
        if (entry.prompt.qr?.only && (!['ready', 'rotated'].includes(entry.prompt.qr.state)
          || !entry.prompt.qr.imageDataUrl && !entry.prompt.qr.matrix)) throw invalid();
        if (entry.prompt.options) {
          option = entry.prompt.options.find(value => value.id === input.optionId);
          if (!option) throw invalid();
        } else if (input.optionId !== undefined) throw invalid();
        const fields = entry.prompt.fields.filter(field => !option || option.fieldIds.includes(field.id));
        const allowed = new Set(fields.map(field => field.id));
        let length = 0;
        for (const [key, field] of Object.entries(input.values)) {
          if (!allowed.has(key) || !object(field) || Object.keys(field).length !== 1 || typeof field.value !== 'string'
            || field.value.length > 65536 || (length += field.value.length) > 131072) throw invalid();
          values[key] = field.value;
        }
        if (fields.some(field => field.required && !values[field.id])) throw invalid();
        const saveProviderId = input.saveProviderId ?? (input.saveLocal === true ? 'local' : undefined);
        const saveProvider = entry.prompt.credentials?.providers.find(value => value.id === saveProviderId && value.available && value.canSave);
        if (saveProviderId && (!saveProvider || input.optionId !== saveProvider.optionId
          || saveProvider.saveFieldIds.some(id => !values[id]))) throw invalid();
      }
      entry.attempted = true;
      this.#publish(entry, { id: input.id, state: 'submitting', fillStatus: 'unknown' });
      const operation = (async () => {
        if (input.op === 'skip') this.#alive(entry);
        else await this.#current(entry);
        if (['use-local', 'use-credential'].includes(input.op)) return entry.onUseCredential({ id: input.id, providerId, credentialId: input.credentialId }, entry.signal);
        return input.op === 'submit'
          ? entry.onSubmit({ id: input.id, fields: values, ...(option ? { selected_option: option.id } : {}),
            ...(input.saveLocal === true ? { save_local: true } : {}),
            ...(input.saveProviderId ? { save_provider: input.saveProviderId } : {}) }, entry.signal)
          : entry.onSkip({ id: input.id }, entry.signal);
      })();
      entry.operation = operation;
      let result;
      try { result = outcome(input.id, await operation); }
      catch { result = { id: input.id, state: 'uncertain', fillStatus: 'unknown' }; }
      return this.#publish(entry, result);
    } finally {
      for (const key of Object.keys(values)) { values[key] = ''; delete values[key]; }
      wipe(input.values);
      entry.operation = null;
    }
  }

  async close(id) {
    const entry = this.#entries.get(id);
    if (!entry) return;
    if (entry.closing) return entry.closing;
    const closing = Promise.resolve().then(async () => {
      entry.signal.removeEventListener('abort', entry.abort);
      entry.onClosed?.();
      entry.controller.abort(invalid());
      await Promise.allSettled([entry.operation].filter(Boolean));
      this.#publish(entry, { id, state: 'closed', fillStatus: entry.attempted ? 'unknown' : 'not_submitted' });
      entry.destroyed = true;
      const destroyed = Promise.all([whenDestroyed(entry.window, 'closed'), whenDestroyed(entry.contents, 'destroyed')]);
      if (!entry.window.isDestroyed()) entry.window.destroy();
      await destroyed;
      if (!entry.window.isDestroyed() || !entry.contents.isDestroyed()) throw invalid();
      await entry.isolated.clearStorageData();
      this.#entries.delete(id);
    });
    entry.closing = closing;
    return closing;
  }
  async dispose() {
    this.#disposed = true;
    const results = await Promise.allSettled([...this.#entries.keys()].map(id => this.close(id)));
    if (installedHost === this) { ipcMain.removeHandler(REQUEST); installedHost = null; }
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Private browser sign-in cleanup failed');
  }
}
