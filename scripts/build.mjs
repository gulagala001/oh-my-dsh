import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await mkdir(new URL('../lib/', import.meta.url), { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('../src/client/index.jsx', import.meta.url))],
  outfile: fileURLToPath(new URL('../lib/client.js', import.meta.url)),
  bundle: true, platform: 'browser', format: 'cjs', target: 'es2022',
  external: ['react-dom', 'react', 'react/jsx-runtime', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-primitives'],
  banner: { js: 'window.__ModuleLoader__.load({id:"trisoul_x",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
  plugins: [{ name: 'inline-css', setup(b) {
    b.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' }));
  } }],
});
