import { randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fail, record } from './ipc.mjs';
import { DEVICE_TYPES, exactOrigin, permissionType, typeSetting, siteKey } from './permission-schema.mjs';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_RECORDS = 10000;
const timestamp = value => Number.isSafeInteger(value) && value >= 0;
const keys = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const empty = () => ({ schemaVersion: 1, revision: 0, defaults: [], sites: [], devices: [] });

export function deviceIdentity(type, device) {
  if (!DEVICE_TYPES.has(type) || !record(device)) throw fail('The device identity is unavailable', 'PERMISSION_IDENTITY_UNAVAILABLE');
  const bounded = value => typeof value === 'string' && value.length > 0 && value.length <= 8192;
  const vendorId = Number(device.vendorId), productId = Number(device.productId);
  const ids = Number.isInteger(vendorId) && vendorId >= 0 && vendorId <= 65535
    && Number.isInteger(productId) && productId >= 0 && productId <= 65535;
  // Session-local device IDs do not survive restarts. Persistent grants require
  // a serial number or an actual OS device instance, not vendor/product alone.
  let persistent;
  if (ids && bounded(device.serialNumber)) persistent = ['serial-number', vendorId, productId, device.serialNumber];
  else if (type === 'serial' && bounded(device.deviceInstanceId)) persistent = ['device-instance', device.deviceInstanceId];
  const local = type === 'serial' ? device.portId : device.deviceId;
  if (!persistent && !bounded(local)) throw fail('The selected device has no stable identity', 'PERMISSION_IDENTITY_UNAVAILABLE');
  return { key: createHash('sha256').update(JSON.stringify([type, ...(persistent ?? ['session-device', local])])).digest('hex'), persistent: persistent !== undefined };
}

function decode(value) {
  if (!keys(value, ['schemaVersion', 'revision', 'defaults', 'sites', 'devices']) || value.schemaVersion !== 1
    || !timestamp(value.revision) || !Array.isArray(value.defaults) || !Array.isArray(value.sites) || !Array.isArray(value.devices)
    || value.defaults.length + value.sites.length + value.devices.length > MAX_RECORDS) throw fail('Invalid saved website permissions', 'PERMISSION_STORAGE_INVALID');
  const seen = new Set();
  for (const item of value.defaults) {
    if (!keys(item, ['type', 'setting', 'updatedAt']) || !timestamp(item.updatedAt)) throw fail('Invalid saved default permission', 'PERMISSION_STORAGE_INVALID');
    permissionType(item.type); typeSetting(item.type, item.setting);
    const key = `default:${item.type}`;
    if (seen.has(key)) throw fail('Duplicate saved default permission', 'PERMISSION_STORAGE_INVALID');
    seen.add(key);
  }
  for (const item of value.sites) {
    if (!keys(item, ['type', 'requestingOrigin', 'embeddingOrigin', 'setting', 'updatedAt']) || !timestamp(item.updatedAt))
      throw fail('Invalid saved site permission', 'PERMISSION_STORAGE_INVALID');
    permissionType(item.type); typeSetting(item.type, item.setting); exactOrigin(item.requestingOrigin); exactOrigin(item.embeddingOrigin);
    const key = siteKey(item.type, item.requestingOrigin, item.embeddingOrigin);
    if (seen.has(key)) throw fail('Duplicate saved site permission', 'PERMISSION_STORAGE_INVALID');
    seen.add(key);
  }
  for (const item of value.devices) {
    if (!keys(item, ['deviceType', 'origin', 'deviceKey', 'updatedAt']) || !DEVICE_TYPES.has(item.deviceType)
      || !/^[a-f0-9]{64}$/u.test(item.deviceKey) || !timestamp(item.updatedAt)) throw fail('Invalid saved device permission', 'PERMISSION_STORAGE_INVALID');
    exactOrigin(item.origin);
    const key = JSON.stringify(['device', item.deviceType, item.origin, item.deviceKey]);
    if (seen.has(key)) throw fail('Duplicate saved device permission', 'PERMISSION_STORAGE_INVALID');
    seen.add(key);
  }
  return value;
}

export class PermissionStore {
  constructor(directory) {
    if (!isAbsolute(directory ?? '')) throw fail('Permission storage directory must be absolute', 'PERMISSION_STORAGE_INVALID');
    this.directory = resolve(directory); this.path = join(this.directory, 'permissions.json');
    this.state = empty(); this.ready = false; this.closing = false; this.queue = Promise.resolve();
  }
  initialize() {
    if (this.initializing) return this.initializing;
    this.initializing = this.load();
    return this.initializing;
  }
  async ownedDirectory() {
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(this.directory) !== this.directory
      || process.getuid && info.uid !== process.getuid() || process.platform !== 'win32' && (info.mode & 0o077) !== 0)
      throw fail('Permission storage requires a private owned directory', 'PERMISSION_STORAGE_INVALID');
  }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.ownedDirectory();
    let handle;
    try {
      const entry = await lstat(this.path);
      if (entry.isSymbolicLink()) throw fail('Website permissions cannot be loaded through a symlink', 'PERMISSION_STORAGE_INVALID');
      handle = await open(this.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_BYTES || process.getuid && info.uid !== process.getuid()
        || process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw fail('Invalid website permission storage file', 'PERMISSION_STORAGE_INVALID');
      this.state = decode(JSON.parse(await handle.readFile('utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.write(empty());
    } finally { await handle?.close(); }
    this.ready = true;
    return this;
  }
  async write(state, { signal, assertCurrent } = {}) {
    decode(state);
    const bytes = Buffer.from(JSON.stringify(state));
    if (bytes.length > MAX_BYTES) throw fail('Website permission storage reached its limit', 'RESOURCE_LIMIT');
    await this.ownedDirectory();
    const temporary = join(this.directory, `.permissions-${randomUUID()}.tmp`);
    let handle, renamed = false;
    try {
      handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
      await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = undefined;
      signal?.throwIfAborted(); assertCurrent?.();
      await rename(temporary, this.path); renamed = true;
      if (process.platform !== 'win32') {
        const directory = await open(this.directory, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
        try { await directory.sync(); } finally { await directory.close(); }
      }
    } catch (error) {
      if (renamed) { this.ready = false; this.error = error; }
      throw error;
    } finally { await handle?.close(); if (!renamed) await rm(temporary, { force: true }); }
  }
  mutate(change, options = {}) {
    if (!this.ready || this.closing) return Promise.reject(fail('Website permission storage is unavailable', 'PERMISSION_STORAGE_UNAVAILABLE'));
    const job = this.queue.then(async () => {
      if (!this.ready || this.closing) throw fail('Website permission storage is unavailable', 'PERMISSION_STORAGE_UNAVAILABLE');
      options.signal?.throwIfAborted(); options.assertCurrent?.();
      const next = structuredClone(this.state), result = change(next);
      next.revision++;
      await this.write(next, options);
      this.state = next;
      options.committed?.();
      return result;
    });
    this.queue = job.catch(() => {});
    return job;
  }
  default(type) { return this.state.defaults.find(item => item.type === type)?.setting ?? 'ask'; }
  site(type, requestingOrigin, embeddingOrigin) {
    return this.state.sites.find(item => item.type === type && item.requestingOrigin === requestingOrigin && item.embeddingOrigin === embeddingOrigin);
  }
  setting(type, requestingOrigin, embeddingOrigin) { return this.site(type, requestingOrigin, embeddingOrigin)?.setting ?? this.default(type); }
  device(type, origin, key) { return this.state.devices.some(item => item.deviceType === type && item.origin === origin && item.deviceKey === key); }
  summary() {
    const sites = new Set([...this.state.sites.map(item => item.requestingOrigin), ...this.state.devices.map(item => item.origin)]);
    return { source: 'opencu-permission-store', persistentReady: this.ready, revision: this.state.revision,
      siteCount: sites.size, count: this.state.sites.length + this.state.devices.length,
      settingCount: this.state.sites.length, deviceCount: this.state.devices.length, defaultCount: this.state.defaults.length };
  }
  async close() { this.closing = true; await this.queue; this.ready = false; }
}
