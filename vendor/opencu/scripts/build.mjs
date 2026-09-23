import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { whaleSvg } from '../src/client/brand.mjs';

await mkdir(new URL('../lib/', import.meta.url), { recursive: true });
for (const destination of ['../browser-extension/logo.svg']) {
  const url = new URL(destination, import.meta.url);
  await mkdir(new URL('./', url), { recursive: true });
  await writeFile(url, whaleSvg('omd-logo').replace('aria-hidden="true"', 'role="img" aria-label="Oh My DSH"'));
}
const nativeChat = await readFile(new URL('../vendor/dsh-chat/lib/client.js', import.meta.url), 'utf8');
if (!nativeChat.startsWith('window.__ModuleLoader__.load({') || !nativeChat.replace(/^\/\/# sourceMappingURL=.*$/gm, '').trimEnd().endsWith('});')) throw Error('Unexpected native Chat factory');
const registration = nativeChat.replace(/^\/\/# sourceMappingURL=.*$/gm, '').trimEnd().replace('window.__ModuleLoader__.load(', 'const registration = ').replace(/\);$/, ';');
await writeFile(new URL('../lib/chat.factory.mjs', import.meta.url), registration + '\nexport const createChat = require => registration.factory(require);\n');

await build({
  entryPoints: [fileURLToPath(new URL('../src/client/index.jsx', import.meta.url))],
  outfile: fileURLToPath(new URL('../lib/client.js', import.meta.url)),
  bundle: true, platform: 'browser', format: 'cjs', target: 'es2022',
  external: ['react-dom', 'react', 'react/jsx-runtime', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-primitives'],
  banner: { js: 'window.__ModuleLoader__.load({id:"opencu",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
  plugins: [{ name: 'inline-css', setup(b) {
    b.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' }));
  } }],
});
