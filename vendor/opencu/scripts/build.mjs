import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractStandalonePrimitiveHooks } from './standalone-primitive-hooks.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--browser-only')) throw new Error('Usage: node scripts/build.mjs [--browser-only]');
const inlineCss = { name: 'inline-css', setup(b) {
  b.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' }));
} };

if (!args.length) {
  await mkdir(new URL('../lib/', import.meta.url), { recursive: true });
  const nativeChat = await readFile(new URL('../vendor/dsh-chat/lib/client.js', import.meta.url), 'utf8');
  if (!nativeChat.startsWith('window.__ModuleLoader__.load({') || !nativeChat.replace(/^\/\/# sourceMappingURL=.*$/gm, '').trimEnd().endsWith('});')) throw Error('Unexpected native Chat factory');
  const chatViewRegistration = '}, ChatView);';
  if (nativeChat.split(chatViewRegistration).length !== 2) throw Error('Expected one owned ChatView registration');
  const ownedChat = nativeChat
    .replace(chatViewRegistration, '}, options.renderChatView ? props => options.renderChatView(react.createElement(ChatView, props), props) : ChatView);')
    .replace(/(const tagId(?:\$\d+)? = )"@deepseek-ai\/dsh-client-ui-chat\//g, '$1"opencu-shared-chat/')
    .replaceAll('tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat"', 'tag.dataset.plugin = "opencu-shared-chat"');
  const registration = ownedChat.replace(/^\/\/# sourceMappingURL=.*$/gm, '').trimEnd().replace('window.__ModuleLoader__.load(', 'const registration = ').replace(/\);$/, ';');
  await writeFile(new URL('../lib/chat.factory.mjs', import.meta.url), registration + '\nexport const createChat = require => registration.factory(require);\n');

  await build({
    entryPoints: [fileURLToPath(new URL('../src/client/index.jsx', import.meta.url))],
    outfile: fileURLToPath(new URL('../lib/client.js', import.meta.url)),
    bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', keepNames: true,
    external: ['react-dom', 'react', 'react/jsx-runtime', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-primitives'],
    banner: { js: 'window.__ModuleLoader__.load({id:"opencu",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
    footer: { js: 'return module.exports;}});' },
    plugins: [inlineCss],
  });
  const require = createRequire(import.meta.url);
  const corePackage = require.resolve('@dnd-kit/core/package.json');
  const dndRequire = createRequire(corePackage);
  const noticeDirectory = new URL('../lib/third-party/', import.meta.url);
  await mkdir(noticeDirectory, { recursive: true });
  const sources = [];
  for (const name of ['@dnd-kit/core', '@dnd-kit/accessibility', '@dnd-kit/utilities']) {
    const packagePath = dndRequire.resolve(`${name}/package.json`);
    const metadata = JSON.parse(await readFile(packagePath, 'utf8'));
    if (metadata.license !== 'MIT' || (name === '@dnd-kit/core' && metadata.version !== '6.3.1')) throw new Error(`Unexpected bundled drag library: ${name}`);
    const directory = dirname(packagePath), licenseFile = `dnd-kit-${name.split('/')[1]}.LICENSE.txt`;
    await writeFile(new URL(licenseFile, noticeDirectory), await readFile(join(directory, 'LICENSE')));
    const source = await readFile(join(directory, metadata.module));
    sources.push({ package: name, version: metadata.version, source: metadata.repository?.url,
      sourceFile: metadata.module, sourceSha256: createHash('sha256').update(source).digest('hex'), license: metadata.license, licenseFile });
  }
  await writeFile(new URL('dnd-kit.source.json', noticeDirectory), JSON.stringify(sources, null, 2) + '\n');
}

const browserDirectory = new URL('../lib/plugin-browser/', import.meta.url);
await mkdir(browserDirectory, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('../native/plugin-browser/annotation-preload.mjs', import.meta.url))],
  outfile: fileURLToPath(new URL('annotation-preload.cjs', browserDirectory)),
  bundle: true, platform: 'node', format: 'cjs', target: 'es2022', external: ['electron'],
});
const primitiveHooks = await extractStandalonePrimitiveHooks();
const standaloneHooks = { name: 'standalone-primitive-hooks', setup(b) {
  b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitive-hooks', namespace: 'opencu-standalone' }));
  b.onLoad({ filter: /^primitive-hooks$/, namespace: 'opencu-standalone' }, () => ({
    contents: primitiveHooks.contents, loader: 'js', resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  }));
} };
const browserBuild = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/codex-detached-browser-entry.jsx', import.meta.url))],
  outfile: fileURLToPath(new URL('index.js', browserDirectory)),
  bundle: true, platform: 'browser', format: 'iife', target: 'es2022', keepNames: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.png': 'file', '.jpg': 'file', '.jpeg': 'file', '.webp': 'file', '.gif': 'file', '.svg': 'file', '.woff': 'file', '.woff2': 'file' },
  assetNames: 'assets/[name]-[hash]',
  metafile: true,
  plugins: [inlineCss, standaloneHooks],
});
const authDirectory = new URL('../lib/browser-auth/', import.meta.url);
await mkdir(authDirectory, { recursive: true });
const authBuild = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/codex-browser-auth-entry.jsx', import.meta.url))],
  outfile: fileURLToPath(new URL('index.js', authDirectory)),
  bundle: true, platform: 'browser', format: 'iife', target: 'es2022', keepNames: true,
  define: { 'process.env.NODE_ENV': '"production"' }, metafile: true,
  plugins: [inlineCss, standaloneHooks],
});
for (const output of [...Object.values(browserBuild.metafile.outputs), ...Object.values(authBuild.metafile.outputs)]) {
  if (output.imports.some(value => value.external && ['import-statement', 'dynamic-import', 'require-call'].includes(value.kind))) {
    throw new Error('The standalone browser renderer must bundle all script dependencies locally.');
  }
  if (Object.entries(output.inputs).some(([path, input]) => path.includes('/node_modules/@deepseek-ai/') && input.bytesInOutput > 0)) {
    throw new Error('The standalone browser renderer cannot include a DSH runtime module.');
  }
}
await writeFile(new URL('primitive-hooks.source.json', browserDirectory), JSON.stringify(primitiveHooks.provenance, null, 2) + '\n');
await writeFile(new URL('dsh-ui-primitives.LICENSE.txt', browserDirectory), primitiveHooks.license);
await writeFile(new URL('index.html', authDirectory), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>OpenCU</title><style>@layer theme,base,components,utilities;html,body,#root{width:100%;height:100%;margin:0}</style>
<script defer src="./index.js"></script></head><body><div id="root"></div></body></html>\n`);
await writeFile(new URL('index.html', browserDirectory), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>OpenCU</title>
  <style>@layer theme,base,components,utilities;html,body,#root{width:100%;height:100%;margin:0}body{background:transparent}</style>
  <script defer src="./index.js"></script>
</head>
<body tabindex="0"><div id="root"></div></body>
</html>
`);
