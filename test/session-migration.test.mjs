import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadMigrationSupport } from '../lib/host/session-migration.mjs';
import { migrateSessionStorage, migrateArtifact, migrateContextState, remapOwned } from '../src/session-migration.mjs';
import { hash, sourceHash } from '../src/context/core.mjs';
const tree = { ctx: { baseUrl: pathToFileURL(dirname(import.meta.resolve('@deepseek-ai/dsh/package.json').replace('file://','')) + '/').href } };
const hostRequire = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
tree.import = specifier => import(pathToFileURL(hostRequire.resolve(specifier)).href);
const loader = { entries: () => [{ options: { name: '@deepseek-ai/dsh-session-persistence-jsonl' }, parent: { tree } }] };
const support = await loadMigrationSupport({ loader });
const header = { id: 'omd-migration-test', version: 3, isSeeded: false, delegationDepth: 0, createdAt: 100, agentPreset: 'trisoul-x', cwd: '/fixture' };
const user = { id: 'user-1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Keep the exact original request.' }] };
const events = [
 { type: 'turn/start', data: { turn: 1 } },
 { type: 'system/message', data: { turn: 1, step: 1, message: { id: 'head', role: 'system', source: { kind: 'plugin', plugin: 'trisoul-x:system-slot' }, content: [{ type: 'text', text: 'System instructions' }] } }, surfaceOp: 'append' },
 { type: 'step/start', data: { turn: 1, step: 1 } },
 { type: 'system/message', data: { turn: 1, step: 1, message: { id: 'shadow', role: 'system', source: { kind: 'plugin', plugin: 'trisoul-x:shadow' }, content: [] } }, surfaceOp: 'append' },
 { type: 'step/end', data: { turn: 1, step: 1 } },
 { type: 'agent/inbox/spliced', data: { target: 'next-turn', inserted: [{ ...user, id: 'user-2' }] } },
 { type: 'turn/start', data: { turn: 2 } },
 { type: 'user/message', data: { ...user, id: 'user-2' }, surfaceOp: 'append' },
 { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } },
].map((event, seq) => ({ ...event, seq, time: 101 + seq }));
for (const compression of ['none', 'zstd']) test(`old OMD sessions and context references migrate atomically (${compression})`, async t => {
 const root = await mkdtemp(join(tmpdir(), 'omd-v4-')); t.after(() => rm(root, { recursive: true, force: true }));
 const sessions = join(root, 'logs'), dir = join(sessions, 'project', header.id), data = join(root, 'omd');
 await mkdir(dir, { recursive: true });
 const statePath = join(data, 'context-v1/sessions', hash(header.id) + '.json'); await mkdir(dirname(statePath), { recursive: true });
 const state = { schema: 1, id: header.id, records: [{ id: 'record', sessionId: header.id, mode: 'raw', sourceSeqs: [7], originalSeqs: [1, 7], sourceHash: 'old', summary: 'unchanged', documents: [], userOriginals: [{ sessionId: header.id, seq: 7, content: user.content }] }], transaction: null, pending: { choices: [] }, review: {} };
 await writeFile(statePath, JSON.stringify(state));
 const lines = [support.historicalSessionFormatCatalog.encodeCurrentHeader(header, 0), ...events.map(e => support.historicalSessionFormatCatalog.encodeCurrentEvent(e))].map(x => JSON.stringify(x) + '\n');
 let bytes = Buffer.from(lines.join(''));
 if (compression === 'zstd') { const { zstdCompressSync } = await import('node:zlib'); bytes = Buffer.concat([zstdCompressSync(Buffer.from(lines[0])), zstdCompressSync(Buffer.from(lines.slice(1).join('')))]); }
 const oldPath = join(dir, support.generationLogFilename(3, compression)); await writeFile(oldPath, bytes);
 const ctx = { get: () => ({ config: { root: sessions, compression } }), logger: { info() {} } };
 const lease = await support.SessionWriteLease.acquire(dir, header.id);
 await assert.rejects(migrateSessionStorage(ctx, data, support), /already|owned/i);
 await lease.release();
 await assert.rejects(migrateSessionStorage(ctx, data, {...support, prepareJsonlMigration:async options=>({...await support.prepareJsonlMigration(options),publish:async()=>{throw Error('simulated interruption before publish');}})}), /simulated interruption/);
 assert.deepEqual(JSON.parse(await readFile(statePath,'utf8')),state);
 await migrateSessionStorage(ctx, data, support);
 assert.deepEqual(await readFile(oldPath), bytes, 'the predecessor is immutable');
 const migrated = await support.readDecodedJsonlSource(join(dir, support.generationLogFilename(4, compression)), 4, compression, { createRestore: h => support.sessionFormatCatalog.createRestore(h, { recovery: 'strict', validation: 'current' }) });
 assert.equal(migrated.artifact.events[2].data.message.source.kind, 'system-prompt');
 assert.equal(migrated.artifact.events[3].data.source.kind, 'plugin:trisoul-x:shadow');
 assert.equal(migrated.artifact.events[6].type, 'turn/end', 'native interrupted-turn repair is preserved');
 const next = JSON.parse(await readFile(statePath, 'utf8'));
 assert.deepEqual(next.records[0].sourceSeqs, [8]);
 assert.equal(next.records[0].userOriginals[0].seq, 8);
 assert.deepEqual(next.records[0].userOriginals[0].content, user.content);
 assert.equal(next.records[0].sourceHash, sourceHash({ eventAt: seq => migrated.artifact.events[seq] }, [8]));
 const journalPath = join(dir, 'omd-v4-migration.json'), journal = JSON.parse(await readFile(journalPath, 'utf8'));
 assert.deepEqual(journal.updates[0].before, state);
 // A crash after generation publication but before the sidecar replace resumes.
 await writeFile(statePath, JSON.stringify(state)); await writeFile(journalPath, JSON.stringify({ ...journal, complete: false }));
 await writeFile(statePath, JSON.stringify({...state,externalEdit:true}));
 await assert.rejects(migrateSessionStorage(ctx,data,support),/其他进程修改/);
 await writeFile(statePath, JSON.stringify(state));
 await writeFile(journalPath,JSON.stringify({...journal,complete:false,artifactHash:'different-target'}));
 await assert.rejects(migrateSessionStorage(ctx,data,support),/目标已发生变化/);
 await writeFile(journalPath,JSON.stringify({...journal,complete:false}));
 await migrateSessionStorage(ctx, data, support);
 assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), next);
 await migrateSessionStorage(ctx, data, support);
 assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), next, 'restart does not remap twice');
});


test('migration rebases generated references and pending transactions while preserving user prose, foreign references and attachment identity',()=>{
 const content=[{type:'text',text:'[Context record example · events 1, 7 · view=detail]\nQuoted source event 7 stays literal.'}, {type:'text',text:`Attachment 1: image; source ${header.id}#7. Contents are not inferred from the name.`}];
 const source=[...events.slice(0,-1),{type:'user/message',seq:8,time:109,data:{...user,id:'record',omdBatchId:'batch',source:{kind:'plugin',plugin:'trisoul-x:context-record'},content},surfaceOp:'append'},{...events.at(-1),seq:9}];
 const {artifact,mapping}=migrateArtifact(support,{header,events:source,inheritedEventCount:0},[]);
 assert.equal(artifact.events[9].data.content[0].text,'[Context record example · events 2, 8 · view=detail]\nQuoted source event 7 stays literal.');
 assert.match(artifact.events[9].data.content[1].text,/#8\./);
 assert.deepEqual(artifact.events[8].data.content,user.content);
 const state={id:header.id,records:[],transaction:{records:[],operations:[{kind:'record',seqs:[7],content}],applied:{write:8},userRevision:'old'},pending:{replace:true}};
 const next=migrateContextState(state,mapping,source,artifact);
 assert.deepEqual(next.transaction.operations[0].seqs,[8]);
 assert.deepEqual(next.transaction.operations[0].content,artifact.events[9].data.content);
 assert.deepEqual(next.transaction.applied,{write:9});assert.equal(next.pending,null);
 const value=JSON.parse('{"__proto__":{"seq":7},"sessionId":"another-session","seq":7,"content":{"seq":7}}');
 const mapped=remapOwned(value,mapping,header.id,source);
 assert.equal(Object.hasOwn(mapped,'__proto__'),true);assert.equal(Object.getPrototypeOf(mapped),Object.prototype);
 assert.equal(mapped.seq,7);assert.equal(mapped.content.seq,7);
 assert.throws(()=>migrateArtifact(support,{header,events:source,inheritedEventCount:2},[]),/没有对应/,'never move a boundary across an inherited prefix');
});

test('old multi-range compaction metadata names the actual replaced span in V4',()=>{
 const summary=[{type:'text',text:'Kept summary'}],compactionId='legacy-compact',omdBatchId='omd-batch';
 const source=[...events,
  {type:'compaction/start',data:{compactionId,omdBatchId,turn:null}},
  {type:'compaction/summary',data:{compactionId,omdBatchId,summary,shadowedRange:{start:7,end:7},shadowedSeqs:[3,7],shadowedTokenCount:100,llmStreamCall:false}},
  {type:'user/message',data:{...user,id:'checkpoint',source:{kind:'plugin',plugin:'compact',compactionId},content:summary},surfaceOp:{op:'replace',startSeq:7,endSeq:7},sourceEventSeqs:[9,10,7]},
  {type:'compaction/end',data:{compactionId,omdBatchId,turn:null}},
 ].map((event,seq)=>({...event,seq,time:101+seq}));
 const {artifact}=migrateArtifact(support,{header,events:source,inheritedEventCount:0},[]);
 assert.deepEqual(artifact.events.find(e=>e.type==='compaction/summary').data.shadowedSeqs,[8]);
 const restore=support.sessionFormatCatalog.createRestore(support.sessionFormatCatalog.encodeCurrentHeader(artifact.header,artifact.inheritedEventCount),{recovery:'strict',validation:'current'});
 for(const event of artifact.events)restore.decodeRow(support.sessionFormatCatalog.encodeCurrentEvent(event));
 assert.doesNotThrow(()=>restore.finish());
 assert.deepEqual(source[10].data.shadowedSeqs,[3,7],'the predecessor is not edited');
});

test('stale cache references cannot point to future events; materials survive and transactions stay strict', () => {
 const {artifact,mapping}=migrateArtifact(support,{header,events,inheritedEventCount:0},[]);
 const state={id:header.id,records:[{id:'stale',sessionId:header.id,sourceSeqs:[7,events.length],originalSeqs:[7],summary:'Saved material',documents:[],userOriginals:[{sessionId:header.id,seq:7,content:user.content}]}],traceSlot:{carrierSeq:events.length,sourceSeq:7},transaction:null,pending:{seq:999},review:{}};
 const next=migrateContextState(state,mapping,events,artifact);
 assert.deepEqual(next.records[0].sourceSeqs,[mapping[7],-1]);
 assert.equal(next.traceSlot.carrierSeq,-1);
 assert.equal(next.records[0].summary,state.records[0].summary);
 assert.deepEqual(next.records[0].userOriginals[0].content,user.content);
 assert.equal(next.pending,null);assert.match(next.notices[0].text,/1 个未落盘/);
 assert.equal(state.traceSlot.carrierSeq,events.length);
 assert.throws(()=>migrateContextState({...state,transaction:{operations:[{seqs:[events.length]}]}},mapping,events,artifact),/不存在/);
});

test('legacy reminders precede no system head; compaction keeps its actual turn and command owner', () => {
 const source = [
  {type:'turn/start',data:{turn:1}},
  {type:'user/message',data:{...user,id:'reminder',source:{kind:'plugin',plugin:'trisoul-x:task-reminder'}},surfaceOp:'append'},
  {type:'step/start',data:{turn:1,step:1}},
  {type:'system/message',data:{turn:1,step:1,message:{id:'head',role:'system',source:{kind:'plugin',plugin:'@deepseek-ai/dsh-system-prompt'},content:[]}},surfaceOp:'append'},
  {type:'user/message',data:user,surfaceOp:'append'},
  {type:'step/end',data:{turn:1,step:1}},
  {type:'compaction/start',data:{compactionId:'compact',sourceCommandId:'legacy-command',turn:null}},
  {type:'compaction/summary',data:{compactionId:'compact',sourceCommandId:'legacy-command',summary:[],shadowedRange:{start:4,end:4},shadowedSeqs:[4],shadowedTokenCount:1,llmStreamCall:false}},
  {type:'user/message',data:{...user,id:'checkpoint',source:{kind:'plugin',plugin:'compact',compactionId:'compact'},content:[]},surfaceOp:{op:'replace',startSeq:4,endSeq:4},sourceEventSeqs:[6,7,4]},
  {type:'compaction/end',data:{compactionId:'compact',sourceCommandId:'legacy-command',turn:null}},
  {type:'turn/end',data:{turn:1,reason:{kind:'completed'}}},
 ].map((e,seq)=>({...e,seq,time:seq+100}));
 // The old head repair copied this pair while idle using its original step.
 source.push({type:'system/message',seq:11,time:111,data:structuredClone(source[3].data),surfaceOp:{op:'replace',startSeq:1,endSeq:1},sourceEventSeqs:[1,3]},
  {type:'user/message',seq:12,time:112,data:structuredClone(source[1].data),surfaceOp:{op:'replace',startSeq:3,endSeq:3},sourceEventSeqs:[3,1]});
 const before=structuredClone(source);
 const {artifact,mapping}=migrateArtifact(support,{header,events:source,inheritedEventCount:0},[]);
 assert.equal(artifact.events.find(e=>e.surfaceOp).type,'system/message');
 assert.equal(artifact.events[mapping[6]].data.turn,1);
 assert.equal(artifact.events[mapping[9]].data.turn,1);
 assert.equal(artifact.events[mapping[8]].data.source.sourceCommandId,'legacy-command');
 assert.deepEqual(source,before);
});
