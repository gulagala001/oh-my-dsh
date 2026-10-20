import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
await mkdir(new URL('lib/', root), { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('src/client/index.jsx', root))], outfile: fileURLToPath(new URL('lib/client.js', root)),
  bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', minifySyntax: true, minifyWhitespace: true, keepNames: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-primitives'],
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-deepseek-workbench",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
  plugins: [{ name: 'inline-css', setup(b) { b.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' })); } }],
});
