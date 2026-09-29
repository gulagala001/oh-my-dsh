// Prepare an official DSH Desktop release using verified update-feed metadata.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const [target, ...options] = process.argv.slice(2);
const usage = 'Usage: node scripts/prepare-desktop-test.mjs <win-x64|mac-arm64> [--version <DSH version>] [--release-manifest <JSON>] [--archive <local file>] [--verify-only]';
if (!['win-x64', 'mac-arm64'].includes(target)) throw new Error(usage);
let localArchive, version, releaseManifest;
let verifyOnly = false;
for (let index = 0; index < options.length; index++) {
  if (options[index] === '--verify-only' && !verifyOnly) verifyOnly = true;
  else if (options[index] === '--archive' && localArchive === undefined && options[index + 1] && !options[index + 1].startsWith('--')) {
    localArchive = options[++index];
  } else if (options[index] === '--version' && version === undefined && options[index + 1] && !options[index + 1].startsWith('--')) {
    version = options[++index];
  } else if (options[index] === '--release-manifest' && releaseManifest === undefined && options[index + 1] && !options[index + 1].startsWith('--')) {
    releaseManifest = options[++index];
  } else throw new Error(usage);
}
version ??= JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).devDependencies['@deepseek-ai/dsh'];
const manifest = JSON.parse(await readFile(releaseManifest ? resolve(releaseManifest) : new URL('desktop-releases.json', import.meta.url), 'utf8'));
if (manifest.schema !== 1 || !manifest.releases || !Object.hasOwn(manifest.releases, version) || !Object.hasOwn(manifest.releases[version], target)) {
  throw new Error(`No verified desktop release metadata for DSH ${version}/${target}. Add the official update feed's size and SHA-512 before testing this release.`);
}
const release = manifest.releases[version][target];
const expected = target === 'win-x64' ? { platform: 'win32', arch: 'x64', extension: 'exe' } : { platform: 'darwin', arch: 'arm64', extension: 'zip' };
if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(version)
  || Object.entries(expected).some(([key, value]) => release[key] !== value)
  || !Number.isSafeInteger(release.size) || release.size <= 0
  || typeof release.sha512 !== 'string' || Buffer.from(release.sha512, 'base64').length !== 64
  || Buffer.from(release.sha512, 'base64').toString('base64') !== release.sha512) throw new Error('Invalid desktop release metadata');
if (!verifyOnly && (process.platform !== release.platform || process.arch !== release.arch)) {
  throw new Error(`${target} requires ${release.platform}/${release.arch}; got ${process.platform}/${process.arch}`);
}

const filename = `deepseek-harness-${version}-${target}.${release.extension}`;
const url = `https://download.deepseek.com/dsh-desk/bin/${target}/${filename}`;
const root = resolve(process.env.OMD_DESKTOP_TEST_ROOT || join(tmpdir(), 'omd-desktop-' + version));
const archive = localArchive ? resolve(localArchive) : join(root, filename);

async function verify(file) {
  const { size } = await stat(file);
  if (size !== release.size) throw new Error(`${filename}: expected ${release.size} bytes, got ${size}`);
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('base64') !== release.sha512) throw new Error(`${filename}: SHA-512 mismatch`);
  console.log(`Verified desktop ${filename} (${size} bytes, SHA-512)`);
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
