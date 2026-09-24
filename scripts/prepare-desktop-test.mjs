// Prepare a pinned, official DSH Desktop release for the packaged-app test.
// The SHA-512 values and sizes come from the rc.2 production update feeds.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const releases = {
  'win-x64': {
    platform: 'win32', arch: 'x64', extension: 'exe', size: 288245480,
    sha512: 'AY7f45dYO7BFrfgaLmzXNWP0pavlxkSbsehPo/WF6PXcFdDK3fF1oHUPs/4f2bzROgQvm6wSgawZ/g7UzbPRmw==',
  },
  'mac-arm64': {
    platform: 'darwin', arch: 'arm64', extension: 'zip', size: 372794444,
    sha512: 'aOfxtRvFqTRRp3zqu6nXNgILgVdHDPyfslhUVNnU1wMYw1dY1vTelptJeAmUDt7G822SCqHzxtPwMmvCGekveA==',
  },
};

const [target, ...options] = process.argv.slice(2);
const release = releases[target];
const usage = 'Usage: node scripts/prepare-desktop-test.mjs <win-x64|mac-arm64> [--archive <local file>] [--verify-only]';
if (!release) throw new Error(usage);
let localArchive;
let verifyOnly = false;
for (let index = 0; index < options.length; index++) {
  if (options[index] === '--verify-only' && !verifyOnly) verifyOnly = true;
  else if (options[index] === '--archive' && localArchive === undefined && options[index + 1] && !options[index + 1].startsWith('--')) {
    localArchive = options[++index];
  } else throw new Error(usage);
}
if (!verifyOnly && (process.platform !== release.platform || process.arch !== release.arch)) {
  throw new Error(`${target} requires ${release.platform}/${release.arch}; got ${process.platform}/${process.arch}`);
}

const filename = `deepseek-harness-0.1.7-rc.2-${target}.${release.extension}`;
const url = `https://download.deepseek.com/dsh-desk/bin/${target}/${filename}`;
const root = resolve(process.env.OMD_DESKTOP_TEST_ROOT || join(tmpdir(), 'omd-desktop-rc2'));
const archive = localArchive ? resolve(localArchive) : join(root, filename);

async function verify(file) {
  const { size } = await stat(file);
  if (size !== release.size) throw new Error(`${filename}: expected ${release.size} bytes, got ${size}`);
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('base64') !== release.sha512) throw new Error(`${filename}: SHA-512 mismatch`);
  console.log(`Verified official ${filename} (${size} bytes, SHA-512)`);
}

async function download() {
  await mkdir(root, { recursive: true });
  const part = `${archive}.part`;
  await rm(part, { force: true });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15 * 60_000) });
    if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > 0 && length !== release.size) {
      throw new Error(`${filename}: server advertises ${length} bytes, expected ${release.size}`);
    }
    let received = 0;
    await pipeline(Readable.fromWeb(response.body), new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        callback(null, chunk);
      },
    }), createWriteStream(part));
    if (received !== release.size) throw new Error(`${filename}: downloaded ${received} bytes, expected ${release.size}`);
    await verify(part);
    await rename(part, archive);
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

async function command(executable, args) {
  await new Promise((done, reject) => {
    const child = spawn(executable, args, { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? done() : reject(new Error(`${executable} exited with ${code ?? signal}`)));
  });
}

if (localArchive) await verify(archive);
else if (verifyOnly) throw new Error('--verify-only requires --archive');
else await download();

if (!verifyOnly) {
  let executable;
  if (target === 'mac-arm64') {
    const appRoot = join(root, 'mac-app');
    await mkdir(appRoot, { recursive: true });
    await command('ditto', ['-x', '-k', archive, appRoot]);
    executable = join(appRoot, 'DeepSeek Harness.app', 'Contents', 'MacOS', 'DeepSeek Harness');
  } else {
    const installRoot = join(root, 'windows-app');
    if (/\s/u.test(installRoot)) throw new Error('NSIS /D= installation path must contain no spaces');
    await mkdir(root, { recursive: true });
    // NSIS requires /D= to be the final argument. This per-user install stays in runner.temp.
    await command(archive, ['/S', `/D=${installRoot}`]);
    executable = join(installRoot, 'DeepSeek Harness.exe');
  }
  await access(executable);
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `OMD_DESKTOP_EXECUTABLE=${executable}\n`);
  console.log(`Desktop executable: ${executable}`);
}
