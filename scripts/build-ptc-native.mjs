import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { replaceExactly } from './host-build-contracts.mjs';
const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
const file = host.resolve('@deepseek-ai/dsh-tool-executor-ptc');
let source = await readFile(file, 'utf8');
if (host('@deepseek-ai/dsh-tool-executor-ptc/package.json').version !== '0.2.2-rc.1'
  || createHash('sha256').update(source).digest('hex') !== 'aab21d46e71316a97ad2a071ab7d8d21aa876c4192a4cd98094f61b2800cad9a') throw Error('Unreviewed PTC executor source');
const controls = '["job_output", "job_list", "job_kill", "runtime_status"]';
source = replaceExactly(source, '!nested && name !== RUN_CODE_NAME ?', `!nested && name !== RUN_CODE_NAME && !${controls}.includes(name) ?`, 'PTC control dispatch');
source = replaceExactly(source, 'schemas: [projectToolSchema(this.requirePtcTransport(), false)],', `schemas: [projectToolSchema(this.requirePtcTransport(), false), ..._tools.filter(tool => ${controls}.includes(tool.name)).map(tool => projectToolSchema(tool, false))],`, 'PTC control schemas');
source = replaceExactly(source, 'knownNames: [RUN_CODE_NAME]', `knownNames: [RUN_CODE_NAME, ..._tools.filter(tool => ${controls}.includes(tool.name)).map(tool => tool.name)]`, 'PTC known control names');
await mkdir(new URL('lib/host/', root), { recursive: true });
const result = await build({ stdin: { contents: source, resolveDir: dirname(file), sourcefile: 'reviewed-ptc-executor.js' },
  outfile: new URL('lib/host/ptc-native.factory.mjs', root).pathname, bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external', metafile: true,
  banner: { js: 'export function createModule(require) { const module={exports:{}}; const exports=module.exports;' }, footer: { js: 'return module.exports; }' } });
const deps = [...new Set(Object.values(result.metafile.outputs).flatMap(output => output.imports.filter(x => x.external).map(x => x.path)))];
await writeFile(new URL('lib/host/ptc-native.dependencies.json', root), JSON.stringify(deps, null, 2)+'\n');
