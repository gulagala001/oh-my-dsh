// Synthetic, deterministic workloads; not a claim about model latency or quality.
import { performance } from 'node:perf_hooks';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir, platform, arch, cpus } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { serializePreparationInput } from '../src/context/input-budget.mjs';
import { ContextStore } from '../src/context/store.mjs';
import { processSummaries, operationSummary, operationIcon, operationState } from '#opencu/src/client/computer-groups.mjs';

function measure(run, count = 7) {
  run(); const samples = [];
  for (let i = 0; i < count; i++) { const start = performance.now(); run(); samples.push(performance.now() - start); }
  samples.sort((a,b) => a-b); return Number(samples[Math.floor(count / 2)].toFixed(3));
}
function comparison(before, after) { const a=measure(before), b=measure(after); return { beforeMedianMs:a, afterMedianMs:b, ratio: Number((a/b).toFixed(2)) }; }
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'omd-runtime-benchmark-'));
const report = { kind:'synthetic microbenchmarks', node:process.version, platform:platform(), arch:arch(), cpu:cpus()[0]?.model, trials:7, timing:'warm-run median, lower is better', workloads:{} };
try {
  for (const references of [8,256]) {
    const input={reference:Array.from({length:references},(_,i)=>({seq:i,text:'参考资料😀'.repeat(90)})), segment:[{text:'不可截断原文'.repeat(1600)}]}, budget=JSON.stringify(input).length-JSON.stringify(input.reference).length+2000;
    const old=()=>{const value=structuredClone(input);while(JSON.stringify(value).length>budget&&value.reference.length)value.reference.shift();if(JSON.stringify(value).length>budget)throw Error('budget');return JSON.stringify(value);};
    const next=()=>serializePreparationInput(structuredClone(input),budget);
    assert.equal(old(),next()); report.workloads['preparationLookback'+references]={references,sourceCharacters:input.segment[0].text.length,...comparison(old,next)};
  }
  const nodes=Array.from({length:16000},(_,i)=>({key:String(i),kind:i%4?'tool-call':'context',location:{turn:{turn:i%600}},data:{root:{call:{name:i%2?'read':'computer_use'},kind:'tool-result'}}}));
  const snapshot={order:nodes.map(n=>n.key),nodes:new Map(nodes.map(n=>[n.key,n]))}, turns=[...new Set(nodes.filter(n=>n.kind==='tool-call').map(n=>n.location.turn.turn))];
  const oldSummary=()=>new Map(turns.map(turn=>{const calls=snapshot.order.map(key=>snapshot.nodes.get(key)).filter(n=>n.kind==='tool-call'&&n.location.turn.turn===turn).map(n=>n.data.root),names=calls.map(c=>c.call.name);return[turn,{label:operationSummary(names),icon:operationIcon(names),failures:calls.filter(c=>operationState(c)==='error').length,stopped:calls.filter(c=>operationState(c)==='stopped').length}];}));
  assert.deepEqual(oldSummary(),processSummaries(snapshot)); report.workloads.processSummary={historyNodes:nodes.length,turns:turns.length,...comparison(oldSummary,()=>processSummaries(snapshot))};
  const writer=new ContextStore(temp);
  for(let i=0;i<100;i++){const state=writer.state('archive-'+i,{scope:'project',project:'/fixture'});state.records=Array.from({length:15},(_,r)=>({id:`${i}-${r}`,documents:[{text:'长会话原始资料'.repeat(200)}]}));writer.save(state);}
  const reader=new ContextStore(temp), paths=readdirSync(join(reader.dir,'sessions')).map(file=>join(reader.dir,'sessions',file));
  const oldRead=()=>paths.map(path=>JSON.parse(readFileSync(path,'utf8'))), newRead=()=>reader.all();assert.deepEqual(oldRead(),newRead());
  report.workloads.archiveRead={archives:paths.length,totalSourceBytes:paths.reduce((n,p)=>n+readFileSync(p).length,0),...comparison(oldRead,newRead),cacheBudgetBytes:reader.maxDiskCacheBytes};
  const baseline=process.argv[2]||'b85d43e80426feaa48b3aa05d7f3f228149f1c25';
  const before=execFileSync('git',['show',baseline+':lib/client.js'],{cwd:root,maxBuffer:16*1024*1024}),after=readFileSync(join(root,'lib/client.js'));
  report.workloads.clientBundle={baseline,beforeBytes:before.length,afterBytes:after.length,beforeGzipBytes:gzipSync(before).length,afterGzipBytes:gzipSync(after).length};
  console.log(JSON.stringify(report,null,2));
} finally { rmSync(temp,{recursive:true,force:true}); }
