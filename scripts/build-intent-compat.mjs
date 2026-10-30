// Rebuild a fixed Intent Assistant distribution for the matching public SDK.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const upstream = Object.freeze({ version: '0.3.0',
  url: 'https://github.com/gulagala001/omd-prompt-optimizer/releases/download/v0.3.0/omd-prompt-optimizer-0.3.0.tgz',
  sha256: '8b9eb882ddd57c4098b874628663615858c4a987f49fd6927235d7bd1afdeadf' });
const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
export const hostVersion = packageInfo.engines.dsh;
export const version = hostVersion + '.intent.0.3.4';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const replaceOnce = (source, before, after) => {
  if (source.split(before).length !== 2) throw Error('The fixed Intent Assistant source no longer matches');
  return source.replace(before, after);
};

export function adaptHost(source) {
  // The desktop process argv is not an SDK installation anchor. Import through
  // the native Loader so read-tool messages and user messages share its identity.
  source = 'import * as nativeMessages from "@deepseek-ai/dsh-llm";\n' + source;
  const start = source.indexOf('async function loadLlmLib(opts = {}) {');
  const end = source.indexOf('\nfunction toolResultShape(mod)', start);
  if (start < 0 || end < 0) throw Error('Missing native message loader');
  source = source.slice(0, start) + 'async function loadLlmLib() { return { ok: true, mod: nativeMessages }; }\n' + source.slice(end);
  source = replaceOnce(source, 'var inject = ["webServer", "connection", "sessions", "agents", "sessionProjections", "llm"];',
    'var inject = ["webServer", "connection", "sessions", "agents", "sessionProjections", "llm", "profileContext"];');
  source = replaceOnce(source,
    '  const home = process.env.DSH_HOME || join3(homedir(), ".dsh");\n  const profile = resolveProfileName({ argv: process.argv, profileExists: (n) => existsSync4(join3(home, "profiles", n)) }).name;\n  const file = join3(home, "profiles", profile, "omd-intent-assistant.json");',
    '  const file = join3(ctx.profileContext.dir, "omd-intent-assistant.json");');
  return source;
}

export function adaptClient(source) {
  source = replaceOnce(source, '{ className: "opi-badge" }, "OMD"', '{ className: "opi-badge" }, "Intent"');
  const encoded = text => JSON.stringify(text).slice(1, -1).replace(/[\u0080-\uffff]/g, char => '\\u' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
  source = replaceOnce(source, encoded('当前已关闭。发送、模型工具和 OMD 原有功能保持原样。'), encoded('当前已关闭。开启后可选择审查或自动模式，原话始终保留。'));
  return replaceOnce(source, 'Disabled. Sending, model tools and existing OMD features stay unchanged.',
    'Disabled. Enable review or automatic mode while keeping the original draft.');
}

export async function buildIntentCompatibility(archive, output) {
  const bytes = await readFile(archive);
  if (digest(bytes) !== upstream.sha256) throw Error('Intent Assistant archive does not match the fixed SHA-256');
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(join(output, '.intent-build-'));
  try {
    const paths = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
    if (paths.some(path => !path.startsWith('package/') || path.split('/').includes('..'))) throw Error('Invalid archive path');
    execFileSync('tar', ['-xzf', archive, '-C', temporary]);
    const root = join(temporary, 'package');
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (manifest.name !== 'omd-prompt-optimizer' || manifest.version !== upstream.version) throw Error('Unexpected package identity');
    manifest.version = version;
    manifest.description = '需求理解：发送前梳理需求，保留原话，支持审查、自动发送与只读项目查证。';
    manifest.engines.dsh = hostVersion;
    manifest.peerDependencies = { '@deepseek-ai/cordis': packageInfo.peerDependencies['@deepseek-ai/cordis'], '@deepseek-ai/dsh-llm': hostVersion, '@deepseek-ai/dsh-agent-loop': hostVersion };
    manifest.intentCompatibility = { upstreamVersion: upstream.version, upstreamUrl: upstream.url, upstreamSha256: upstream.sha256, hostVersion };
    manifest.files = [...new Set([...manifest.files, 'COMPATIBILITY.md', 'CHANGELOG.md'])];
    await writeFile(join(root, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(root, 'lib/host.mjs'), adaptHost(await readFile(join(root, 'lib/host.mjs'), 'utf8')));
    await writeFile(join(root, 'lib/client.js'), adaptClient(await readFile(join(root, 'lib/client.js'), 'utf8')));
    await writeFile(join(root, 'README.md'), `# 需求理解 / Intent Assistant

发送前梳理本轮需求，保留原话；可审查、编辑补充内容后发送，也可选择自动发送。支持思考档位、模型选择、会话历史、只读项目查证和取消。

Interprets the current request before submission while preserving the original draft. Review and edit the accompanying context, or choose automatic delivery. Includes depth and model selection, conversation history, read-only project checks and cancellation.

在 DSH **${hostVersion}** 的插件页安装固定包，随后在设置的“需求理解”中开启并选择模式。配置保存在当前 profile；关闭、升级和卸载不删除配置或会话。解释过程会使用所选模型。

Install the fixed package through Plugins on DSH **${hostVersion}**, then enable Intent Assistant in Settings and choose a mode. Configuration stays in the current profile and survives disablement, upgrades and removal. Interpretation uses the selected model.

原作：啃轮胎的西狐（WestFox-AwA）；适配维护：gulagala001。许可与固定来源见 [LICENSE](LICENSE)、[UPSTREAM.json](UPSTREAM.json) 和 [COMPATIBILITY.md](COMPATIBILITY.md)。
`);
    await writeFile(join(root, 'COMPATIBILITY.md'), `# Intent Assistant SDK adapter

This distribution targets DSH ${hostVersion} exactly. Native message constructors resolve through the host Loader; persistent configuration uses profileContext.dir instead of guessing a profile from process.argv. The interpretation engine, review/automatic modes, read tools, cancellation and draft preservation remain available.

Fixed input: ${upstream.url}\nSHA-256: ${upstream.sha256}

Reproduction: scripts/build-intent-compat.mjs in https://github.com/gulagala001/oh-my-dsh. The original BSD-3-Clause license and UPSTREAM.json are preserved. Browser/settings validation does not claim authenticated provider or model quality results.
`);
    await writeFile(join(root, 'CHANGELOG.md'), `# 需求理解 0.3.4 · DSH ${hostVersion}

[中文](#zh-034) | [English](#en-034)

<a id="zh-034"></a>
## 中文
### 问题修复
- 适配 DSH ${hostVersion}，消息构造函数通过宿主 Loader 解析，修复桌面启动路径无法定位 SDK 的问题。
- 通过原生 profileContext 保存配置，修复桌面或自定义 profile 被误识别为 web 的问题。

<a id="en-034"></a>
## English
### Bug Fixes
- Targets DSH ${hostVersion} and resolves native message constructors through the host Loader, fixing SDK lookup from desktop launch paths.
- Stores configuration through native profileContext, fixing desktop and custom profiles being mistaken for web.

## 安装 / Installation

在插件页安装固定包。精确宿主：DSH **${hostVersion}**。保留已有配置和会话，待任务结束后完整重启。

Install the fixed package through Plugins on DSH **${hostVersion}**. Keep existing settings and conversations, then restart after active tasks finish.

| DSH | 固定包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| ${hostVersion} | [需求理解 0.3.4](https://github.com/gulagala001/oh-my-dsh/releases/download/v${packageInfo.version}/omd-prompt-optimizer-${version}.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v${packageInfo.version}/SHA256SUMS) |

[安装与使用 / Installation and usage](README.md)
`);
    const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0];
    const file = join(output, packed.filename);
    const publicFiles = new Set(['LICENSE', 'UPSTREAM.json', 'package.json', 'cordis.patch.yml', 'README.md', 'COMPATIBILITY.md', 'CHANGELOG.md', 'lib/host.mjs', 'lib/client.js']);
    const members = execFileSync('tar', ['-tzf', file], { encoding: 'utf8' }).trim().split('\n');
    if (members.length !== publicFiles.size || members.some(path => !path.startsWith('package/') || !publicFiles.delete(path.slice(8))) || publicFiles.size)
      throw Error('Intent Assistant distribution contains missing or unexpected files');
    return { name: manifest.name, version, hostVersion, file, sha256: digest(await readFile(file)) };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [archive, output] = process.argv.slice(2);
  if (!archive || !output) throw Error('Usage: build-intent-compat.mjs ARCHIVE OUTPUT');
  console.log(JSON.stringify(await buildIntentCompatibility(resolve(archive), resolve(output)), null, 2));
}
