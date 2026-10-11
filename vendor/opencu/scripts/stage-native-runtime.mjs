import { cp, lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { nativeBuildInfo } from '../src/computer-use/native-build.mjs';
import { nativeArtifactFiles } from '../src/computer-use/native-prebuilt.mjs';

export async function stageNativeRuntime({ appPath, output } = {}) {
  if (process.platform !== 'darwin' || !appPath) throw new Error('Provide a built macOS desktop-control app.');
  const source = resolve(appPath), expected = await nativeBuildInfo();
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) throw new Error('The built app must be a real directory.');
  const info = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(source, 'Contents/Info.plist')], { encoding: 'utf8' }));
  if (info.CFBundleIdentifier !== expected.bundleIdentifier || info.CFBundleExecutable !== expected.executable
    || info.TrisoulBuildID !== expected.build || info.TrisoulProtocol !== expected.protocol) throw new Error('The desktop-control build does not match the current sources.');
  execFileSync('/usr/bin/codesign', ['--verify', '--strict', source], { stdio: 'inherit' });
  const target = resolve(output ?? fileURLToPath(new URL(`../native/computer-use/prebuilt/darwin-${process.arch}`, import.meta.url)));
  await mkdir(dirname(target), { recursive: true });
  const temporary = await mkdtemp(join(dirname(target), '.native-stage-'));
  const backup = `${temporary}.previous`;
  let moved = false;
  try {
    const bundle = 'Oh My DSH Computer Use.app', copied = join(temporary, bundle);
    await cp(source, copied, { recursive: true, dereference: false, errorOnExist: true });
    const files = await nativeArtifactFiles(copied);
    await writeFile(join(temporary, 'manifest.json'), JSON.stringify({ schemaVersion: 1,
      platform: expected.platform, arch: expected.arch, version: expected.version, protocol: expected.protocol,
      build: expected.build, bundle, files }, null, 2) + '\n', { mode: 0o644 });
    try {
      const previous = await lstat(target);
      if (!previous.isDirectory() || previous.isSymbolicLink()) throw new Error('The prior artifact is not a real directory.');
      await rename(target, backup); moved = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(temporary, target); }
    catch (error) { if (moved) await rename(backup, target); throw error; }
    if (moved) await rm(backup, { recursive: true });
    return target;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args[0] || args.length > 2) throw new Error('Usage: node scripts/stage-native-runtime.mjs APP_PATH [OUTPUT_DIRECTORY]');
  console.log(await stageNativeRuntime({ appPath: args[0], output: args[1] }));
}
