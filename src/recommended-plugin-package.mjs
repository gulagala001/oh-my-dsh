import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const ARCHIVE = { label: '下载插件安装包', accept: 'application/octet-stream', limit: 32 * 1024 * 1024, timeout: 60000 };
const MANIFEST = { label: '读取插件版本信息', accept: 'application/json', limit: 512 * 1024, timeout: 20000 };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function readBytes(url, signal, { label, accept, limit, timeout }) {
  const request = AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
  let host = new URL(url).hostname;
  try {
    const response = await fetch(url, { headers: { Accept: accept, 'User-Agent': 'OhMyDSH-PluginManager' }, signal: request });
    if (response.url) host = new URL(response.url).hostname;
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const limited = response.status === 429 || response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
      const detail = limited ? '，请求已限流，请稍后重试' : '';
      throw Object.assign(Error(`${label}失败（${host}，HTTP ${response.status}${detail}）`), {
        retryable: response.status === 408 || response.status >= 500,
      });
    }
    if (Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel().catch(() => {});
      throw Error(`${label}超过大小限制`);
    }
    const parts = [];
    let size = 0;
    for await (const part of response.body ?? []) {
      size += part.byteLength;
      if (size > limit) throw Error(`${label}超过大小限制`);
      parts.push(part);
    }
    return Buffer.concat(parts);
  } catch (error) {
    signal.throwIfAborted();
    if (error.name !== 'TypeError' && !request.aborted) throw error;
    const code = error.cause?.code;
    const networkReason = /^[A-Z][A-Z0-9_]{1,64}$/.test(code ?? '') ? code : '网络连接失败';
    const reason = request.aborted ? '请求超时' : networkReason;
    throw Object.assign(Error(`${label}失败（${host}，${reason}），请检查宿主网络或代理后重试`, { cause: error }), { retryable: true });
  }
}

async function readWithRetry(url, signal, options) {
  try { return await readBytes(url, signal, options); }
  catch (error) {
    signal.throwIfAborted();
    if (!error.retryable) throw error;
    await delay(300, undefined, { signal });
    return readBytes(url, signal, options);
  }
}

export async function readPluginManifest(url, signal) {
  const bytes = await readWithRetry(url, signal, MANIFEST);
  return JSON.parse(bytes.toString('utf8'));
}

// A release page and the asset API are separate GitHub entry points. Resolve
// only the original tagged attachment, then construct its official asset endpoint.
async function readArchive(url, signal) {
  try { return await readWithRetry(url, signal, ARCHIVE); }
  catch (error) {
    signal.throwIfAborted();
    if (!error.retryable) throw error;
    const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/releases\/download\/([^/?#]+)\/([^/?#]+)$/.exec(url);
    if (!match) throw error;
    const [, repository, tag, filename] = match;
    const releases = `https://api.github.com/repos/${repository}/releases`;
    const release = await readPluginManifest(`${releases}/tags/${tag}`, signal);
    const asset = Array.isArray(release?.assets) && release.assets.find(item =>
      item?.name === decodeURIComponent(filename) && item.browser_download_url === url);
    if (release?.draft || release?.tag_name !== decodeURIComponent(tag) || !Number.isSafeInteger(asset?.id) || asset.id <= 0) {
      throw Error('GitHub 固定发行中找不到已核验的插件安装包');
    }
    return readBytes(`${releases}/assets/${asset.id}`, signal, ARCHIVE);
  }
}

// Keep the verified archive: pnpm records file: in the profile manifest and may
// need it again after a restart, rollback or reinstall with an empty store.
export async function prepareReviewedPackage(url, sha256, directory, signal) {
  if (!/^[a-f0-9]{64}$/.test(sha256) || !directory || !isAbsolute(directory)) throw Error('已核验插件的校验值或安装包目录无效');
  signal.throwIfAborted();
  const target = join(directory, `${sha256}.tgz`);
  let cached;
  try { cached = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (cached && digest(cached) === sha256) { signal.throwIfAborted(); return 'file:' + target; }
  const bytes = await readArchive(url, signal);
  if (digest(bytes) !== sha256) throw Error('插件安装包 SHA-256 与核验版本不一致，已停止安装');
  signal.throwIfAborted();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    signal.throwIfAborted();
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
  return 'file:' + target;
}
