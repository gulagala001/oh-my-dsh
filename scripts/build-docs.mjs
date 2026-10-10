import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { Parser } from 'htmlparser2';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputMarker = '.omd-docs-site';
const markerContent = 'oh-my-dsh-docs/v1\n';
const rootDocuments = ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md'];
// Publish authored user documentation, never a recursive copy of the workspace.
const guides = [
  'README.md', 'getting-started.md', 'usage.md', 'upgrade.md', 'troubleshooting.md',
  'windows.md', 'skins.md', 'codex-desktop.md', 'ios-liquid-glass.md',
  'claude-cli-terminal.md', 'google-material-expressive.md', 'context-workflow.md',
  'claude-cli-skin-research.md', 'google-material-expressive-research.md',
  'monitoring.md', 'dream-memory.md', 'prompt-adaptation.md', 'runtime-state-background.md',
  'workflow.md', 'open-design.md', 'plugin-submissions.md', 'showcase.md', 'dsh-0.2-preparation.md',
  'rea-development.md', 'plugin-compatibility.md',
  'upstream-patches/README.md', 'site/README.md',
];
const navigation = [
  ['开始使用', [['docs/README.md', '文档目录'], ['docs/getting-started.md', '首次使用'],
    ['docs/upgrade.md', '安装与升级'], ['docs/usage.md', '完整使用指南'], ['docs/troubleshooting.md', '遇到问题']]],
  ['继续探索', [['docs/context-workflow.md', '上下文与记忆'], ['docs/dream-memory.md', 'Dream 记忆'],
    ['docs/usage.md#computer-use', '电脑操作'], ['docs/skins.md', '主题与定制'],
    ['docs/workflow.md', 'Ultracode 与 Workflow'], ['docs/plugin-submissions.md', '插件投稿']]],
];
const privateDocument = /^(?:AGENTS|CLAUDE|AI_README|PROMPT_MAINTENANCE|PROMPT_CHANGES|COMPUTER_USE_(?:HANDOFF|BASELINE|ASSESSMENT)|WINDOWS_HANDOFF)\.md$/i;
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.avif']);
const escapeHtml = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const htmlFile = file => file.replace(/\.md$/i, '.html');
const relativeUrl = (from, to) => path.posix.relative(path.posix.dirname(htmlFile(from)), to) || path.posix.basename(to);

function parseHtml(html, handlers) {
  const parser = new Parser(handlers, { decodeEntities: true });
  parser.end(html);
}

function textContent(html) {
  let text = '';
  parseHtml(html, { ontext(value) { text += value; } });
  return text;
}

function headingSlug(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-');
}

function rewriteUrl(target, file, pages, assets, repository) {
  if (/^(?:javascript|vbscript|file):/i.test(target) || /[\u0000-\u001f]/.test(target)) throw new Error(`${file}: unsafe document URL ${target}`);
  if (!target || /^(?:[a-z][\w+.-]*:|\/\/|#|\?)/i.test(target)) return target;
  const url = new URL(target, `https://docs.invalid/${file}`);
  const destination = decodeURIComponent(url.pathname).slice(1);
  if (privateDocument.test(path.posix.basename(destination)) || destination.split('/').some(part => part.startsWith('.'))) {
    throw new Error(`${file}: private document cannot be published: ${target}`);
  }
  let output = pages.has(destination) ? htmlFile(destination) : destination;
  if (assets.has(output + '/index.html')) output += '/index.html';
  if (pages.has(destination) || assets.has(output)) return relativeUrl(file, output) + url.search + url.hash;
  // Source references stay available on GitHub without shipping implementation or local data.
  if (/^(?:src|vendor|scripts)\//.test(destination)) return `${repository}/blob/main/${url.pathname.slice(1)}${url.search}${url.hash}`;
  throw new Error(`${file}: link is outside the public site: ${target}`);
}

function rewriteHtml(html, file, pages, assets, repository) {
  const changes = [];
  let parser;
  parser = new Parser({
    onopentag(name, attributes) {
      if (!['a', 'img', 'source', 'video', 'script', 'link'].includes(name)) return;
      const original = html.slice(parser.startIndex, parser.endIndex + 1);
      const rewritten = original.replace(/(\s)(href|src|poster)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, (attribute, space, key) => {
        const target = attributes[key.toLowerCase()];
        if (target === undefined) return attribute;
        const next = rewriteUrl(target, file, pages, assets, repository);
        return next === target ? attribute : `${space}${key}="${escapeHtml(next)}"`;
      });
      if (rewritten !== original) changes.push([parser.startIndex, parser.endIndex + 1, rewritten]);
    },
  }, { decodeEntities: true });
  parser.end(html);
  for (const [start, end, replacement] of changes.reverse()) html = html.slice(0, start) + replacement + html.slice(end);
  return html;
}

function renderMarkdown(markdown, file, diagrams) {
  const headings = [], ids = new Set();
  let diagramNumber = 0;
  const renderer = new marked.Renderer();
  // Explicit anchors are part of the existing GitHub document contract.
  for (const token of marked.lexer(markdown)) {
    if (token.type === 'html') parseHtml(token.text, { onopentag(name, attrs) { if (attrs.id) ids.add(attrs.id); } });
  }
  renderer.heading = function ({ tokens, depth }) {
    const inline = this.parser.parseInline(tokens), text = textContent(inline);
    const base = headingSlug(text);
    let id = base, number = 0;
    while (ids.has(id)) id = `${base}-${++number}`;
    ids.add(id); headings.push({ text, depth, id });
    return `<h${depth} id="${escapeHtml(id)}">${inline}<a class="heading-link" href="#${encodeURIComponent(id)}" aria-label="链接到：${escapeHtml(text)}">#</a></h${depth}>\n`;
  };
  const baseCode = renderer.code, baseTable = renderer.table;
  renderer.code = function (token) {
    const language = (token.lang || '').split(/\s+/)[0];
    const code = `<div class="code-block"><div class="code-toolbar"><span>${escapeHtml(language || '代码')}</span><button class="code-copy" type="button" aria-label="复制代码" hidden>复制</button></div>${baseCode.call(this, token)}</div>\n`;
    if (language !== 'mermaid') return code;
    const marker = `<!--omd-diagram-${diagrams.length + 1}-->`;
    diagrams.push({ file, source: token.text, marker, number: ++diagramNumber });
    return `<figure class="doc-diagram">${marker}<details class="diagram-source"><summary>查看图示源码</summary>${code}</details></figure>\n`;
  };
  renderer.table = function (token) {
    return `<div class="table-scroll" role="region" aria-label="数据表格" tabindex="0">${baseTable.call(this, token)}</div>\n`;
  };
  return { html: marked.parse(markdown, { renderer, gfm: true }), headings };
}

function documentPage(file, markdown, { pages, assets, repository, version, source = file, diagrams }) {
  const firstDiagram = diagrams.length;
  const rendered = renderMarkdown(markdown, file, diagrams);
  const title = rendered.headings.find(heading => heading.depth === 1)?.text || (file === 'README.md' ? '项目介绍' : path.posix.basename(file, '.md'));
  for (let index = firstDiagram; index < diagrams.length; index++) diagrams[index].title = `${title} · 图示 ${diagrams[index].number}`;
  const article = rewriteHtml(rendered.html, file, pages, assets, repository);
  const link = target => rewriteUrl(relativeUrl(file, target), file, pages, assets, repository);
  const nav = navigation.map(([label, entries]) => `<div class="nav-group"><p>${label}</p>${entries.filter(([target]) => pages.has(target.split('#')[0])).map(([target, text]) => `<a href="${escapeHtml(link(target))}"${target === file ? ' aria-current="page"' : ''}>${text}</a>`).join('')}</div>`).join('');
  const sections = rendered.headings.filter(heading => heading.depth === 2 || heading.depth === 3);
  const toc = sections.map(heading => `<a class="toc-depth-${heading.depth}" href="#${encodeURIComponent(heading.id)}">${escapeHtml(heading.text)}</a>`).join('');
  const description = textContent(rendered.html).replace(/\s+/g, ' ').slice(0, 150);
  return `<!doctype html>
<html lang="zh-CN"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}"><meta name="theme-color" content="#f5f5f2">
  <title>${escapeHtml(title)} · Oh My DSH</title>
  <link rel="icon" href="${link('docs/images/logo.svg')}" type="image/svg+xml">
  <link rel="stylesheet" href="${link('docs/site/docs.css')}"><script src="${link('docs/site/docs.js')}" defer></script>
</head><body>
  <a class="skip-link" href="#document">跳到文档内容</a>
  <header class="doc-header"><a class="brand" href="${link('docs/index.html')}" aria-label="Oh My DSH 产品首页"><img src="${link('docs/images/logo.svg')}" width="28" height="28" alt="">Oh My DSH<span>.</span></a><a class="header-docs" href="${link('docs/README.md')}">文档</a><a class="header-github" href="${repository}" target="_blank" rel="noreferrer">GitHub ↗</a></header>
  <div class="doc-layout"><aside class="doc-sidebar"><nav aria-label="文档导航">${nav}</nav></aside>
    <main id="document" class="doc-main">
      <details class="mobile-nav"><summary>文档导航</summary><nav aria-label="移动文档导航">${nav}</nav></details>
      <p class="document-meta">DOCUMENTATION <span>OMD ${escapeHtml(version)}</span></p>
      ${toc ? `<details class="mobile-toc"><summary>本页目录</summary><nav aria-label="移动本页目录">${toc}</nav></details>` : ''}
      <article class="doc-article">${rendered.headings.some(heading => heading.depth === 1) ? '' : `<h1>${escapeHtml(title)}</h1>`}${article}</article>
      <footer class="doc-footer"><a href="${link('docs/README.md')}">← 文档目录</a>${source ? `<a href="${repository}/blob/main/${source}" target="_blank" rel="noreferrer">查看 Markdown 源文件 ↗</a>` : ''}</footer>
    </main>
    ${toc ? `<aside class="doc-toc"><nav aria-label="本页目录"><p>本页目录</p>${toc}</nav></aside>` : ''}
  </div><p class="copy-status sr-only" role="status" aria-live="polite"></p>
</body></html>\n`;
}

function verifyDiagram(svg) {
  const css = value => {
    if (/\\|@import/i.test(value) || [...value.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi)].some(match => !match[2].trim().startsWith('#'))) {
      throw new Error('图示包含外部资源，静态图示仅允许内部引用');
    }
  };
  let inStyle = false;
  parseHtml(svg, { onopentag(name, attrs) {
    if (['script', 'foreignobject', 'a', 'image', 'iframe'].includes(name)) throw new Error(`静态图示不支持交互或外部内容：${name}`);
    for (const [key, value] of Object.entries(attrs)) {
      if (/^on/i.test(key)) throw new Error('静态图示不支持脚本事件');
      if (['href', 'xlink:href', 'src'].includes(key) && !value.startsWith('#')) throw new Error('静态图示不支持外部链接');
      if (key === 'style' || /url\s*\(/i.test(value)) css(value);
    }
    inStyle = name === 'style';
  }, ontext(value) { if (inStyle) css(value); }, onclosetag(name) { if (name === 'style') inStyle = false; } });
}

async function renderDiagrams(diagrams, output, chromiumExecutablePath) {
  if (!diagrams.length) return;
  let browser;
  try {
    let runtime;
    try { runtime = fileURLToPath(import.meta.resolve('@mermaid-js/tiny')); }
    catch (error) { throw new Error('缺少 Mermaid 构建依赖，请执行 pnpm install --frozen-lockfile', { cause: error }); }
    const { chromium } = await import('playwright');
    try { browser = await chromium.launch({ headless: true, executablePath: chromiumExecutablePath, args: ['--use-mock-keychain', '--password-store=basic'] }); }
    catch (error) { throw new Error('Mermaid 图示需要本地 Chromium。请执行 pnpm exec playwright install chromium；Linux CI 使用 --with-deps chromium。旧站点保留。', { cause: error }); }
    const page = await browser.newPage(), blockedRequests = [];
    await page.route('**/*', route => { blockedRequests.push(route.request().url()); return route.abort(); });
    await page.addScriptTag({ path: runtime });
    await page.evaluate(() => mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'base',
      fontFamily: "Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      flowchart: { htmlLabels: false, useMaxWidth: false },
      themeVariables: { primaryColor: '#f5f5f2', primaryTextColor: '#171817', primaryBorderColor: '#171817', lineColor: '#315fda', secondaryColor: '#eaeae5', tertiaryColor: '#f5f5f2' },
      secure: ['secure', 'securityLevel', 'startOnLoad', 'htmlLabels', 'maxTextSize', 'maxEdges', 'suppressErrorRendering'],
    }));
    for (const [index, diagram] of diagrams.entries()) {
      let deadline;
      try {
        const render = page.evaluate(async ({ source, id, title }) => {
          const result = await mermaid.render(id, source);
          const svg = new DOMParser().parseFromString(result.svg, 'image/svg+xml').documentElement;
          if (svg.localName !== 'svg') throw new Error('Mermaid 没有返回可用 SVG；静态图示不支持外部链接或交互内容');
          const namespace = 'http://www.w3.org/2000/svg';
          const label = svg.querySelector(':scope > title') || svg.insertBefore(document.createElementNS(namespace, 'title'), svg.firstChild);
          const description = svg.querySelector(':scope > desc') || svg.insertBefore(document.createElementNS(namespace, 'desc'), label.nextSibling);
          label.id ||= `${id}-title`; label.textContent ||= title;
          description.id ||= `${id}-description`; description.textContent ||= [...svg.querySelectorAll('text')].map(node => node.textContent.trim()).filter(Boolean).join('；');
          svg.setAttribute('role', 'img'); svg.setAttribute('aria-labelledby', label.id); svg.setAttribute('aria-describedby', description.id);
          const [, , width, height] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
          return { svg: new XMLSerializer().serializeToString(svg), title: label.textContent, description: description.textContent, width, height };
        }, { source: diagram.source, id: `omd-diagram-${index + 1}`, title: diagram.title });
        const rendered = await Promise.race([render, new Promise((_, reject) => {
          deadline = setTimeout(() => reject(new Error('图示渲染超过 30 秒，已中止构建')), 30000);
        })]);
        if (blockedRequests.length) throw new Error('图示尝试读取远程资源；已阻止请求');
        verifyDiagram(rendered.svg);
        if (!(Number.isFinite(rendered.width) && rendered.width > 0 && Number.isFinite(rendered.height) && rendered.height > 0)) throw new Error('图示没有有效尺寸');
        const graphic = `docs/site/diagrams/${createHash('sha256').update(rendered.svg).digest('hex').slice(0, 24)}.svg`;
        output.set(graphic, rendered.svg);
        const src = escapeHtml(relativeUrl(diagram.file, graphic)), title = escapeHtml(rendered.title);
        const alternative = escapeHtml(`${rendered.title}：${rendered.description}`);
        const markup = `<figcaption><span>${title}</span><a href="${src}" target="_blank" rel="noreferrer">放大图示 ↗</a></figcaption><div class="diagram-scroll" role="region" aria-label="${title}，可横向滚动" tabindex="0" style="--diagram-width:${Math.ceil(rendered.width)}px"><img src="${src}" width="${rendered.width}" height="${rendered.height}" alt="${alternative}"></div>`;
        const file = htmlFile(diagram.file);
        output.set(file, output.get(file).replace(diagram.marker, markup));
      } catch (error) {
        throw new Error(`${diagram.file}：图示 ${diagram.number} 渲染失败。请核对 Mermaid 语法及 Tiny 支持范围；旧站点保留。\n${error.message}`, { cause: error });
      } finally { clearTimeout(deadline); }
    }
  } finally { await browser?.close(); }
}

async function regularFile(root, file, required = false) {
  try {
    const stat = await lstat(path.join(root, file));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Public file must be a regular file: ${file}`);
    await checkPublicPath(root, file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' && !required) return false;
    throw error;
  }
}

async function checkPublicPath(root, file) {
  // Compare against the canonical root, allowing system aliases such as /tmp but
  // refusing a symlink anywhere inside a declared public path.
  if (await realpath(path.join(root, file)) !== path.join(await realpath(root), file)) {
    throw new Error(`Public paths cannot contain symlinks: ${file}`);
  }
}

async function assetFiles(root, directory, accept) {
  let entries;
  try { await checkPublicPath(root, directory); entries = await readdir(path.join(root, directory), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const file = directory + '/' + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Public assets cannot be symlinks: ${file}`);
    if (entry.isDirectory()) files.push(...await assetFiles(root, file, accept));
    else if (entry.isFile() && accept(file)) files.push(file);
  }
  return files.sort();
}

function verifyPages(output) {
  const details = new Map();
  for (const [file, html] of output) {
    if (!file.endsWith('.html')) continue;
    const ids = new Set(), links = [];
    parseHtml(html, { onopentag(name, attrs) {
      if (attrs.id) { if (ids.has(attrs.id)) throw new Error(`${file}: duplicate id ${attrs.id}`); ids.add(attrs.id); }
      for (const key of ['href', 'src', 'poster']) if (attrs[key]) links.push(attrs[key]);
    } });
    details.set(file, { ids, links });
  }
  for (const [file, { links }] of details) {
    for (const target of links) {
      if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(target)) continue;
      const url = new URL(target, `https://docs.invalid/${file}`), destination = decodeURIComponent(url.pathname).slice(1);
      if (!output.has(destination)) throw new Error(`${file}: missing static target ${target}`);
      if (url.hash && details.has(destination) && !details.get(destination).ids.has(decodeURIComponent(url.hash.slice(1)))) {
        throw new Error(`${file}: missing static section ${target}`);
      }
    }
  }
}

function checkOutputPath(root, outDir) {
  const withinRoot = path.relative(root, outDir), rootWithinOutput = path.relative(outDir, root);
  const inside = value => !value || (!value.startsWith('..' + path.sep) && value !== '..' && !path.isAbsolute(value));
  if (inside(rootWithinOutput) || (inside(withinRoot) && withinRoot.split(path.sep)[0] !== 'dist')) {
    throw new Error('Documentation output must be inside dist or outside the source tree');
  }
}

async function checkOutputDirectory(root, outDir) {
  checkOutputPath(root, outDir);
  let ancestor = outDir;
  for (;;) {
    try { await lstat(ancestor); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; ancestor = path.dirname(ancestor); }
  }
  // Resolve existing ancestors as well as the output itself; dist may be a symlink.
  const actualOutput = path.resolve(await realpath(ancestor), path.relative(ancestor, outDir));
  checkOutputPath(await realpath(root), actualOutput);
  let stat;
  try { stat = await lstat(outDir); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Documentation output must be a regular directory');
  if (!(await readdir(outDir)).length) return;
  if (!await regularFile(outDir, outputMarker) || await readFile(path.join(outDir, outputMarker), 'utf8') !== markerContent) {
    throw new Error('Refusing to replace a nonempty directory without the documentation generator marker');
  }
}

export async function buildDocs({ root = projectRoot, outDir = path.join(root, 'dist/site'), chromiumExecutablePath } = {}) {
  root = path.resolve(root); outDir = path.resolve(outDir);
  await checkOutputDirectory(root, outDir);
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const repository = (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || 'https://github.com/gulagala001/oh-my-dsh').replace(/^git\+/, '').replace(/\.git$/, '');
  const releases = (await readdir(path.join(root, 'docs'))).filter(file => /^release-[\w.-]+\.md$/.test(file)).map(file => 'docs/' + file);
  const pages = new Set();
  for (const file of [...rootDocuments, ...guides.map(file => 'docs/' + file), ...releases]) {
    if (await regularFile(root, file, ['README.md', 'docs/README.md'].includes(file))) pages.add(file);
  }
  const staticAssets = [
    'docs/index.html', 'docs/site/site.css', 'docs/site/site.js', 'docs/site/docs.css', 'docs/site/docs.js',
    ...await assetFiles(root, 'docs/images', file => imageExtensions.has(path.extname(file)) || file === 'docs/images/readme-screenshots.json'),
    ...await assetFiles(root, 'docs/site/media', file => imageExtensions.has(path.extname(file)) || ['.mp4', '.webm'].includes(path.extname(file)) || file === 'docs/site/media/manifest.json'),
    ...await assetFiles(root, 'docs/skin-font-licenses', file => file.endsWith('-OFL.txt')),
    ...(await regularFile(root, 'docs/upstream-patches/dsh-alpha2-release-output.patch') ? ['docs/upstream-patches/dsh-alpha2-release-output.patch'] : []),
  ];
  for (const file of staticAssets) await regularFile(root, file, true);
  const assets = new Set(staticAssets), output = new Map(staticAssets.map(file => [file, null])), diagrams = [];
  const licenses = staticAssets.filter(file => file.startsWith('docs/skin-font-licenses/'));
  if (licenses.length) {
    assets.add('docs/skin-font-licenses/index.html');
    const markdown = '# 随包字体许可\n\n[返回外观指南](../skins.md)\n\n' + licenses.map(file => `- [${path.posix.basename(file)}](${path.posix.basename(file)})`).join('\n');
    output.set('docs/skin-font-licenses/index.html', documentPage('docs/skin-font-licenses/index.md', markdown, { pages, assets, repository, version: pkg.version, source: null, diagrams }));
  }
  for (const file of pages) output.set(htmlFile(file), documentPage(file, await readFile(path.join(root, file), 'utf8'), { pages, assets, repository, version: pkg.version, diagrams }));
  output.set('docs/index.html', rewriteHtml(await readFile(path.join(root, 'docs/index.html'), 'utf8'), 'docs/index.html', pages, assets, repository));
  output.set('index.html', '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=docs/index.html"><title>Oh My DSH</title></head><body><a href="docs/index.html">进入 Oh My DSH 产品首页</a></body></html>\n');
  output.set('.nojekyll', '');
  output.set(outputMarker, markerContent);
  await renderDiagrams(diagrams, output, chromiumExecutablePath);
  verifyPages(output);
  await checkOutputDirectory(root, outDir);
  await rm(outDir, { recursive: true, force: true });
  for (const [file, html] of output) {
    const destination = path.join(outDir, file);
    await mkdir(path.dirname(destination), { recursive: true });
    if (html === null) await copyFile(path.join(root, file), destination);
    else await writeFile(destination, html);
  }
  return { outDir, documents: pages.size, files: output.size, diagrams: diagrams.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildDocs();
  console.log(`Built ${result.documents} documents / ${result.diagrams} static diagrams / ${result.files} files: ${result.outDir}`);
}
