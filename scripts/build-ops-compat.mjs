// Reproducible compatibility distribution; the upstream native workers remain
// byte-for-byte unchanged. Never build from latest or relax a host version gate.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, readdir, lstat, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { parse, stringify } from 'yaml';
import { hostTarget } from './host-targets.mjs';

export const upstream = Object.freeze({ version: '0.4.1',
  url: 'https://github.com/T-Auto/dsh-ops/releases/download/v0.4.1/dsh-ops-0.4.1.tgz',
  sha256: 'e8ae70fa1703004973f4a61d5afe6c163862dd1469e3e9f5d03c736f8da5a362' });
export const adapterVersion = '0.1.0';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const controls = ['run_code', 'job_output', 'job_list', 'job_kill', 'runtime_status'];
const posixWorkers = new Set(['darwin-arm64/dsh-ops-worker', 'linux-x64/dsh-ops-worker']);
async function preserveWorkers(archive, native) {
  const tar = gunzipSync(await readFile(archive)), seen = new Set();
  let paxPath;
  const text = (offset, size) => tar.subarray(offset, offset + size).toString().replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= tar.length;) {
    if (tar.subarray(offset, offset + 512).every(byte => byte === 0)) break;
    const name = text(offset, 100), prefix = text(offset + 345, 155);
    const size = Number.parseInt(text(offset + 124, 12).trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw Error('Invalid tar size');
    if (tar[offset + 156] === 120) {
      const data = tar.subarray(offset + 512, offset + 512 + size);
      for (let at = 0; at < data.length;) {
        const space = data.indexOf(32, at), count = Number(data.subarray(at, space).toString());
        if (space < at || !Number.isSafeInteger(count) || count <= space - at + 1 || at + count > data.length) throw Error('Invalid PAX record');
        const record = data.subarray(space + 1, at + count - 1).toString();
        if (record.startsWith('path=')) paxPath = record.slice(5);
        if (record.startsWith('linkpath=')) throw Error('Links are not supported in OPS packages');
        at += count;
      }
      offset += 512 + Math.ceil(size / 512) * 512; continue;
    }
    const member = paxPath ?? (prefix ? prefix + '/' + name : name); paxPath = undefined;
    if (!member.startsWith('package/') || member.includes('\\') || member.split('/').includes('..') || ![0, 48, 53].includes(tar[offset + 156])) throw Error('Invalid package member: ' + member);
    if (member.startsWith('package/runtime/')) {
      const relative = member.slice('package/runtime/'.length);
      if (native[relative]) {
        if (seen.has(relative) || digest(tar.subarray(offset + 512, offset + 512 + size)) !== native[relative].sha256) throw Error('Native payload changed: ' + relative);
        seen.add(relative);
        if (posixWorkers.has(relative)) {
          // npm normalizes non-bin executables to 0644. Repair only these two
          // known workers in the archive; never chmod user-selected binaries.
          tar.write('0000755\0', offset + 100, 8, 'ascii');
          tar.fill(32, offset + 148, offset + 156);
          const sum = tar.subarray(offset, offset + 512).reduce((a, byte) => a + byte, 0);
          tar.write(sum.toString(8).padStart(6, '0') + '\0 ', offset + 148, 8, 'ascii');
        }
      } else if (tar[offset + 156] !== 53) throw Error('Unexpected native payload: ' + relative);
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (seen.size !== Object.keys(native).length || [...posixWorkers].some(name => !seen.has(name))) throw Error('Incomplete native runtime in package');
  await writeFile(archive, gzipSync(tar));
}
export function patchPtc(source) {
  const before = "const isPtc = (assembly) => assembly.tools.length === 1 && assembly.tools[0]?.name === 'run_code'\n    && assembly.sections.some(section => section.name === 'tools:ptc-only' && section.text.trim() !== '');";
  if (source.split(before).length !== 2) throw Error('The pinned OPS PTC contract changed');
  return source.replace(before, `// Host-compatible PTC still requires run_code for every business tool.\n// Only the reviewed job/status controls may also be directly exposed.\nconst ptcControls = new Set(${JSON.stringify(controls)});\nconst isPtc = (assembly) => assembly.tools.some(tool => tool.name === 'run_code')\n    && assembly.tools.every(tool => ptcControls.has(tool.name))\n    && assembly.sections.some(section => section.name === 'tools:ptc-only' && section.text.trim() !== '');`);
}

export async function buildOpsCompatibility(archive, host, output) {
  const framework = hostTarget(host);
  const bytes = await readFile(archive);
  if (digest(bytes) !== upstream.sha256) throw Error('OPS archive does not match the reviewed upstream SHA-256');
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(join(output, '.ops-build-'));
  try {
    const paths = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
    if (paths.some(path => !path.startsWith('package/') || path.split('/').includes('..'))) throw Error('Invalid upstream archive path');
    execFileSync('tar', ['-xzf', archive, '-C', temporary]);
    const root = join(temporary, 'package');
    const files = async (directory, prefix = '') => {
      const result = {};
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name), name = prefix + entry.name;
        if (entry.isDirectory()) Object.assign(result, await files(path, name + '/'));
        else if (entry.isFile()) result[name] = { sha256: digest(await readFile(path)), executable: Boolean((await lstat(path)).mode & 0o111) };
        else throw Error('Unexpected non-regular archive entry: ' + name);
      }
      return result;
    };
    const native = await files(join(root, 'runtime'));
    const manifestPath = join(root, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.name !== 'dsh-ops' || manifest.version !== upstream.version) throw Error('Unexpected OPS package identity');
    const version = `${host}.ops.${adapterVersion}`;
    manifest.version = version;
    manifest.engines.dsh = host;
    manifest.peerDependencies['@deepseek-ai/dsh'] = host;
    manifest.peerDependencies['@deepseek-ai/cordis'] = framework.cordisVersion;
    manifest.dshOpsCompatibility = { upstreamVersion: upstream.version, upstreamUrl: upstream.url,
      upstreamSha256: upstream.sha256, host, adapterVersion };
    manifest.files.push('COMPATIBILITY.md', '!docs/0.4.0发布候选.md', '!docs/DSH工具注入实现拆解.md',
      '!docs/DSH渐进式披露机制查证.md', '!docs/工具执行管线分析.md', '!docs/windows-verification.md',
      '!docs/schema-measurement.md', '!docs/schema-baseline.json', '!docs/roadmap.md', '!docs/路线图.md',
      '!docs/release-*.md', '!docs/CHANGELOG.md');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    const communityPath = join(root, 'dsh-plugin.json');
    const community = JSON.parse(await readFile(communityPath, 'utf8'));
    if (community.version !== upstream.version) throw Error('Unexpected community manifest identity');
    community.version = version;
    await writeFile(communityPath, JSON.stringify(community, null, 2) + '\n');
    const patchPath = join(root, 'cordis.patch.yml'), patch = parse(await readFile(patchPath, 'utf8'));
    for (const operation of patch) for (const row of operation.insert ?? []) {
      if (['dsh-ops/shell', 'dsh-ops/file'].includes(row.name)) row.config.configUpdateVersion = 2;
    }
    await writeFile(patchPath, stringify(patch));
    // Resolve the scope singleton through the active host component's Loader
    // tree. A private/auto-installed copy would give agents a different scope
    // identity, while upstream's undeclared bare import cannot resolve at all.
    await writeFile(join(root, 'lib/host-scope.js'), `export async function hostScopes(ctx) {\n  const loader = ctx.get('loader');\n  const entry = loader && [...loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-tools');\n  if (!entry?.parent?.tree) throw new Error('The matching DSH tools Loader entry is required');\n  const scopes = await entry.parent.tree.import('@deepseek-ai/dsh-scope');\n  if (typeof scopes.scopeOf !== 'function' || typeof scopes.scopeChainOf !== 'function') throw new Error('The matching DSH scope contract is unavailable');\n  return scopes;\n}\n`);
    for (const [name, relative] of [['lib/scoped-ownership.js', './host-scope.js'], ['lib/file/result-provider.js', '../host-scope.js']]) {
      const path = join(root, name), source = await readFile(path, 'utf8');
      const expected = "await import('@deepseek-ai/dsh-scope')";
      if (source.split(expected).length !== 2) throw Error('The pinned OPS scope import changed');
      await writeFile(path, `import { hostScopes } from '${relative}';\n` + source.replace(expected, 'await hostScopes(ctx)'));
    }
    const ptcPath = join(root, 'lib/ptc/index.js');
    await writeFile(ptcPath, patchPtc(await readFile(ptcPath, 'utf8')));
    // Native receipts describe the unchanged upstream binaries, not this JS
    // compatibility distribution. Keep their original version and provenance.
    const runtimePath = join(root, 'bin/native-runtime.mjs');
    const runtime = await readFile(runtimePath, 'utf8');
    const before = "const version = readJson(path.join(root,'package.json'),'package manifest').version";
    if (runtime.split(before).length !== 2) throw Error('The pinned OPS native provenance check changed');
    await writeFile(runtimePath, runtime.replace(before,
      "const packageManifest = readJson(path.join(root,'package.json'),'package manifest')\nconst version = packageManifest.dshOpsCompatibility?.upstreamVersion ?? packageManifest.version"));
    const resolverPath = join(root, 'lib/ptc/runtime.js'), resolver = await readFile(resolverPath, 'utf8');
    const resolverBefore = "const version = readJson(path.join(packageRoot, 'package.json'), 'package manifest', 'package.json').version;";
    if (resolver.split(resolverBefore).length !== 2) throw Error('The pinned OPS runtime provenance check changed');
    await writeFile(resolverPath, resolver.replace(resolverBefore,
      "const manifest = readJson(path.join(packageRoot, 'package.json'), 'package manifest', 'package.json');\n            const version = manifest.dshOpsCompatibility?.upstreamVersion ?? manifest.version;"));
    await writeFile(join(root, 'COMPATIBILITY.md'), `# dsh-ops — DSH ${host}\n\n[中文](#中文) · [English](#english)\n\n## 中文\n\ndsh-ops 由 [T-Auto](https://github.com/T-Auto/dsh-ops) 开发。本包基于固定的上游 ${upstream.version}，兼容发行版本为 ${version}，仅适用于 DSH **${host}**。\n\n保留上游的文件、文档、命令、按需工具加载与结果引用能力。PTC 允许宿主在 run_code 外同时提供 job_output、job_list、job_kill、runtime_status；业务工具继续通过 run_code 调用，权限与沙箱仍由宿主管理。普通模式沿用上游工具注册与配置。原生工具替换默认关闭。\n\n从 Oh My DSH 设置的“第三方功能”开启 dsh-ops，或使用匹配宿主的插件管理器安装本固定包。后续上游版本需另行适配，不自动跟随 latest。适配维护：gulagala001。原生 worker、来源回执、上游署名及 MIT / Apache-2.0 许可原样保留。\n\n## English\n\n[dsh-ops by T-Auto](https://github.com/T-Auto/dsh-ops) provides file, document, shell, progressive tool discovery and bounded result capabilities. This distribution pins upstream ${upstream.version}; its package version is ${version}, exclusively for DSH **${host}**.\n\nPTC may expose job_output, job_list, job_kill and runtime_status alongside run_code. Business tools still use run_code under the host permission and sandbox policies. Native mode retains the upstream registrations and settings. Replacing native tools remains disabled by default.\n\nEnable dsh-ops in Oh My DSH settings → Third-party features, or install this fixed package with the matching host plugin manager. New upstream versions require a reviewed update. Compatibility maintainer: gulagala001. Native workers, provenance receipts, attribution and the MIT / Apache-2.0 licenses are preserved.\n`);
    if (JSON.stringify(await files(join(root, 'runtime'))) !== JSON.stringify(native)) throw Error('Native worker bytes or modes changed');
    const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }))[0];
    const forbidden = /(?:^|\/)(?:AGENTS\.md|CLAUDE\.md|PLAN\.md|\.env|\.credentials|\.local|node_modules|test-results)(?:\/|$)|\.log$|发布候选|实现拆解|机制查证|管线分析|windows-verification|schema-measurement|schema-baseline|roadmap\.md|路线图/i;
    if (packed.files.some(file => forbidden.test(file.path))) throw Error('Private files in OPS distribution');
    const target = join(output, packed.filename);
    await preserveWorkers(target, native);
    return { name: manifest.name, version, host, archive: target, sha256: digest(await readFile(target)), native };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 5) throw Error('Usage: node scripts/build-ops-compat.mjs <upstream.tgz> <DSH version> <output directory>');
  const result = await buildOpsCompatibility(resolve(process.argv[2]), process.argv[3], resolve(process.argv[4]));
  console.log(JSON.stringify(result, null, 2));
}
