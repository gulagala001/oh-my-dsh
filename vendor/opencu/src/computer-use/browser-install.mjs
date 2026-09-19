import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { browserExecutablePath } from './browser.mjs';

const require = createRequire(import.meta.url);
const runFile = promisify(execFile);

/** Prepare the bundled browser without opening a browser or a user profile. */
export async function installBrowser({ executablePath, signal, resolveExecutable = browserExecutablePath, run = runFile } = {}) {
  const path = resolveExecutable(executablePath);
  if (existsSync(path)) return path;
  if (executablePath) throw new Error('自定义浏览器路径不存在，请修改路径或清空后使用自动检测。');
  const cli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
  try {
    await run(process.execPath, [cli, 'install', 'chromium'], {
      signal, timeout: 600000, maxBuffer: 1024 * 1024, windowsHide: true,
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw new Error('浏览器自动安装失败，请检查网络后重试。' + (error.killed ? ' 下载超时。' : ''), { cause: error });
  }
  if (!existsSync(resolveExecutable())) throw new Error('浏览器安装结束，但未找到可用程序，请重试。');
  return resolveExecutable();
}
