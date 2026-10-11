import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { copyFile, lstat, open, readFile, readdir, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WINDOWS_NATIVE_IDENTITY } from './windows-native-build.mjs';

export const WINDOWS_NATIVE_PREBUILT_ROOT = fileURLToPath(new URL('../../native/computer-use/prebuilt/', import.meta.url));
const digestPattern = /^[a-f0-9]{64}$/;
const maximumExecutableBytes = 512 * 1024 * 1024;
const buildFilename = 'build.json';
const manifestFilename = 'manifest.json';
const invalid = detail => Object.assign(new Error(`Windows packaged desktop runtime is invalid: ${detail}`), { code: 'WINDOWS_NATIVE_ARTIFACT_INVALID' });

function expectedIdentity(expected) {
  if (!expected || !['x64', 'arm64'].includes(expected.arch) || expected.rid !== `win-${expected.arch}`
    || !digestPattern.test(expected.build ?? '')
    || Object.entries(WINDOWS_NATIVE_IDENTITY).some(([key, value]) => expected[key] !== value)) throw invalid('plugin build identity');
}

async function realDirectory(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw invalid('linked or non-directory artifact path');
}

async function regularFile(path, limit) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw invalid('linked, non-file or oversized artifact');
  return info;
}

export async function windowsNativeFileHash(path) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  return digest.digest('hex');
}

async function readRange(handle, offset, size) {
  const bytes = Buffer.alloc(size);
  let received = 0;
  while (received < size) {
    const value = await handle.read(bytes, received, size - received, offset + received);
    if (!value.bytesRead) throw invalid('truncated executable');
    received += value.bytesRead;
  }
  return bytes;
}

// IMAGE_EXPORT_DIRECTORY and its RVA-based name/address/ordinal tables:
// https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#export-directory-table
function peExports(host, optionalOffset, optionalSize, sectionTable) {
  if (optionalOffset + optionalSize > host.length || optionalSize < 112) throw invalid('PE optional header bounds');
  const imageSize = host.readUInt32LE(optionalOffset + 56), headerSize = host.readUInt32LE(optionalOffset + 60);
  const directoryCount = host.readUInt32LE(optionalOffset + 108);
  if (!imageSize || !headerSize || headerSize > host.length || headerSize > imageSize
    || directoryCount > Math.floor((optionalSize - 112) / 8)) throw invalid('PE data directory bounds');
  if (!directoryCount) return new Map();
  const exportRva = host.readUInt32LE(optionalOffset + 112), exportSize = host.readUInt32LE(optionalOffset + 116);
  if (!exportRva && !exportSize) return new Map();
  if (!exportRva || exportSize < 40 || exportRva + exportSize > imageSize) throw invalid('PE export directory bounds');
  const sections = [];
  for (let offset = 0; offset < sectionTable.length; offset += 40) sections.push({
    virtualSize: sectionTable.readUInt32LE(offset + 8), rva: sectionTable.readUInt32LE(offset + 12),
    rawSize: sectionTable.readUInt32LE(offset + 16), rawOffset: sectionTable.readUInt32LE(offset + 20),
    characteristics: sectionTable.readUInt32LE(offset + 36),
  });
  const region = (rva, size, fileBacked = true) => {
    if (!Number.isSafeInteger(rva) || !Number.isSafeInteger(size) || rva <= 0 || size <= 0
      || rva + size > imageSize || rva + size > 0x100000000) throw invalid('PE export RVA bounds');
    const matches = [];
    if (rva < headerSize && rva + size <= headerSize) matches.push({ offset: rva, remaining: headerSize - rva, characteristics: 0, header: true });
    for (const section of sections) {
      const span = Math.max(section.virtualSize, section.rawSize), delta = rva - section.rva;
      if (delta < 0 || delta + size > span) continue;
      if (fileBacked && (delta + size > section.rawSize || section.rawOffset + delta + size > host.length))
        throw invalid('PE export RVA has no file data');
      matches.push({ offset: section.rawOffset + delta, remaining: section.rawSize - delta,
        characteristics: section.characteristics, header: false });
    }
    if (matches.length !== 1) throw invalid('unmapped or ambiguous PE export RVA');
    return matches[0];
  };
  const table = (rva, count, width) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > 65536) throw invalid('PE export table size');
    if (!count) return Buffer.alloc(0);
    const { offset } = region(rva, count * width);
    return host.subarray(offset, offset + count * width);
  };
  const text = (rva, endRva = imageSize) => {
    const value = region(rva, 1), limit = Math.min(value.remaining, endRva - rva, 1024);
    let length = 0;
    while (length < limit && host[value.offset + length] !== 0) {
      const byte = host[value.offset + length];
      if (byte < 0x20 || byte > 0x7e) throw invalid('invalid PE export text');
      length++;
    }
    if (!length || length >= limit) throw invalid('unterminated or oversized PE export text');
    return host.toString('ascii', value.offset, value.offset + length);
  };
  const { offset: directoryOffset } = region(exportRva, 40);
  const directory = host.subarray(directoryOffset, directoryOffset + 40);
  text(directory.readUInt32LE(12));
  const ordinalBase = directory.readUInt32LE(16), addressCount = directory.readUInt32LE(20), nameCount = directory.readUInt32LE(24);
  const addresses = table(directory.readUInt32LE(28), addressCount, 4);
  const names = table(directory.readUInt32LE(32), nameCount, 4);
  const ordinals = table(directory.readUInt32LE(36), nameCount, 2);
  const exports = new Map();
  let previousName;
  for (let index = 0; index < nameCount; index++) {
    const name = text(names.readUInt32LE(index * 4)), addressIndex = ordinals.readUInt16LE(index * 2);
    if (addressIndex >= addressCount || ordinalBase + addressIndex > 0xffffffff
      || previousName !== undefined && name <= previousName) throw invalid('invalid PE export name or ordinal table');
    previousName = name;
    const rva = addresses.readUInt32LE(addressIndex * 4);
    if (!rva) throw invalid('named PE export has no address');
    const forwarded = rva >= exportRva && rva < exportRva + exportSize;
    if (forwarded) text(rva, exportRva + exportSize);
    exports.set(name, { ordinal: ordinalBase + addressIndex, rva, forwarded,
      section: forwarded ? undefined : region(rva, 1, false) });
  }
  return exports;
}

function staticSingleFileRuntime(exports) {
  // .NET 10 singlefilehost links coreclr_static, including its JIT, and exports
  // these runtime symbols instead of bundling coreclr.dll and clrjit.dll.
  // https://github.com/dotnet/runtime/blob/v10.0.0/src/native/corehost/apphost/static/singlefilehost.def
  const required = [['g_CLREngineMetrics', 2], ['CLRJitAttachState', 3], ['DotNetRuntimeInfo', 4],
    ['g_dacTable'], ['MetaDataGetDispenser'], ['DotNetRuntimeContractDescriptor']];
  return required.every(([name, ordinal]) => {
    const exported = exports.get(name);
    if (!exported || exported.forwarded || exported.section.header
      || ordinal !== undefined && exported.ordinal !== ordinal) return false;
    const attributes = exported.section.characteristics;
    return name === 'MetaDataGetDispenser' ? (attributes & 0x20000000) !== 0 : (attributes & 0x40000000) !== 0;
  });
}

// .NET 10 HostModel's Bundler/Manifest/FileEntry format, read without executing
// a Windows program: https://github.com/dotnet/runtime/tree/v10.0.0/src/installer/managed/Microsoft.NET.HostModel/Bundle
export async function inspectWindowsNativeBinary(binary, arch) {
  if (!['x64', 'arm64'].includes(arch)) throw invalid('unsupported PE architecture');
  const file = await regularFile(binary, maximumExecutableBytes), handle = await open(binary, 'r');
  try {
    if (file.size < 64) throw invalid('missing PE header');
    const prefix = await readRange(handle, 0, Math.min(file.size, 4 * 1024 * 1024));
    const peOffset = prefix.readUInt32LE(0x3c);
    if (prefix.toString('ascii', 0, 2) !== 'MZ' || peOffset < 64 || peOffset > file.size - 26) throw invalid('PE signature');
    const pe = await readRange(handle, peOffset, 26);
    if (pe.readUInt32LE(0) !== 0x00004550 || pe.readUInt16LE(4) !== { x64: 0x8664, arm64: 0xaa64 }[arch]
      || pe.readUInt16LE(24) !== 0x20b || !(pe.readUInt16LE(22) & 0x0002) || pe.readUInt16LE(22) & 0x2000) throw invalid('PE executable architecture');
    const sectionCount = pe.readUInt16LE(6), optionalSize = pe.readUInt16LE(20);
    const tableOffset = peOffset + 24 + optionalSize;
    if (!sectionCount || sectionCount > 96 || optionalSize < 112 || tableOffset + sectionCount * 40 > file.size)
      throw invalid('PE section table');
    const sections = await readRange(handle, tableOffset, sectionCount * 40);
    let hostEnd = tableOffset + sections.length;
    for (let index = 0; index < sectionCount; index++) {
      const size = sections.readUInt32LE(index * 40 + 16), offset = sections.readUInt32LE(index * 40 + 20);
      if (size) hostEnd = Math.max(hostEnd, offset + size);
    }
    if (hostEnd > file.size || hostEnd > 64 * 1024 * 1024) throw invalid('PE host image bounds');
    const host = await readRange(handle, 0, hostEnd);
    const staticallyLinkedRuntime = staticSingleFileRuntime(peExports(host, peOffset + 24, optionalSize, sections));
    // Fixed marker from .NET 10 src/native/corehost/apphost/bundle_marker.cpp.
    const signature = Buffer.from('8b1202b96a612038727b930214d7a03213f5b9e6efae3318ee3b2dce24b36aae', 'hex');
    const marker = host.indexOf(signature);
    if (marker < 8 || marker !== host.lastIndexOf(signature)) throw invalid('missing or ambiguous .NET single-file marker');
    const offset64 = host.readBigInt64LE(marker - 8);
    if (offset64 <= 0 || offset64 > BigInt(file.size - 12)) throw invalid('invalid .NET single-file header offset');
    const headerOffset = Number(offset64);
    const bytes = await readRange(handle, headerOffset, Math.min(file.size - headerOffset, 2 * 1024 * 1024));
    let cursor = 0;
    const take = count => {
      if (!Number.isSafeInteger(count) || count < 0 || cursor + count > bytes.length) throw invalid('truncated .NET bundle manifest');
      const value = bytes.subarray(cursor, cursor + count); cursor += count; return value;
    };
    const int64 = () => {
      const value = take(8).readBigInt64LE();
      if (value < 0 || value > BigInt(file.size)) throw invalid('out-of-range .NET bundle entry');
      return Number(value);
    };
    const text = limit => {
      let length = 0, shift = 0;
      for (;;) {
        const value = take(1)[0]; length += (value & 0x7f) * 2 ** shift;
        if (!(value & 0x80)) break;
        shift += 7; if (shift > 28) throw invalid('invalid .NET bundle string');
      }
      if (!length || length > limit) throw invalid('oversized .NET bundle string');
      try { return new TextDecoder('utf-8', { fatal: true }).decode(take(length)); }
      catch { throw invalid('invalid .NET bundle text'); }
    };
    const major = take(4).readUInt32LE(), minor = take(4).readUInt32LE(), count = take(4).readUInt32LE();
    if (major !== 6 || minor !== 0 || !count || count > 10000 || !/^[A-Za-z0-9_-]{12}$/.test(text(128))) throw invalid('unsupported .NET bundle format');
    int64(); int64();
    const runtimeConfigOffset = int64(), runtimeConfigSize = int64();
    take(8);
    const entries = new Map();
    for (let index = 0; index < count; index++) {
      const offset = int64(), size = int64(), compressedSize = int64(), type = take(1)[0], name = text(1024);
      if (name.includes('\\') || name.includes('\0') || name.includes(':') || isAbsolute(name)
        || name.split('/').some(part => !part || part === '.' || part === '..') || entries.has(name)
        || type > 5 || compressedSize > size || offset + (compressedSize || size) > headerOffset) throw invalid('invalid .NET bundle entry');
      entries.set(name, { offset, size, compressedSize, type });
    }
    for (const name of ['OhMyDsh.Desktop.dll', 'System.Private.CoreLib.dll', 'PresentationFramework.dll']) {
      if (!entries.get(name)?.size) throw invalid(`self-contained runtime file is missing: ${name}`);
    }
    if (!staticallyLinkedRuntime) for (const name of ['coreclr.dll', 'clrjit.dll']) {
      if (!entries.get(name)?.size) throw invalid(`self-contained runtime file is missing: ${name}`);
    }
    const runtimeConfig = entries.get('OhMyDsh.Desktop.runtimeconfig.json');
    if (!runtimeConfig || runtimeConfig.compressedSize || runtimeConfig.offset !== runtimeConfigOffset
      || runtimeConfig.size !== runtimeConfigSize || runtimeConfig.size > 1024 * 1024) throw invalid('self-contained runtime configuration');
    let configuration;
    try { configuration = JSON.parse((await readRange(handle, runtimeConfig.offset, runtimeConfig.size)).toString('utf8')).runtimeOptions; }
    catch { throw invalid('invalid self-contained runtime configuration'); }
    const frameworks = configuration?.includedFrameworks;
    if (configuration?.framework || configuration?.frameworks || !Array.isArray(frameworks)
      || ['Microsoft.NETCore.App', 'Microsoft.WindowsDesktop.App'].some(name => !frameworks.some(value => value?.name === name && /^10\./.test(value.version ?? '')))) {
      throw invalid('the executable depends on an installed .NET runtime');
    }
    return { platform: 'win32', arch, pe: true, selfContained: true, singleFile: true, bundleVersion: `${major}.${minor}`, staticallyLinkedRuntime };
  } finally { await handle.close(); }
}

export async function windowsNativeArtifactFiles(directory, expected) {
  expectedIdentity(expected); await realDirectory(directory);
  const rows = [];
  for (const name of [expected.executable, buildFilename]) {
    const path = join(directory, name), info = await regularFile(path, name === buildFilename ? 1024 * 1024 : maximumExecutableBytes);
    rows.push({ path: name, size: info.size, sha256: await windowsNativeFileHash(path) });
  }
  const build = JSON.parse(await readFile(join(directory, buildFilename), 'utf8'));
  if (Object.keys(expected).some(key => build[key] !== expected[key])) throw invalid('build receipt does not match the plugin sources');
  const binary = await inspectWindowsNativeBinary(join(directory, expected.executable), expected.arch);
  return { files: rows, binary };
}

function parseManifest(value, expected) {
  if (!value || value.schemaVersion !== 1 || value.artifact !== 'opencu-windows-desktop'
    || value.selfContained !== true || value.singleFile !== true || value.bundleVersion !== '6.0'
    || Object.keys(expected).some(key => value[key] !== expected[key]) || !Array.isArray(value.files) || value.files.length !== 2) throw invalid('artifact manifest identity');
  const paths = new Set();
  for (const file of value.files) {
    if (!file || ![expected.executable, buildFilename].includes(file.path) || paths.has(file.path)
      || !digestPattern.test(file.sha256 ?? '') || !Number.isSafeInteger(file.size) || file.size <= 0
      || file.size > (file.path === buildFilename ? 1024 * 1024 : maximumExecutableBytes)) throw invalid('artifact manifest files');
    paths.add(file.path);
  }
  if (value.archive && (value.archive.format !== 'gzip' || value.archive.path !== expected.executable + '.gz'
    || !digestPattern.test(value.archive.sha256 ?? '') || !Number.isSafeInteger(value.archive.size)
    || value.archive.size <= 0 || value.archive.size > maximumExecutableBytes)) throw invalid('compressed artifact manifest');
  return value;
}

function matchingFiles(actual, expected) {
  const files = new Map(expected.map(file => [file.path, file]));
  if (actual.length !== files.size || actual.some(file => file.size !== files.get(file.path)?.size || file.sha256 !== files.get(file.path)?.sha256)) throw invalid('artifact file integrity');
}

export async function unpackWindowsNativeExecutable(source, destination, expectedFile, archive) {
  if (!archive || archive.format !== 'gzip' || !digestPattern.test(archive.sha256 ?? '')
    || !digestPattern.test(expectedFile?.sha256 ?? '') || !Number.isSafeInteger(expectedFile.size)
    || expectedFile.size <= 0 || expectedFile.size > maximumExecutableBytes) throw invalid('compressed executable identity');
  const info = await regularFile(source, maximumExecutableBytes);
  if (info.size !== archive.size || await windowsNativeFileHash(source) !== archive.sha256) throw invalid('compressed executable integrity');
  const output = await open(destination, 'wx', 0o755);
  let size = 0;
  const hash = createHash('sha256');
  try {
    await pipeline(createReadStream(source), createGunzip(), new Transform({ transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > expectedFile.size) return callback(invalid('compressed executable exceeds its recorded size'));
      hash.update(chunk); callback(null, chunk);
    } }), output.createWriteStream({ autoClose: true }));
    if (size !== expectedFile.size || hash.digest('hex') !== expectedFile.sha256) throw invalid('unpacked executable integrity');
  } catch (error) {
    await output.close(); await rm(destination, { force: true }); throw error;
  }
  await output.close();
}

export async function installPackagedWindowsNative(destination, expected, { root = WINDOWS_NATIVE_PREBUILT_ROOT } = {}) {
  expectedIdentity(expected);
  if (!isAbsolute(root) || !isAbsolute(destination)) throw invalid('artifact paths must be absolute');
  const directory = join(root, `win32-${expected.arch}`);
  try { await realDirectory(directory); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  await realDirectory(root); await realDirectory(destination);
  await regularFile(join(directory, manifestFilename), 1024 * 1024);
  const manifest = parseManifest(JSON.parse(await readFile(join(directory, manifestFilename), 'utf8')), expected);
  const executable = manifest.archive?.path ?? expected.executable;
  if ((await readdir(directory)).sort().join('\0') !== [executable, buildFilename, manifestFilename].sort().join('\0')) throw invalid('unexpected package files');
  if (manifest.archive) {
    const receipt = manifest.files.find(file => file.path === buildFilename);
    const receiptInfo = await regularFile(join(directory, buildFilename), 1024 * 1024);
    if (receiptInfo.size !== receipt.size || await windowsNativeFileHash(join(directory, buildFilename)) !== receipt.sha256) throw invalid('build receipt integrity');
    await unpackWindowsNativeExecutable(join(directory, executable), join(destination, expected.executable), manifest.files.find(file => file.path === expected.executable), manifest.archive);
    await copyFile(join(directory, buildFilename), join(destination, buildFilename), constants.COPYFILE_EXCL);
  } else {
    const source = await windowsNativeArtifactFiles(directory, expected);
    matchingFiles(source.files, manifest.files);
    for (const file of source.files) await copyFile(join(directory, file.path), join(destination, file.path), constants.COPYFILE_EXCL);
  }
  const copied = await windowsNativeArtifactFiles(destination, expected);
  matchingFiles(copied.files, manifest.files);
  return { provider: 'packaged-prebuilt', manifest };
}
