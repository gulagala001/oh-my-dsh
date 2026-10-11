import { constants, createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { copyFile, lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { windowsNativeBuild } from '../src/computer-use/windows-native-build.mjs';
import { windowsNativeArtifactFiles, windowsNativeFileHash, WINDOWS_NATIVE_PREBUILT_ROOT } from '../src/computer-use/windows-native-prebuilt.mjs';

export async function stageWindowsNativeRuntime({ arch = process.arch, source, output } = {}) {
  const expected = await windowsNativeBuild(arch);
  const directory = resolve(source ?? fileURLToPath(new URL(`../dist/desktop-${expected.rid}/`, import.meta.url)));
  const target = resolve(output ?? join(WINDOWS_NATIVE_PREBUILT_ROOT, `win32-${arch}`));
  if (!isAbsolute(directory) || !isAbsolute(target) || target === directory) throw new Error('Windows staging requires separate absolute source and output directories.');
  const original = await windowsNativeArtifactFiles(directory, expected);
  await mkdir(dirname(target), { recursive: true });
  const parent = await lstat(dirname(target));
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('Windows artifact parent must be a real directory.');
  const temporary = await mkdtemp(join(dirname(target), '.windows-native-stage-')), backup = `${temporary}.previous`;
  let moved = false;
  try {
    for (const file of original.files) await copyFile(join(directory, file.path), join(temporary, file.path), constants.COPYFILE_EXCL);
    const copied = await windowsNativeArtifactFiles(temporary, expected);
    if (JSON.stringify(original.files) !== JSON.stringify(copied.files) || (await windowsNativeBuild(arch)).build !== expected.build) throw new Error('Windows build files or plugin sources changed during staging.');
    const archivePath = expected.executable + '.gz';
    await pipeline(createReadStream(join(temporary, expected.executable)), createGzip({ level: 9 }), createWriteStream(join(temporary, archivePath), { flags: 'wx' }));
    const archive = { format: 'gzip', path: archivePath, size: (await lstat(join(temporary, archivePath))).size, sha256: await windowsNativeFileHash(join(temporary, archivePath)) };
    await rm(join(temporary, expected.executable));
    await writeFile(join(temporary, 'manifest.json'), JSON.stringify({ schemaVersion: 1, artifact: 'opencu-windows-desktop',
      ...expected, selfContained: copied.binary.selfContained, singleFile: copied.binary.singleFile,
      bundleVersion: copied.binary.bundleVersion, archive, files: copied.files }, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    try {
      const previous = await lstat(target);
      if (!previous.isDirectory() || previous.isSymbolicLink()) throw new Error('The previous Windows artifact must be a real directory.');
      await rename(target, backup); moved = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(temporary, target); }
    catch (error) { if (moved) await rename(backup, target); throw error; }
    if (moved) await rm(backup, { recursive: true });
    return { directory: target, platform: expected.platform, arch: expected.arch, build: expected.build,
      staged: true, runtimeExecutionVerified: false };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let arch, source, output;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--arch' && arch === undefined && ['x64', 'arm64'].includes(value)) arch = value;
    else if (flag === '--source' && source === undefined) source = value;
    else if (flag === '--output' && output === undefined) output = value;
    else throw new Error('Usage: node scripts/stage-windows-native-runtime.mjs [--arch x64|arm64] [--source DIRECTORY] [--output DIRECTORY]');
  }
  console.log(JSON.stringify(await stageWindowsNativeRuntime({ arch, source, output }), null, 2));
}
