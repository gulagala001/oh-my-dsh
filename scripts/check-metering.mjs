import { meteringVersion } from './metering-inputs.mjs';
import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { transform } from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const failures=[];
const fields=/\b(?:inputTokens|cacheReadTokens|cacheWriteTokens|outputTokens)\b/;
export function meteringViolations(source,file) {
  const errors=[];const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  function visit(node,owner='') {
    if(!node||typeof node!=='object')return;
    const name=node.type==='VariableDeclarator'?node.id?.name:node.type==='FunctionDeclaration'?node.id?.name:owner;
    const text=source.slice(node.start,node.end);
    if(node.type==='BinaryExpression'&&node.operator==='+'&&fields.test(text)&&!file.startsWith('src/metering/')
      && /(?:\.inputTokens|\.cacheReadTokens|\.cacheWriteTokens|\.outputTokens)/.test(text))errors.push('usage buckets must be interpreted by the receipt contract');
    if(node.type==='BinaryExpression'&&['/','*'].includes(node.operator)&&[3,4].includes(node.right?.value)
      && /token|estimate/i.test(name??'')&&!file.startsWith('src/metering/'))errors.push('token estimation must live in the metering kernel');
    if(node.type==='CallExpression'&&node.callee?.property?.name==='findLast'
      && /type\s*===?\s*["']usage["']/.test(source.slice(node.arguments[0]?.start,node.arguments[0]?.end)))errors.push('use the native stream reader, not a private usage parser');
    for(const [key,value] of Object.entries(node))if(!['start','end'].includes(key)){
      if(Array.isArray(value))for(const child of value)visit(child,name);else if(value&&typeof value==='object')visit(value,name);
    }
  }
  visit(ast);return [...new Set(errors)];
}
async function inspect(dir) {
  for(const item of await readdir(root+dir,{withFileTypes:true})){
    const file=dir+'/'+item.name;
    if(item.isDirectory()) { if(!/\/(?:native|upstream|skins)$/.test(file))await inspect(file);continue; }
    if(!/\.(?:mjs|jsx)$/.test(file))continue;
    let source=await readFile(root+file,'utf8');
    if(file.endsWith('.jsx'))source=(await transform(source,{loader:'jsx',format:'esm'})).code;
    for(const error of meteringViolations(source,file))failures.push(`${file}: ${error}`);
  }
}
await inspect('src');
const native=JSON.parse(await readFile(root+'src/metering/native/source.json'));
for(const [file,hash] of Object.entries(native.files))if(createHash('sha256').update(await readFile(root+'src/metering/native/'+file)).digest('hex')!==hash)failures.push('upstream metering source changed: '+file);
const workflow=JSON.parse(await readFile(root+'vendor/workflow.json'));
for(const file of ['src/budget.mjs'])if(createHash('sha256').update(await readFile(root+'vendor/workflow/'+file)).digest('hex')!==workflow.files[file])failures.push('Workflow snapshot changed outside its source sync: '+file);
const patch=await readFile(root+'cordis.patch.yml','utf8');
for(const name of ['token-meter','compaction-basic'])if(!patch.includes(`- id: ${name}\n  disabled: true`))failures.push('parallel native metering/compaction owner: '+name);
if(!meteringViolations('const estimatedTokens=Math.ceil(text.length/4);','src/example.mjs').length)failures.push('estimator ownership rule failed its counterexample');
if(!meteringViolations('const total=usage.inputTokens+usage.outputTokens;','src/example.mjs').length)failures.push('receipt ownership rule failed its counterexample');
try { const built=await readFile(root+'lib/host/metering-version.mjs','utf8'); if(!built.includes(String(await meteringVersion())))failures.push('metering build is stale; run node scripts/build-metering.mjs'); } catch(error){if(error.code!=='ENOENT')throw error;}
if(failures.length)throw Error(failures.join('\n'));
console.log('Metering ownership, native source and Workflow synchronization checks passed.');
