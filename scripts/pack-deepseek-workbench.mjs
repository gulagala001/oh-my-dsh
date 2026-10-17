/** Package only the actual source SDK target; changing peer labels is not a build. */
import { parseArgs } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { values } = parseArgs({ options: { 'host-version': { type: 'string' }, 'cordis-version': { type: 'string' }, out: { type: 'string' } } });
const host = values['host-version'], cordis = values['cordis-version'];
if (!host || !cordis || !/^[\w.+-]+$/.test(host) || !/^[\w.+-]+$/.test(cordis)) throw Error('Supply the actual host and Cordis versions with --host-version and --cordis-version.');
const source = fileURLToPath(new URL('../plugins/deepseek-workbench/', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
const root = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const require = createRequire(import.meta.url);
for (const [name, expected] of [['@deepseek-ai/dsh', host], ['@deepseek-ai/cordis', cordis], ['@deepseek-ai/dsh-session', host], ['@deepseek-ai/dsh-llm', host]]) {
  const installed = JSON.parse(await readFile(require.resolve(name + '/package.json'), 'utf8'));
  if (installed.name !== name || installed.version !== expected || root.devDependencies[name] !== expected) {
    throw Error(`Matching source/installed SDK required: ${name} ${expected}; declared ${root.devDependencies[name]}, installed ${installed.version}. No peer-only host retargeting is supported.`);
  }
}
const hostRequire = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
for (const [name, version] of Object.entries(manifest.peerDependencies)) {
  const expected = name === '@deepseek-ai/cordis' ? cordis : host;
  if (version !== expected) throw Error(`Workbench source targets ${name} ${version}, not ${expected}. Prepare a separately matched source/SDK/lock build first.`);
  const installed = JSON.parse(await readFile(hostRequire.resolve(name + '/package.json'), 'utf8'));
  if (installed.name !== name || installed.version !== expected) throw Error(`Actual host peer ${name} ${installed.version} does not match ${expected}.`);
}
await import('./build-deepseek-workbench.mjs');
const output = resolve(values.out || `work/deepseek-workbench-packages/${host}`);
await mkdir(output, { recursive: true });
const stage = await mkdtemp(resolve(output, 'package-'));
for (const name of ['src', 'lib', 'desktop', 'cordis.patch.yml', 'README.md', 'LICENSE']) await cp(resolve(source, name), resolve(stage, name), { recursive: true });
manifest.dsh.workbenchBuild = { hostVersion: host, cordisVersion: cordis, verification: 'local-candidate', desktopPatchBaseline: '0.2.1-alpha.2', desktopPatchSourceCommit: 'd743267388641bc76f17c45ce8b4c231aed1d32c', desktopPatchStatus: 'adapted-not-yet-tested' };
await writeFile(resolve(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(stage, 'README.md'), `> 本地候选构建：DSH ${host} / Cordis ${cordis}。真实依赖与源码目标匹配，不代表功能已验收；桌面补丁已对齐真实 alpha.2 固定源码，尚未集中构建或验收。\n\n` + await readFile(resolve(source, 'README.md'), 'utf8'));
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', stage], { cwd: stage, encoding: 'utf8' });
if (result.status !== 0) throw Error(result.stderr || result.stdout);
const [packed] = JSON.parse(result.stdout);
console.log(JSON.stringify({ host, cordis, path: resolve(stage, packed.filename), shasum: packed.shasum, fileCount: packed.entryCount, verification: 'local-candidate' }));
