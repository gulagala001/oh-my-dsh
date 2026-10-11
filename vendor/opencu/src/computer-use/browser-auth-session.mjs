const methods = ['getNativePasswordCapabilities', 'initializeNativePasswords', 'listNativePasswords',
  'createNativePasswordReceipt', 'readNativePassword', 'saveNativePassword', 'removeNativePassword', 'revokeNativePasswordReceipt'];
const unavailable = () => Object.assign(new Error('Native browser credentials are unavailable'), { code: 'BROWSER_AUTH_UNAVAILABLE' });
const identity = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
const emptyCapabilities = () => Object.freeze({ schemaVersion: 1, provider: 'chromium', nativePasswordStore: false,
  ordinaryCredentialDelivery: false, manualCredentialSave: false, passwordOnly: false });
const erase = value => { if (value && typeof value === 'object') for (const key of ['username', 'password']) { value[key] = ''; delete value[key]; } };

function binding(origin, scope) {
  let url;
  try { url = new URL(origin); } catch { throw unavailable(); }
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password
    || scope?.frameOrigin !== origin || typeof scope.fieldBinding !== 'string'
    || !scope.fieldBinding || scope.fieldBinding.length > 16384) throw unavailable();
  return { origin, frameOrigin: scope.frameOrigin, fieldBinding: scope.fieldBinding };
}

export function browserAuthSessionEnvironment(capabilities) {
  const native = capabilities?.provider === 'chromium' && capabilities.nativePasswordStore === true;
  const plugin = capabilities?.provider === 'opencu-password-store' && capabilities.pluginPasswordStore === true
    && capabilities.persistentReady === true && capabilities.originBinding === true
    && capabilities.fieldBinding === true && capabilities.oneTimeReceipts === true
    && capabilities.privateCredentialDelivery === true && capabilities.credentialObservationProtection === true;
  if (capabilities?.schemaVersion !== 1 || !native && !plugin || capabilities.ordinaryCredentialDelivery !== true
    || capabilities.manualCredentialSave !== true) return Object.freeze({});
  return Object.freeze({ BROWSER_AUTH_BROKER_CREDENTIAL_BINDING_VERSION: '2',
    BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION: '10', BROWSER_AUTH_BROKER_CREDENTIAL_OPTIONS_VERSION: '1',
    ...(capabilities.passwordOnly === true ? { BROWSER_AUTH_BROKER_PASSWORD_ONLY_VERSION: '1' } : {}) });
}

// This bridge calls the owned Session's Chromium password engine. No socket,
// renderer password API, OS-store substitution or external browser discovery.
export class BrowserAuthNativePasswordProvider {
  #session; #initializing; #ready = false; #disposed = false; #receipts = new WeakMap(); #active = new Set();
  #capabilities = emptyCapabilities();
  constructor(session) { this.#session = session; }
  get available() { return this.#ready && !this.#disposed; }
  get capabilities() { return this.#capabilities; }
  async initialize() {
    if (this.#disposed) throw unavailable();
    this.#initializing ??= (async () => {
      if (!this.#session || methods.some(method => typeof this.#session[method] !== 'function')) throw unavailable();
      await this.#session.initializeNativePasswords();
      const capabilities = await this.#session.getNativePasswordCapabilities();
      if (this.#disposed || capabilities?.available !== true || capabilities.version !== 1
        || capabilities.originBinding !== true || capabilities.fieldBinding !== true
        || capabilities.oneTimeReceipts !== true || capabilities.provider !== 'chromium-password-store'
        || capabilities.persistentReady !== true) throw unavailable();
      this.#ready = true;
      this.#capabilities = Object.freeze({ schemaVersion: 1, provider: 'chromium', nativePasswordStore: true,
        ordinaryCredentialDelivery: true, manualCredentialSave: true, passwordOnly: true });
    })();
    const initializing = this.#initializing;
    try { await initializing; }
    catch { this.#ready = false; this.#capabilities = emptyCapabilities(); throw unavailable(); }
    finally { if (this.#initializing === initializing) this.#initializing = undefined; }
    return this.#capabilities;
  }
  #assert() { if (!this.available) throw unavailable(); }
  async list(origin, scope) {
    this.#assert(); const bound = binding(origin, scope);
    const records = await this.#session.listNativePasswords(bound);
    try {
      this.#assert();
      if (!Array.isArray(records) || records.length > 1000) throw unavailable();
      return records.map(record => {
        if (!identity(record?.id) || typeof record.username !== 'string' || record.username.length > 16384
          || record.origin !== undefined && record.origin !== origin || record.password !== undefined) throw unavailable();
        return { id: record.id, origin, username: record.username, updatedAt: record.updatedAt };
      });
    } finally { if (Array.isArray(records)) for (const record of records) erase(record); }
  }
  createUserReceipt(input) {
    this.#assert();
    if (!input || !['read', 'save', 'remove'].includes(input.action)
      || input.action !== 'save' && !identity(input.id)
      || input.username !== undefined && (typeof input.username !== 'string' || input.username.length > 16384)) throw unavailable();
    const bound = binding(input.origin, input.scope);
    const token = this.#session.createNativePasswordReceipt({ ...bound, action: input.action,
      ...(input.id ? { id: input.id } : {}), ...(input.username !== undefined ? { username: input.username } : {}) });
    if (token == null || typeof token?.then === 'function') throw unavailable();
    const receipt = Object.freeze(Object.create(null));
    this.#receipts.set(receipt, { token, action: input.action, id: input.id, username: input.username,
      ...bound, consumed: false });
    this.#active.add(receipt); return receipt;
  }
  #consume(receipt, action, id, bound, username) {
    this.#assert(); const grant = this.#receipts.get(receipt);
    if (!grant || grant.consumed || grant.action !== action || grant.id !== id
      || grant.origin !== bound.origin || grant.frameOrigin !== bound.frameOrigin || grant.fieldBinding !== bound.fieldBinding
      || grant.username !== undefined && grant.username !== username) throw unavailable();
    grant.consumed = true; return grant;
  }
  async read(id, origin, scope, receipt) {
    const bound = binding(origin, scope), grant = this.#consume(receipt, 'read', id, bound,
      this.#receipts.get(receipt)?.username);
    let value;
    try {
      value = await this.#session.readNativePassword(id, bound, grant.token);
      this.#assert();
      if (!this.#active.has(receipt) || !value || typeof value.username !== 'string'
        || typeof value.password !== 'string' || !value.password || value.password.length > 16384
        || grant.username !== undefined && value.username !== grant.username) throw unavailable();
      return { id, origin, username: value.username, password: value.password };
    } finally { erase(value); await this.revokeReceipt(receipt); }
  }
  async save(record, receipt) {
    const bound = binding(record.origin, record.scope);
    if (typeof record.username !== 'string' || typeof record.password !== 'string' || !record.password) throw unavailable();
    const grant = this.#consume(receipt, 'save', undefined, bound, record.username);
    try {
      const result = await this.#session.saveNativePassword({ ...bound, username: record.username, password: record.password }, grant.token);
      this.#assert();
      if (!this.#active.has(receipt) || result?.saved !== true || !identity(result.id) || result.password !== undefined
        || result.origin !== undefined && result.origin !== bound.origin) throw unavailable();
      return { id: result.id, origin: bound.origin, username: record.username };
    } finally { await this.revokeReceipt(receipt); }
  }
  async remove(id, origin, receipt) {
    const grant = this.#receipts.get(receipt), bound = binding(origin, grant && { frameOrigin: grant.frameOrigin, fieldBinding: grant.fieldBinding });
    this.#consume(receipt, 'remove', id, bound, grant?.username);
    try {
      const result = await this.#session.removeNativePassword(id, bound, grant.token);
      this.#assert();
      if (!this.#active.has(receipt) || typeof result?.removed !== 'boolean') throw unavailable();
      return { removed: result.removed };
    } finally { await this.revokeReceipt(receipt); }
  }
  async revokeReceipt(receipt) {
    const grant = this.#receipts.get(receipt);
    this.#active.delete(receipt); this.#receipts.delete(receipt);
    if (grant) await this.#session.revokeNativePasswordReceipt(grant.token);
  }
  async dispose() {
    if (this.#disposed) return;
    this.#disposed = true; this.#ready = false; this.#capabilities = emptyCapabilities();
    const results = await Promise.allSettled([...this.#active].map(receipt => this.revokeReceipt(receipt)));
    if (results.some(result => result.status === 'rejected')) throw unavailable();
  }
}
