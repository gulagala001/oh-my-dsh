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
import { summarizeToolOutcomes, operationState } from '#opencu/src/client/computer-groups.mjs';

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
  const data=Array.from({length:16000},(_,i)=>({root:{callId:String(i),call:{name:i%2?'read':'computer_use'},kind:'tool-result',isError:i%4===0,error:i%8===0?{code:'ABORTED'}:undefined,subCalls:[{callId:'child-'+i,call:{name:'read'},kind:'tool-result',isError:i%3===0}]}}));
  // Duplicate roots and child references exercise first-occurrence callId semantics.
  data.push(...data.slice(0,100));
  data[0].root.subCalls.push(data[1].root.subCalls[0]);
  const referenceSummary=()=>{
    const calls=new Map(), pending=data.map(item=>item.root).reverse();
    while(pending.length){const block=pending.pop();if(!block||calls.has(block.callId))continue;calls.set(block.callId,block);for(let i=(block.subCalls?.length??0)-1;i>=0;i--)pending.push(block.subCalls[i]);}
    const states=[...calls.values()].map(operationState);
    return {failures:states.filter(state=>state==='error').length,stopped:states.filter(state=>state==='stopped').length};
  };
  const currentSummary=()=>summarizeToolOutcomes(data);
  assert.deepEqual(referenceSummary(),currentSummary());
  assert.deepEqual(currentSummary(),{failures:7334,stopped:2000});
  report.workloads.toolOutcomes={rootReferences:data.length,uniqueCalls:32000,reference:'independent iterative preorder traversal; not a historical implementation',referenceMedianMs:measure(referenceSummary),currentMedianMs:measure(currentSummary),outcomes:currentSummary()};
  const writer=new ContextStore(temp);
  for(let i=0;i<100;i++){const state=writer.state('archive-'+i,{scope:'project',project:'/fixture'});state.records=Array.from({length:15},(_,r)=>({id:`${i}-${r}`,documents:[{text:'长会话原始资料'.repeat(200)}]}));writer.save(state);}
  const reader=new ContextStore(temp), paths=readdirSync(join(reader.dir,'sessions')).map(file=>join(reader.dir,'sessions',file));
  const oldRead=()=>paths.map(path=>JSON.parse(readFileSync(path,'utf8'))), newRead=()=>reader.all();assert.deepEqual(oldRead(),newRead());
  report.workloads.archiveRead={archives:paths.length,totalSourceBytes:paths.reduce((n,p)=>n+readFileSync(p).length,0),...comparison(oldRead,newRead),cacheBudgetBytes:reader.maxDiskCacheBytes};
  const baseline=process.argv[2]||'HEAD';
  const before=execFileSync('git',['show',baseline+':lib/client.js'],{cwd:root,maxBuffer:16*1024*1024}),after=readFileSync(join(root,'lib/client.js'));
  report.workloads.clientBundle={baseline,beforeBytes:before.length,afterBytes:after.length,beforeGzipBytes:gzipSync(before).length,afterGzipBytes:gzipSync(after).length};
  console.log(JSON.stringify(report,null,2));
} finally { rmSync(temp,{recursive:true,force:true}); }
