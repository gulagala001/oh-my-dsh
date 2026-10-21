import './build-permission-native.mjs';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await mkdir(resolve(root, 'lib'), { recursive: true });
await build({ entryPoints: [resolve(root, 'src/client/index.jsx')], outfile: resolve(root, 'lib/client.js'),
  bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', minify: true, keepNames: true, charset: 'utf8',
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
  footer: { js: 'return module.exports;}});' },
  plugins: [{ name: 'css', setup(build) { build.onLoad({ filter: /\.css$/ }, async ({ path }) => ({ contents: `export default ${JSON.stringify(await readFile(path, 'utf8'))}`, loader: 'js' })); } }],
});
