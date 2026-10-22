import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  entryPoints: [fileURLToPath(new URL('../src/client/index.jsx', import.meta.url))],
  outfile: fileURLToPath(new URL('../lib/client.js', import.meta.url)),
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022',
  minifyWhitespace: true, minifySyntax: true,
  external: ['@deepseek-ai/cordis', 'react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
  loader: { '.css': 'text' },
  banner: { js: 'window.__ModuleLoader__.load({id:"@gulagala001/dsh-btw",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
});
