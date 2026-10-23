import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export const host = Object.freeze({ repository: 'https://github.com/deepseek-ai/deepseek-harness', version: '0.2.1-rc.2', tag: 'dsh-v0.2.1-rc.2', commit: '687f282e8625c6b8d11ff58211a90524be2e4317' });

export async function owned(path, directory = false) {
  try {
    const stat = await lstat(path);
    if (!(directory ? stat.isDirectory() : stat.isFile()) || await realpath(path) !== path) throw Error(`Refusing non-owned path: ${path}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function outputPath(path) {
  const base = await realpath(root);
  const local = relative(base, path);
  if (!local || local.startsWith('..') || isAbsolute(local)) throw Error(`Invalid output path: ${path}`);
  let directory = dirname(path);
  while (directory !== base) { await owned(directory, true); directory = dirname(directory); }
  await owned(path);
  await mkdir(dirname(path), { recursive: true });
  return path;
}

export async function validateInputs() {
  const pkg = await readJson(join(root, 'package.json'));
  const requireBuild = createRequire(join(root, 'package.json'));
  if (pkg.name !== 'dsh-workflow-plus' || !/^\d+\.\d+\.\d+-dsh\./.test(pkg.version) || !pkg.version.endsWith(`-dsh.${host.version}`) || pkg.engines?.node !== '>=22.19' || pkg.engines?.dsh !== host.version) throw Error('Package metadata must target dsh-workflow-plus and exact DSH 0.2.1-rc.2');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 19) throw Error('Node >=22.19 is required');
  for (const [name, version] of Object.entries({ '@deepseek-ai/dsh': host.version, '@deepseek-ai/cordis': '4.0.5', '@deepseek-ai/schemastery': '3.18.5', typescript: '6.0.3' })) {
    if (pkg.devDependencies?.[name] !== version) throw Error(`Build requires devDependencies.${name}=${version}`);
  }
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) for (const [name, version] of Object.entries(pkg[section] ?? {})) {
    if (/^@deepseek-ai\/dsh(?:-|$)/.test(name) && version !== host.version) throw Error(`Mismatched host package: ${section}.${name}=${version}`);
  }
  for (const [name, expected] of Object.entries(pkg.devDependencies ?? {})) {
    if (!/^@deepseek-ai\/(?:dsh(?:-|$)|cordis$|schemastery$)/.test(name)) continue;
    const installed = await readJson(requireBuild.resolve(name + '/package.json'));
    if (installed.name !== name || installed.version !== expected) throw Error(`Installed ${name} ${installed.version} does not match ${expected}`);
  }
  const snapshot = await readJson(join(root, 'vendor/dsh.json'));
  for (const [key, value] of Object.entries(host)) if (snapshot[key] !== value) throw Error(`DSH snapshot ${key} mismatch`);
  const base = join(await realpath(root), 'vendor/dsh');
  if (await realpath(base) !== base) throw Error('Refusing symlinked DSH source');
  const found = new Set();
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name, path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path, name + '/');
      else {
        if (!entry.isFile() || await realpath(path) !== path) throw Error(`Non-owned DSH source: ${name}`);
        if (snapshot.files?.[name] !== sha256(await readFile(path))) throw Error(`DSH source checksum mismatch: ${name}`);
        found.add(name);
      }
    }
  }
  await visit(base);
  for (const name of Object.keys(snapshot.files ?? {})) if (!found.has(name)) throw Error(`Missing DSH source: ${name}`);
  return { pkg, snapshot };
}
