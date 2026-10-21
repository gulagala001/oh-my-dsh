import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostTarget, frameworkVersions } from './host-targets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = process.argv[2], source = resolve(process.argv[3] ?? '');
const target = hostTarget(version), framework = frameworkVersions(version);
const sourceManifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
if (sourceManifest.name !== '@deepseek-ai/dsh-root' || sourceManifest.version !== version) throw new Error('Expected the matching official DSH build source');
for (const [name, expected] of [['cordis', target.cordisVersion], ['schemastery', target.schemaVersion]]) {
  const manifest = JSON.parse(await readFile(join(source, 'vendor', name, 'package.json'), 'utf8'));
  if (manifest.version !== expected) throw new Error(`Mismatched official ${name} version`);
}
const path = join(root, 'package.json'), manifest = JSON.parse(await readFile(path, 'utf8'));
const feature = manifest.version.match(/[.-]omd\.(\d+\.\d+\.\d+)$/)?.[1];
if (!feature) throw new Error('Expected a host-aligned OMD feature version');
manifest.version = `${version}${version.includes('-') ? '.' : '-'}omd.${feature}`;
manifest.engines.dsh = version;
manifest.packageManager = sourceManifest.packageManager;
for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
  for (const name of Object.keys(manifest[section] ?? {})) {
    if (/^@deepseek-ai\/dsh(?:-|$)/.test(name)) manifest[section][name] = version;
    if (framework[name]) manifest[section][name] = framework[name];
  }
}
await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
for (const name of ['plugins/deepseek-workbench/package.json', 'plugins/dsh-extensions/package.json']) {
  const file = join(root, name), plugin = JSON.parse(await readFile(file, 'utf8'));
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) for (const key of Object.keys(plugin[section] ?? {})) {
    if (/^@deepseek-ai\/dsh(?:-|$)/.test(key)) plugin[section][key] = version;
    if (framework[key]) plugin[section][key] = framework[key];
  }
  await writeFile(file, JSON.stringify(plugin, null, 2) + '\n');
}
const pinPath = join(root, 'scripts/host-const-enums.json'), pins = JSON.parse(await readFile(pinPath, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
Object.assign(pins, { version, tag: 'dsh-v' + version, commit: target.commit, sdkSourcePackageSha256: hash(await readFile(join(source, 'package.json'))) });
for (const pkg of pins.packages) {
  if (!framework[pkg.name]) throw new Error(`No matching framework pin for ${pkg.name}`);
  pkg.version = framework[pkg.name];
  for (const item of pkg.sources) item.sha256 = hash(await readFile(join(source, item.officialPath)));
}
await writeFile(pinPath, JSON.stringify(pins, null, 2) + '\n');
const { parse, stringify } = await import('yaml');
const workspacePath = join(root, 'pnpm-workspace.yaml'), workspace = parse(await readFile(workspacePath, 'utf8'));
workspace.overrides = { ...workspace.overrides, ...framework };
await writeFile(workspacePath, stringify(workspace));
console.log(JSON.stringify({ version, pluginVersion: manifest.version, framework, source, enums: pins.packages }));
