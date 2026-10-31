import { chmod, lstat, open, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const koffiLoader = `
// opencu-local-native-symbols:v1
function opencuLoadNativeKoffi(requireBinding, name) {
  const load = typeof name === 'function' ? name : () => requireBinding(name);
  if (process.platform !== 'darwin') return load();
  const original = process.dlopen;
  const { RTLD_NOW, RTLD_LOCAL } = requireBinding('node:os').constants.dlopen;
  // require() is synchronous. Limit the override to this Koffi load, including
  // its optional prebuild package, and restore it even when loading fails.
  process.dlopen = function(module, filename, flags) {
    if (flags === undefined && typeof filename === 'string' && filename.endsWith('/koffi.node')) {
      return original.call(this, module, filename, RTLD_NOW | RTLD_LOCAL);
    }
    return Reflect.apply(original, this, arguments);
  };
  try { return load(); }
  finally { process.dlopen = original; }
}
`;
const spawnCheck = `// opencu-terminal-helper:v1
        if (process.platform === 'darwin') fs.accessSync(helperPath, fs.constants.X_OK);
        var term = pty.fork(`;
const engineSignature = 'async function readEngine(packageFile, backend, target) {';
const enginePath = `${engineSignature}
\t// opencu-physical-native-engine:v1
\tif (backend === "native" && process.versions.electron) packageFile = packageFile.replace(/([\\\\/])([^\\\\/]+\\.asar)(?=[\\\\/])/g, "$1$2.unpacked");`;

function replaceOnce(source, before, after, file) {
  if (source.split(before).length !== 2) throw Error(`Native runtime input changed: ${file}`);
  return source.replace(before, after);
}

// ASAR's unpacked entries do not record executable bits. Inspect the actual
// Mach-O file type so extraction cannot silently disable rg, Office or a helper.
async function isMacExecutable(path) {
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(32);
    if ((await file.read(header, 0, 32, 0)).bytesRead < 16) return false;
    const kind = bytes => {
      const magic = bytes.readUInt32BE(0);
      if (magic === 0xcffaedfe || magic === 0xcefaedfe) return bytes.readUInt32LE(12);
      if (magic === 0xfeedfacf || magic === 0xfeedface) return bytes.readUInt32BE(12);
    };
    if (kind(header) !== undefined) return kind(header) === 2;
    const magic = header.readUInt32BE(0);
    if (![0xcafebabe, 0xcafebabf, 0xbebafeca, 0xbfbafeca].includes(magic)) return false;
    const little = magic === 0xbebafeca || magic === 0xbfbafeca;
    const wide = magic === 0xcafebabf || magic === 0xbfbafeca;
    const read32 = (bytes, at) => little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at);
    const count = read32(header, 4), size = wide ? 32 : 20;
    if (count < 1 || count > 64) return false;
    const table = Buffer.alloc(count * size);
    if ((await file.read(table, 0, table.length, 8)).bytesRead !== table.length) return false;
    for (let index = 0; index < count; index++) {
      const offset = wide ? Number(little ? table.readBigUInt64LE(index * size + 8) : table.readBigUInt64BE(index * size + 8)) : read32(table, index * size + 8);
      if (!Number.isSafeInteger(offset) || offset < 8 + table.length) return false;
      if ((await file.read(header, 0, 32, offset)).bytesRead < 16) return false;
      if (kind(header) === 2) return true;
    }
    return false;
  } finally { await file.close(); }
}

/** Prepare a private, materialized runtime before its manifest, ASAR and signing steps. */
export async function prepareNativeRuntime(directory, { platform = process.platform, check = false } = {}) {
  const root = await realpath(directory), visited = new Set(), packages = [], helpers = [], executables = new Map();
  const inside = path => { const rel = relative(root, path); return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel); };
  async function owned(path) {
    const actual = await realpath(path);
    if (!inside(actual)) throw Error(`Native runtime path escapes staging: ${path}`);
    return actual;
  }
  async function scan(path) {
    path = await owned(path);
    if (visited.has(path)) return;
    visited.add(path);
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      const info = entry.isSymbolicLink() ? await stat(await owned(file)) : entry;
      if (info.isDirectory()) await scan(file);
      else if (info.isFile() && entry.name === 'package.json') {
        const metadata = JSON.parse(await readFile(file, 'utf8'));
        if (['koffi', 'node-pty', '@deepseek-ai/libreoffice-kit'].includes(metadata.name)) packages.push({ ...metadata, root: path });
      } else if (platform === 'darwin' && info.isFile() && await isMacExecutable(file)) executables.set(file, (await stat(file)).mode & 0o777);
    }
  }
  await scan(join(root, 'node_modules'));
  if (platform === 'darwin' && (!packages.some(pkg => pkg.name === 'koffi') || !packages.some(pkg => pkg.name === 'node-pty'))) throw Error('Native runtime must contain Koffi and node-pty');
  const changes = new Map();
  for (const pkg of packages) {
    if (pkg.name !== '@deepseek-ai/libreoffice-kit' && platform !== 'darwin') continue;
    const expected = pkg.name === 'koffi' ? '3.1.1' : pkg.name === 'node-pty' ? '1.2.0-beta.15' : '0.1.5';
    if (pkg.version !== expected) throw Error(`Unreviewed native runtime version: ${pkg.name}@${pkg.version}`);
    if (pkg.name === '@deepseek-ai/libreoffice-kit') {
      for (const entry of ['lib/index.js', 'lib/cli.js']) {
        const file = await owned(join(pkg.root, entry));
        const source = await readFile(file, 'utf8');
        if (source.includes('// opencu-physical-native-engine:v1')) {
          if (!source.includes(enginePath)) throw Error(`Incomplete native engine path correction: ${file}`);
        } else changes.set(file, replaceOnce(source, engineSignature, enginePath, file));
      }
    } else if (pkg.name === 'koffi') {
      for (const variant of ['index.js', 'index.cjs', 'indirect.js', 'indirect.cjs']) {
        const file = await owned(join(pkg.root, 'src/koffi', variant));
        const source = await readFile(file, 'utf8');
        if (source.includes('// opencu-local-native-symbols:v1')) {
          if (!source.endsWith(koffiLoader) || !source.includes('native2 = opencuLoadNativeKoffi(require2, name);') ||
              (variant.startsWith('index.') && !source.includes('opencuLoadNativeKoffi(require2, () => loadStatic(pkg))'))) throw Error(`Incomplete native symbol isolation: ${file}`);
        } else {
          let next = replaceOnce(source, 'native2 = require2(name);', 'native2 = opencuLoadNativeKoffi(require2, name);', file);
          if (variant.startsWith('index.')) next = replaceOnce(next, 'loadStatic(pkg)', 'opencuLoadNativeKoffi(require2, () => loadStatic(pkg))', file);
          changes.set(file, next + koffiLoader);
        }
      }
    } else {
      const file = await owned(join(pkg.root, 'lib/unixTerminal.js'));
      const source = await readFile(file, 'utf8');
      let next = source;
      if (!source.includes('// opencu-terminal-helper:v1')) {
        next = replaceOnce(next, 'var term = pty.fork(', spawnCheck, file);
        // Only rewrite an archive path segment, never an already-unpacked path.
        for (const archive of ['app.asar', 'node_modules.asar']) next = replaceOnce(next,
          `helperPath.replace('${archive}', '${archive}.unpacked')`,
          `helperPath.replace(/([\\\\/])${archive.replace('.', '\\.')}([\\\\/])/, '$1${archive}.unpacked$2')`, file);
        changes.set(file, next);
      } else if (!source.includes(spawnCheck) || source.includes("helperPath.replace('app.asar'")) throw Error(`Incomplete terminal helper protection: ${file}`);
      let found = 0;
      for (const path of ['prebuilds/darwin-arm64', 'prebuilds/darwin-x64', 'build/Release', 'build/Debug']) {
        const helper = join(pkg.root, path, 'spawn-helper');
        let info;
        try { info = await lstat(helper); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (!info.isFile()) throw Error(`Terminal helper is not a regular file: ${helper}`);
        await owned(helper);
        helpers.push({ path: helper, mode: info.mode & 0o777 }); found++;
      }
      if (!found) throw Error(`Missing macOS terminal helper: ${pkg.root}`);
    }
  }
  for (const helper of helpers) executables.set(helper.path, helper.mode);
  const modes = [...executables].filter(([, mode]) => (mode & 0o111) !== 0o111);
  if (check && (changes.size || modes.length)) throw Error(`Unsafe native runtime: ${changes.size} loader files and ${modes.length} helper permissions need preparation`);
  // Validate the entire runtime before any write. Never mutate a running app.
  if (!check) {
    for (const [file, value] of changes) await writeFile(file, value);
    for (const [path, mode] of modes) await chmod(path, mode | 0o111);
  }
  return { platform, packages: packages.length, helpers: helpers.length, executables: executables.size, changed: changes.size + modes.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw Error('Usage: node host/native-runtime.mjs /absolute/private/runtime [--check]');
  const root = await realpath(resolve(process.argv[2]));
  if (root.includes('.app' + sep) || root.endsWith('.app')) throw Error('Prepare an extracted private runtime before packaging; do not modify installed apps');
  console.log(JSON.stringify(await prepareNativeRuntime(root, { check: process.argv.includes('--check') })));
}
