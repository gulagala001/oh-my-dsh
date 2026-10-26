import { meteringVersion } from './metering-inputs.mjs';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hostTarget } from './host-targets.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(root+'lib/host',{recursive:true});
await writeFile(root+'lib/host/metering-version.mjs',`export const ESTIMATOR_VERSION = ${await meteringVersion()};\n`);
const source = JSON.parse(await readFile(root + 'src/metering/native/source.json'));
const pkg = JSON.parse(await readFile(root + 'package.json'));
if (source.commit !== hostTarget(pkg.engines.dsh).commit) throw Error('Metering source does not match the host');
for (const [file, hash] of Object.entries(source.files)) {
  if (createHash('sha256').update(await readFile(root + 'src/metering/native/' + file)).digest('hex') !== hash) throw Error('Changed upstream metering source: ' + file);
}
await build({ entryPoints: [root + 'src/metering/native.mjs'], outfile: root + 'lib/host/token-meter-core.mjs',
  bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external',
  plugins: [{ name: 'shared-estimator', setup(build) {
    build.onResolve({ filter: /^\.\/estimate\.ts$/ }, () => ({ path: root + 'src/metering/estimate.mjs' }));
  } }], legalComments: 'eof' });

// Host factories resolve SDK dependencies through the original Loader tree.
// Exporting the pinned instruction is the only adaptation of this upstream helper.
for(const [name,entry,reference] of [['token-meter','service','token-meter'],['compaction','compaction','compaction-basic']]) {
  const result=await build({entryPoints:[root+`src/metering/${entry}.mjs`],outfile:root+`lib/host/${name}.factory.mjs`,
    bundle:true,platform:'node',target:'node22',format:'cjs',packages:'external',metafile:true,
    banner:{js:'export function createModule(require) { const module={exports:{}}; const exports=module.exports;'},
    footer:{js:'return module.exports; }'},legalComments:'eof',
    plugins:[{name:'native-summary-export',setup(build){
      build.onLoad({filter:/metering\/native\/summarizer\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('const COMPACTION_INSTRUCTION =','export const COMPACTION_INSTRUCTION ='),loader:'ts'}));
    }}]});
  const dependencies=[...new Set(Object.values(result.metafile.outputs).flatMap(o=>o.imports.filter(i=>i.external).map(i=>i.path)))];
  const {writeFile}=await import('node:fs/promises');
  await writeFile(root+`lib/host/${name}.mjs`,`import { createModule } from './${name}.factory.mjs';\nimport { mountHostComponent } from '../../src/host-component.mjs';\nexport const inject=['loader'];\nexport const apply=(ctx,config)=>mountHostComponent(ctx,${JSON.stringify(reference)},createModule,${JSON.stringify(dependencies)},config);\n`);
}
