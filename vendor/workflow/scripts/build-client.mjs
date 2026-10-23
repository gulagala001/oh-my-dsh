import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { outputPath, readJson, root } from './build-inputs.mjs';

const pkg = await readJson(join(root, 'package.json'));
const result = await build({ absWorkingDir: root, entryPoints: [join(root, 'src/client/index.jsx')], bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', packages: 'external',
  minifySyntax: true, minifyWhitespace: true, keepNames: true, write: false, metafile: true,
  supported: { 'dynamic-import': false },
  plugins: [{ name: 'inline-css', setup(b) { b.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' })); } }] });
const imports = [...new Set(Object.values(result.metafile.outputs).flatMap(output => output.imports.filter(item => item.external).map(item => item.path)))].sort();
if (imports.some(name => !['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/cordis'].includes(name) && !name.startsWith('@deepseek-ai/dsh-'))) throw Error(`Unsupported client external: ${imports.join(', ')}`);
const body = `var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;`;
await writeFile(await outputPath(join(root, 'lib/client.js')), `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{${body}}});\n`);
await writeFile(await outputPath(join(root, 'lib/client.factory.mjs')), `export function createWorkflowClient(require) {${body}}\n`);
console.log(`Built ${pkg.name} client with host-provided REA components.`);
