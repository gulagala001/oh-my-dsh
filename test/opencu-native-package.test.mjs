import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {chmod, copyFile, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkMacHelperDistribution} from '../vendor/opencu/src/native/macos-identity.mjs';
import {nativePackageModes} from '../scripts/native-package-modes.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const command = `native/bin/darwin-${process.arch}/OpenCU Helper.app/Contents/MacOS/opencu-native`;
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');

test('native helper stays executable through npm packing and both OpenCU sync inputs', {skip: process.platform !== 'darwin'}, async () => {
  const local = join(root, '../.local');
  await mkdir(local, {recursive: true});
  const directory = await mkdtemp(join(local, 'native-package-test-'));
  try {
    const host = join(directory, 'omd'), source = join(directory, 'opencu');
    const bundled = join(host, 'vendor/opencu');
    await mkdir(join(host, 'scripts'), {recursive: true});
    for (const name of ['sync-opencu.mjs', 'native-package-modes.mjs', 'check-opencu-native.mjs']) {
      await copyFile(join(root, 'scripts', name), join(host, 'scripts', name));
    }
    await mkdir(join(bundled, 'src/native'), {recursive: true});
    for (const name of ['macos-identity.mjs', 'protocol.mjs']) {
      await copyFile(join(root, 'vendor/opencu/src/native', name), join(bundled, 'src/native', name));
    }
    await mkdir(join(bundled, 'extension'), {recursive: true});
    for (const name of ['click-options.js', 'key-options.js']) {
      await copyFile(join(root, 'vendor/opencu/extension', name), join(bundled, 'extension', name));
    }
    await mkdir(join(bundled, 'native/macos'), {recursive: true});
    await copyFile(join(root, 'vendor/opencu/native/macos/signing-identity.json'), join(bundled, 'native/macos/signing-identity.json'));
    await cp(bundled, source, {recursive: true});
    await mkdir(join(source, `native/bin/darwin-${process.arch}`), {recursive: true});
    await cp(join(root, 'vendor/opencu', `native/bin/darwin-${process.arch}/OpenCU Helper.app`), join(source, `native/bin/darwin-${process.arch}/OpenCU Helper.app`), {recursive: true});
    await chmod(join(source, command), 0o644);
    const manifest = JSON.parse(await readFile(join(root, 'vendor/opencu/package.json'), 'utf8'));
    await writeFile(join(source, 'package.json'), JSON.stringify({name: manifest.name, version: manifest.version, files: ['src', 'lib', 'native', 'extension'], exports: {'./integration': './src/dsh/index.mjs'}, peerDependencies: manifest.peerDependencies, opencu: manifest.opencu}));
    await mkdir(join(source, 'lib'));
    await writeFile(join(source, 'lib/client.js'), 'window.__ModuleLoader__.load({id:"opencu",factory:(require)=>{var module={exports:{}};var exports=module.exports;return module.exports;}});\n');
    await copyFile(join(root, 'package.json'), join(host, 'package.json'));
    const npm = process.env.OMD_NPM_ENTRY;
    const packed = await exec(npm ? process.execPath : 'npm', [...(npm ? [npm] : []), 'pack', '--json', '--ignore-scripts', '--pack-destination', directory], {cwd: source, maxBuffer: 8 * 1024 * 1024});
    const archive = join(directory, JSON.parse(packed.stdout)[0].filename);
    const originalArchive = await hash(archive), originalBinary = await hash(join(source, command));
    const unpacked = join(directory, 'unpacked');
    await mkdir(unpacked);
    await exec('/usr/bin/tar', ['-xzf', archive, '-C', unpacked]);
    const normalized = join(unpacked, 'package');
    assert.equal((await stat(join(normalized, command))).mode & 0o777, 0o644, 'the input package reproduces the deployed permission loss');
    await assert.rejects(checkMacHelperDistribution(normalized), {code: 'NATIVE_HELPER_UNAVAILABLE'});
    const sync = async input => {
      await exec(process.execPath, [join(host, 'scripts/sync-opencu.mjs'), input], {env: process.env, maxBuffer: 8 * 1024 * 1024});
      assert.equal((await stat(join(bundled, command))).mode & 0o777, 0o755);
      assert.equal(await hash(join(bundled, command)), originalBinary);
      await checkMacHelperDistribution(bundled);
    };
    await sync(archive);
    assert.equal(await hash(archive), originalArchive, 'sync must not rewrite an incoming release archive');
    if (npm) await sync(source);
    else {
      const npmRoot = (await exec('npm', ['root', '-g'])).stdout.trim();
      await exec(process.execPath, [join(host, 'scripts/sync-opencu.mjs'), source], {env: {...process.env, OMD_NPM_ENTRY: join(npmRoot, 'npm/bin/npm-cli.js')}, maxBuffer: 8 * 1024 * 1024});
      assert.equal((await stat(join(bundled, command))).mode & 0o777, 0o755);
      await checkMacHelperDistribution(bundled);
    }
    const nestedArchive = join(directory, 'nested.tgz');
    const nested = join(unpacked, 'package/vendor/opencu');
    await mkdir(join(unpacked, 'package/vendor'), {recursive: true});
    await cp(source, nested, {recursive: true});
    await chmod(join(nested, command), 0o644);
    await exec('/usr/bin/tar', ['--format=ustar', '--no-xattrs', '-czf', nestedArchive, '-C', unpacked, 'package/vendor']);
    await nativePackageModes(nestedArchive);
    const checked = join(directory, 'checked');
    await mkdir(checked);
    await exec('/usr/bin/tar', ['-xzf', nestedArchive, '-C', checked]);
    await checkMacHelperDistribution(join(checked, 'package/vendor/opencu'));
  } finally { await rm(directory, {recursive: true, force: true}); }
});
