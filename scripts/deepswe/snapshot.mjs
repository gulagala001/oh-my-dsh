// Capture only installed code and configuration; never copy sessions or memory.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) throw Error('Usage: node snapshot.mjs SOURCE_PROFILE OUTPUT_DIRECTORY');
const source = fs.realpathSync(sourceArg), target = path.resolve(targetArg);
if (target === source || target.startsWith(source + path.sep)) throw Error('Output must be outside the working profile');
fs.mkdirSync(target, { recursive: true, mode: 0o700 }); fs.chmodSync(target, 0o700);
const req = createRequire(source + '/package.json'), yaml = req('yaml');
const packageJSON = JSON.parse(fs.readFileSync(source + '/package.json', 'utf8'));
const patch = yaml.parse(fs.readFileSync(source + '/cordis.patch.yml', 'utf8'));
const model = patch.find(row => row.id === 'agent-default-model')?.config;
if (!model?.provider || !model?.model) throw Error('The source profile has no explicit model selection');
const selection = { preset: 'omd-ptc', model };
const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const omdPath = path.dirname(req.resolve('oh-my-dsh/package.json'));
const { contextConfig } = await import(pathToFileURL(omdPath + '/src/config.mjs'));
const originalConfig = contextConfig(patch.find(row => row.id === 'oh-my-dsh')?.config || {});
// Runtime resolves this default before exposing hub.config().
originalConfig.dataDir ||= path.join(path.dirname(path.dirname(source)), 'oh-my-dsh');
const staging = target + '/staging/omd', profile = staging + '/home/profiles/eval';
fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
const pathChanges = [];
function map(value, location = '') {
  if (Array.isArray(value)) return value.map((x, i) => map(x, `${location}/${i}`));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, map(v, `${location}/${k}`)]));
  if (typeof value !== 'string') return value;
  let mapped = value;
  if (value.startsWith(source + '/')) mapped = '/opt/omd/home/profiles/eval/' + value.slice(source.length + 1);
  else if (value.startsWith(path.dirname(path.dirname(source)) + '/')) mapped = '/opt/omd/home/' + value.slice(path.dirname(path.dirname(source)).length + 1);
  if (mapped !== value) pathChanges.push({ location, source: value, target: mapped });
  return mapped;
}
const mappedPatch = map(patch);
mappedPatch.push({ insert: [{ id: 'deepswe-observer', name: '/opt/omd/observer.mjs' }] });
fs.writeFileSync(profile + '/cordis.patch.yml', JSON.stringify(mappedPatch, null, 2), { mode: 0o600 });
fs.copyFileSync(source + '/cordis.yml', profile + '/cordis.yml');
// All installed bundles are retained. Dependencies already exist in the runtime.
const plugins = Object.keys(packageJSON.dependencies).map(name => {
  const file = req.resolve(name + '/package.json');
  return { name, version: JSON.parse(fs.readFileSync(file, 'utf8')).version, path: path.dirname(file) };
});
const codeManifest = {};
function captureFiles(directory, name) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.DS_Store'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name), relative = name + '/' + entry.name;
    if (entry.isDirectory()) captureFiles(file, relative);
    else if (entry.isFile()) codeManifest[relative] = sha(file);
  }
}
for (const plugin of plugins) captureFiles(plugin.path, plugin.name);
fs.writeFileSync(staging + '/code-manifest.json', JSON.stringify(codeManifest));
fs.writeFileSync(profile + '/package.json', JSON.stringify({ ...packageJSON,
  dependencies: Object.fromEntries(plugins.map(p => [p.name, p.version])) }, null, 2));
const copied = [];
for (const name of ['.credentials.yaml', '.env']) {
  if (fs.existsSync(source + '/' + name)) { fs.copyFileSync(source + '/' + name, profile + '/' + name); fs.chmodSync(profile + '/' + name, 0o600); copied.push(name); }
}
for (const name of ['local-plugins', 'agent-presets']) {
  if (fs.existsSync(source + '/' + name)) fs.cpSync(source + '/' + name, profile + '/' + name, { recursive: true });
}
// Only env names referenced by the copied provider configuration are copied
// from the root env file. No unrelated account or subscription state is copied.
const rootEnv = path.dirname(path.dirname(source)) + '/.env';
if (fs.existsSync(rootEnv)) {
  const refs = new Set();
  const visit = v => { if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'apiKeyEnv' && typeof x === 'string') refs.add(x); else visit(x); } };
  visit(patch);
  const lines = fs.readFileSync(rootEnv, 'utf8').split('\n').filter(line => refs.has(line.match(/^(?:export\s+)?([A-Z0-9_]+)=/)?.[1]));
  fs.writeFileSync(staging + '/home/.env', lines.join('\n') + '\n', { mode: 0o600 });
}
const directory = path.dirname(fileURLToPath(import.meta.url));
for (const name of ['bridge.mjs', 'observer.mjs', 'verify-code.mjs']) fs.copyFileSync(directory + '/' + name, staging + '/' + name);
fs.writeFileSync(staging + '/selection.json', JSON.stringify(selection, null, 2));
fs.writeFileSync(staging + '/expected-config.json', JSON.stringify(map(originalConfig), null, 2));
execFileSync('tar', ['--no-xattrs', '-czf', target + '/profile.tgz', '-C', target + '/staging', 'omd'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
fs.chmodSync(target + '/profile.tgz', 0o600);
const provider = patch.find(row => row.id === 'llm-pi-ai')?.config?.providers?.[model.provider];
if (!provider?.baseURL) throw Error('No configured provider URL for the selected model');
const manifest = { capturedAt: new Date().toISOString(), source, selection,
  host_version: '0.2.1-rc.3', omd_version: plugins.find(p => p.name === 'oh-my-dsh').version,
  inference_domains: [new URL(provider.baseURL).hostname], plugins,
  profileSHA256: sha(target + '/profile.tgz'), sourcePatchSHA256: sha(source + '/cordis.patch.yml'),
  sourceCredentialsSHA256: copied.includes('.credentials.yaml') ? sha(source + '/.credentials.yaml') : null,
  pathChanges, isolatedState: ['sessions', 'memory', 'workspaces', 'attachments'],
  limitations: ['Linux task containers do not provide the desktop macOS app or Blender server.',
    'Official task network policy permits the selected inference endpoint only. Plugin switches are unchanged.'] };
fs.writeFileSync(target + '/manifest.json', JSON.stringify(manifest, null, 2));
fs.rmSync(target + '/staging', { recursive: true });
console.log(JSON.stringify({ profile: target, selection, plugins: plugins.length, pathChanges: pathChanges.length }));
