import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Keep the verified archive: pnpm records file: in the profile manifest and may
// need it again after a restart, rollback or reinstall with an empty store.
export async function prepareReviewedPackage(url, sha256, directory, signal) {
  if (!/^[a-f0-9]{64}$/.test(sha256) || !directory || !isAbsolute(directory)) throw Error('已核验插件的校验值或安装包目录无效');
  signal.throwIfAborted();
  const target = join(directory, `${sha256}.tgz`);
  let cached;
  try { cached = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (cached && digest(cached) === sha256) { signal.throwIfAborted(); return 'file:' + target; }
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
  if (!response.ok) throw Error(`下载安装包失败（HTTP ${response.status}）`);
  const parts = []; let size = 0;
  for await (const part of response.body) {
    size += part.length;
    if (size > MAX_PACKAGE_BYTES) throw Error('插件安装包超过大小限制');
    parts.push(part);
  }
  const bytes = Buffer.concat(parts);
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
