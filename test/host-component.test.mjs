import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHostModule} from '../src/host-component.mjs';

test('host factories retain the active Loader dependency identity even when ordinary Node resolution is unavailable',async()=>{
 const identity=Symbol('active-host-capability'),imports=[];
 const tree={ctx:{baseUrl:'file:///stale-profile/node_modules/'},import:async name=>{imports.push(name);assert.equal(name,'@deepseek-ai/dsh-scope');return {identity};}};
 const ctx={loader:{entries:()=>[{options:{name:'@deepseek-ai/dsh-tools'},parent:{tree}}]}};
 const result=await loadHostModule(ctx,'tools',require=>({identity:require('@deepseek-ai/dsh-scope').identity,fs:require('node:fs').readFile}),['@deepseek-ai/dsh-scope','node:fs']);
 assert.equal(result.identity,identity);
 assert.equal(typeof result.fs,'function');
 assert.deepEqual(imports,['@deepseek-ai/dsh-scope']);
});
