import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { recommendedPlugins } from '../src/recommended-plugin-catalog.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(resolve(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const digest = value => createHash('sha256').update(value).digest('hex');
const catalog = json('src/project-catalog.json');
const en = {
  'billion-context': ['Billion Context', 'Long-context compression, original-content recovery and cache diagnostics.'],
  'dsh-ops': ['dsh-ops', 'Bounded file, document and shell tools with on-demand discovery.'],
  'dsh-intelligent-ui': ['DSH Intelligent UI', 'Interactive charts, forms, calculators, simulations and games in answers.'],
  'oh-my-agents-above-all': ['Oh My Agents Above All', 'Agent presets and interfaces for Codex, Claude Code, Grok, Pi and ZCode workflows.'],
  'dsh-plugin-subscriptions': ['Subscription Login', 'Connect supported subscription providers and discover models.'],
  'dsh-open-design': ['OpenDesign', 'Design skills, templates and design systems.'],
  'omd-intent-assistant': ['Prompt Optimizer', 'Review and clarify requests before sending.'],
  'dsh-market': ['DSH Market', 'Browse and manage community plugins and themes.'],
  'dsh-infinite-gen-4': ['Infinite Gen 4', 'Prompt research and response-state presentation.'],
  'dsh-status-rotator': ['Status Rotator', 'Rotating activity text in the interface.'],
  'dsh-blender-plugin': ['DSH × Blender', 'Connect DSH tools to Blender.'],
  'dsh-whale-widget': ['Balance Whale Widget', 'Usage and balance widget with interactive characters.'],
};
const projects = catalog.projects.map(entry => {
  const bytes = readFileSync(resolve(root, entry.source));
  let metadata = {}; if (entry.source.endsWith('.json')) metadata = JSON.parse(bytes);
  return { ...entry, version: metadata.version || metadata.hostVersion || metadata.commit || 'SHA256:' + digest(bytes), sourceSha256: digest(bytes), group: entry.authors.startsWith('gulagala001') ? 'products' : 'sources' };
});
const ids = new Set(projects.map(entry => entry.id));
for (const plugin of recommendedPlugins) {
  if (ids.has(plugin.id)) continue;
  if (!en[plugin.id]) throw Error('Missing English project description: ' + plugin.id);
  const versions = Object.values(plugin.hostBuilds || {}).map(build => build.version);
  projects.push({ id: plugin.id, name: en[plugin.id][0], url: plugin.upstream?.url || plugin.url, authors: plugin.author,
    purpose: { zh: plugin.description, en: en[plugin.id][1] },
    relationship: { zh: '可选安装／推荐；当前兼容范围见插件兼容说明', en: 'Optional recommendation; see compatibility guide for current support' },
    source: 'src/recommended-plugin-catalog.mjs', version: versions.join(' / ') || plugin.review?.version || 'Upstream version',
    license: 'See upstream license and notices', notice: 'docs/plugin-compatibility.md', group: 'optional' });
}
if (new Set(projects.map(p => p.id)).size !== projects.length) throw Error('Duplicate project id');
for (const entry of projects) {
  if (!existsSync(resolve(root, entry.notice.split('#')[0]))) throw Error('Missing source notice: ' + entry.notice);
}

const lockFiles = ['pnpm-lock.yaml', 'vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml', 'vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml', 'vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml'];
const dependencies = new Map();
for (const file of lockFiles) {
  const lock = parse(read(file));
  for (const key of Object.keys(lock.packages || {})) {
    const id = key.replace(/\(.*/, ''), at = id.lastIndexOf('@');
    if (at <= 0) throw Error('Unsupported dependency identity: ' + key);
    const item = dependencies.get(id) || { name: id.slice(0, at), version: id.slice(at + 1), sources: [] };
    if (!item.sources.includes(file)) item.sources.push(file);
    dependencies.set(id, item);
  }
}
const dependencyList = [...dependencies.values()].sort((a,b) => (a.name + '@' + a.version).localeCompare(b.name + '@' + b.version, 'en'));
const provenance = { lockFiles: Object.fromEntries(lockFiles.map(file => [file, digest(read(file))])), dependencies: dependencyList };
function link(file) { return 'https://github.com/gulagala001/oh-my-dsh/blob/main/' + file; }
const cell = text => String(text).replaceAll('|', '\\|').replaceAll('\n',' ');
function page(language) {
  const english = language === 'en';
  let value = `# ${english ? 'Projects, components and acknowledgements' : '项目、组件与致谢'}\n\n[${english ? '中文' : 'English'}](components${english ? '' : '_EN'}.md) · [${english ? 'Home' : '首页'}](../README${english ? '_EN' : ''}.md) · [${english ? 'Complete notices' : '完整许可声明'}](../THIRD_PARTY_NOTICES.md)\n\n`;
  value += english ? 'This catalog covers independently maintained products, optional integrations, host components, source material and locked dependencies. Original authors and integration maintainers are credited separately where they differ. Version and host support come from the source manifests and compatibility guide.\n\n' : '本页收录自有独立产品、可选集成、宿主组件、来源素材及锁定依赖。原作者和适配维护者不同的项目分别署名；版本与宿主范围以来源清单和兼容说明为准。\n\n';
  for (const [group,zh,title] of [['products','独立产品与内置组件','Independent products and bundled components'],['optional','可选集成与推荐','Optional integrations and recommendations'],['sources','宿主、数据与素材','Host, data and source assets']]) {
    value += `## ${english ? title : zh}\n\n`;
    for (const entry of projects.filter(p => p.group === group)) {
      value += `### ${entry.name}\n\n[${english ? 'Project' : '项目'}](${entry.url}) · ${cell(entry.authors)}\n\n`;
      value += `${entry.purpose[language]} ${entry.relationship[language]}。\n\n`;
      value += `- ${english ? 'Pinned source / version' : '固定来源／版本'}: [${entry.version}](${link(entry.source)})\n- ${english ? 'License / attribution' : '许可／归属'}: ${entry.license} · [${english ? 'Details' : '详细声明'}](${link(entry.notice)})\n\n`;
    }
  }
  value += `## ${english ? 'Locked dependency inventory' : '完整锁定依赖清单'}\n\n`;
  value += english ? `All ${dependencyList.length} distinct package versions in the OMD and embedded OpenCU host/frontend lockfiles are listed below, including direct, transitive, build and optional platform dependencies. These are dependency inputs, not a claim that every package is loaded at runtime. Package pages provide original maintainers and license metadata; distributed licenses remain authoritative. [Machine-readable inventory](dependencies.json).\n\n` : `下表列出 OMD 与内置 OpenCU 宿主／前端锁文件中的全部 ${dependencyList.length} 个不同包版本，覆盖直接、间接、构建和可选平台依赖。它们是依赖输入，不代表全部在运行时加载。包页面提供原作者／维护者与许可信息，实际随包许可为准。[机器可读清单](dependencies.json)。\n\n`;
  value += `| ${english ? 'Package' : '依赖'} | ${english ? 'Version' : '版本'} | ${english ? 'Lockfile sources' : '来源锁文件'} |\n| --- | --- | --- |\n`;
  for (const item of dependencyList) value += `| [${item.name}](https://www.npmjs.com/package/${item.name}/v/${item.version}) | ${item.version} | ${item.sources.map(source => `[${source}](${link(source)})`).join(' · ')} |\n`;
  value += `\n## ${english ? 'History and maintenance' : '历史与维护'}\n\n`;
  value += english ? 'The JasonQQ BTW implementation was used through OMD 0.99.0 and replaced by DSH BTW in 0.99.1. Historical release sources retain their applicable attribution. Current entries are generated from `src/project-catalog.json`, the recommendation catalog, component manifests and dependency lockfiles. Run `npm run credits:write` after changing these inputs; `npm run credits:check` rejects stale documentation or runtime catalog data.\n' : 'JasonQQ 的 BTW 实现在 OMD 0.99.0 及以前使用，0.99.1 已切换为自有 DSH BTW；历史发行来源保留对应署名。当前条目由 `src/project-catalog.json`、推荐目录、组件清单和依赖锁文件共同生成。改变输入后运行 `npm run credits:write`；`npm run credits:check` 会拒绝过期文档或运行时清单。\n';
  return value;
}
const outputs = { 'src/project-credits.json': JSON.stringify({ schemaVersion: 1, projects },null,2)+'\n', 'docs/dependencies.json': JSON.stringify(provenance,null,2)+'\n', 'docs/components.md': page('zh'), 'docs/components_EN.md': page('en') };
for (const language of ['zh', 'en']) {
  const english = language === 'en', file = `README${english ? '_EN' : ''}.md`;
  let section = `<!-- project-credits:start -->\n## ${english ? 'Projects, components and acknowledgements' : '项目、组件与致谢'}\n\n`;
  section += `[${english ? 'Complete project, source and dependency inventory' : '完整项目、来源与依赖清单'}](docs/components${english ? '_EN' : ''}.md)\n\n`;
  section += `| ${english ? 'Project' : '项目'} | ${english ? 'Purpose' : '用途'} |\n| --- | --- |\n`;
  for (const entry of projects.filter(p => p.group !== 'sources')) section += `| [${entry.name}](${entry.url}) | ${cell(entry.purpose[language])} |\n`;
  section += '<!-- project-credits:end -->';
  const old = read(file), expression = /<!-- project-credits:start -->[\s\S]*?<!-- project-credits:end -->/;
  outputs[file] = expression.test(old) ? old.replace(expression, section) : old.trimEnd() + '\n\n' + section + '\n';
}
for (const [file, content] of Object.entries(outputs)) {
  if (process.argv.includes('--write')) writeFileSync(resolve(root, file), content);
  else if (!existsSync(resolve(root,file)) || read(file) !== content) throw Error('Stale credits output: ' + file + '; run npm run credits:write');
}
console.log(`Project catalog passed (${projects.length} projects, ${dependencyList.length} dependency versions).`);
