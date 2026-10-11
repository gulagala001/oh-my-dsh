import {constants, readFileSync} from 'node:fs';
import {open, rename, unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const unavailable = cause => Object.assign(new Error('网站批注偏好无法读取或保存，原文件已保留', {cause}), {code: 'SITE_ANNOTATION_SETTINGS_UNAVAILABLE'});
const validHostnames = values => Array.isArray(values) && values.every(host => typeof host === 'string' && host
  && siteAnnotationHostname('https://' + host) === host);

// Codex HJ: HTTP(S) hostname, with exactly one terminal dot removed.
export function siteAnnotationHostname(value) {
  const url = URL.parse(value);
  return url && ['http:', 'https:'].includes(url.protocol) ? url.hostname.replace(/\.$/, '') : null;
}

async function persist(settings, disabled, answered, signal) {
  const temporary = settings.path + '.' + randomUUID() + '.tmp';
  let file;
  try {
    file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await file.writeFile(JSON.stringify({version: 1, disabledHostnames: [...disabled], permissionAnsweredHostnames: [...answered]}));
    await file.sync();
    await file.close(); file = null;
    signal?.throwIfAborted();
    await rename(temporary, settings.path);
    settings.disabled = disabled;
    settings.answered = answered;
  } finally {
    await file?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export class SiteAnnotationSettings {
  constructor(path) {
    this.path = path;
    this.disabled = new Set();
    this.answered = new Set();
    this.pending = Promise.resolve();
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      const answered = Object.hasOwn(data, 'permissionAnsweredHostnames') ? data.permissionAnsweredHostnames : [];
      if (data.version !== 1 || !validHostnames(data.disabledHostnames)
        || !validHostnames(answered)) throw new Error('Invalid annotation hostname settings');
      this.disabled = new Set(data.disabledHostnames);
      this.answered = new Set(answered);
    } catch (error) {
      if (error.code !== 'ENOENT') this.error = unavailable(error);
    }
  }

  isEnabled(siteUrl) {
    if (this.error) throw this.error;
    const hostname = siteAnnotationHostname(siteUrl);
    return hostname === null || !this.disabled.has(hostname);
  }

  // Oje: prior answers permit the hostname only while its features are enabled.
  hasPermission(siteUrl) {
    if (this.error) throw this.error;
    const hostname = siteAnnotationHostname(siteUrl);
    return hostname !== null && !this.disabled.has(hostname) && this.answered.has(hostname);
  }

  setEnabled(siteUrl, enabled, {signal} = {}) {
    const hostname = siteAnnotationHostname(siteUrl);
    if (hostname === null || typeof enabled !== 'boolean') throw new TypeError('网站批注开关需要 HTTP(S) 页面和布尔值');
    const update = async () => {
      signal?.throwIfAborted();
      if (this.error) throw this.error;
      if (this.isEnabled(siteUrl) === enabled) return {hostname, enabled};
      const disabled = new Set(this.disabled);
      if (enabled) disabled.delete(hostname); else disabled.add(hostname);
      await persist(this, disabled, new Set(this.answered), signal);
      return {hostname, enabled};
    };
    const operation = this.pending.then(update);
    this.pending = operation.catch(() => {});
    return operation;
  }

  answerPermission(siteUrl, allow, {signal} = {}) {
    const hostname = siteAnnotationHostname(siteUrl);
    if (hostname === null || typeof allow !== 'boolean') throw new TypeError('网站批注权限回答需要 HTTP(S) 页面和布尔值');
    const update = async () => {
      signal?.throwIfAborted();
      if (this.error) throw this.error;
      const disabled = new Set(this.disabled), answered = new Set(this.answered);
      answered.add(hostname);
      if (!allow) disabled.add(hostname);
      if (!this.answered.has(hostname) || !allow && !this.disabled.has(hostname)) await persist(this, disabled, answered, signal);
      const enabled = !this.disabled.has(hostname);
      return {hostname, enabled, answered: true, allowed: enabled && this.answered.has(hostname)};
    };
    const operation = this.pending.then(update);
    this.pending = operation.catch(() => {});
    return operation;
  }
}
