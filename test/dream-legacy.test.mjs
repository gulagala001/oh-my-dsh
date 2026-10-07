import test from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { loadMigrationSupport } from '../lib/host/session-migration.mjs';
import { createHistoricalRestore, migrateSessionStorage } from '../src/session-migration.mjs';
import { DreamStore } from '../src/dream/store.mjs';
import { DreamService } from '../src/dream/service.mjs';
import { createEffortResolver } from '../src/effort.mjs';
import { actualUser, hash, sourceHash } from '../src/context/core.mjs';
import { legacyPluginSourceMigration } from '../src/session-legacy-sources.mjs';

const requireHost = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const tree = { import: specifier => import(pathToFileURL(requireHost.resolve(specifier)).href) };
const loader = { entries: () => [{ options: { name: '@deepseek-ai/dsh-session-persistence-jsonl' }, parent: { tree } }] };
const support = await loadMigrationSupport({ loader });
const { default: Persistence } = await tree.import('@deepseek-ai/dsh-session-persistence-jsonl');
const requireCatalog = createRequire(requireHost.resolve('@deepseek-ai/dsh-session-format-catalog/package.json'));
const { releasedV2SessionFormatCodec } = await import(pathToFileURL(requireCatalog.resolve('@deepseek-ai/dsh-session-format-v2-to-v3')).href);
const sources = [{ kind: 'dream-command' }, { kind: 'instruction-hint', form: 'hint' }, { kind: 'agent-teams-command', goal: '保留准确来源', profile: 'review' }];

function legacyEvents(sourceList = sources) {
  return [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'user/message', surfaceOp: 'append', data: { id: 'human', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '真实用户原话；引用 {"source":{"kind":"instruction-hint","seq":2}} 不应被改写。' }] } },
    ...sourceList.map((source, i) => ({ type: 'user/message', surfaceOp: 'append', sourceEventSeqs: [2], data: { id: 'control-' + i, role: 'user', source, content: [{ type: 'text', text: 'PLUGIN_CONTROL_' + i }] } })),
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ].map((event, seq) => ({ ...event, seq, time: 101 + seq }));
}

async function writeLegacy(root, id, version, compression, sourceList = sources, { preset = 'foreign-preset', cwd = '/fixture', mutate } = {}) {
  const header = { id, version, isSeeded: false, delegationDepth: 0, createdAt: 100, cwd, agentPreset: preset };
  const events = legacyEvents(sourceList), dir = support.sessionDir(root, cwd, id);
  mutate?.(events);
  await mkdir(dir, { recursive: true });
  const physical = version < 2 ? { type: 'session', ...header } : releasedV2SessionFormatCodec.encodeHeader(header, 0);
  if (version < 2) delete physical.isSeeded;
  const lines = [physical, ...events.map(event => version < 2 ? event : releasedV2SessionFormatCodec.encodeEvent(event))].map(row => JSON.stringify(row) + '\n');
  let bytes = Buffer.from(lines.join(''));
  if (compression === 'zstd') {
    const { zstdCompressSync } = await import('node:zlib');
    bytes = Buffer.concat([zstdCompressSync(Buffer.from(lines[0])), zstdCompressSync(Buffer.from(lines.slice(1).join('')))]);
  }
  const path = join(dir, support.generationLogFilename(version, compression));
  await writeFile(path, bytes);
  return { header, events, dir, path, bytes };
}

for (const version of [0, 2]) for (const compression of ['none', 'zstd']) test(`native V${version} plugin sources migrate and participate in Dream (${compression})`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-dream-legacy-')), logs = join(root, 'logs'), data = join(root, 'omd');
  const ctx = new Context(); let service;
  t.after(async () => { await service?.close(); await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); });
  const good = await writeLegacy(logs, 'compatible', version, compression);
  const bad = await writeLegacy(logs, 'unsupported', version, compression, [{ kind: 'unclassified-future-source' }]);
  const corrupt = await writeLegacy(logs, 'corrupt-owned', version, compression, sources, { preset: 'trisoul-x', mutate: events => { events[4].seq = 3; } });
  const sidecar = join(data, 'sessions', corrupt.header.id + '.json'), sidecarBytes = JSON.stringify({ id: corrupt.header.id, memoryScope: 'project', original: 'unchanged owned state' });
  await mkdir(join(data, 'sessions'), { recursive: true });await writeFile(sidecar, sidecarBytes);
  const ordinary = version === 2 ? await writeLegacy(logs, 'ordinary', version, compression, []) : null;
  await ctx.plugin(Persistence, { root: logs, compression });
  await assert.rejects(ctx.sessionPersistence.open('compatible', 'read'), { name: 'SessionFormatUnsupportedError' });
  const warnings = [], migrationContext = { get: () => ctx.sessionPersistence, loader, logger: { info() {}, warn(_message, id, error) { warnings.push({ id, error }); } } };
  await migrateSessionStorage(migrationContext, data, support);
  assert(!warnings.some(warning => warning.id === 'compatible'), JSON.stringify(warnings));
  assert.deepEqual(await readFile(good.path), good.bytes, 'the predecessor archive is immutable');
  assert.deepEqual(await readFile(bad.path), bad.bytes);
  assert(warnings.some(warning => warning.id === 'unsupported'));
  assert(warnings.some(warning => warning.id === 'corrupt-owned' && /seq gap|must be dense|contiguous/.test(warning.error)), JSON.stringify(warnings));
  assert.equal(await readFile(sidecar, 'utf8'), sidecarBytes);assert.deepEqual(await readFile(corrupt.path), corrupt.bytes);
  assert(!(await readdir(bad.dir)).some(name => name.startsWith('session.v4.')));
  if (ordinary) assert(!(await readdir(ordinary.dir)).some(name => name.startsWith('session.v4.')), 'ordinary foreign V2 logs remain on the host migration path');
  const handle = await ctx.sessionPersistence.open('compatible', 'read');
  let restored;
  try { restored = await handle.read(); assert.equal(handle.header.version, 4); } finally { await handle.close(); }
  const human = restored.events.find(event => event.type === 'user/message' && event.data.id === 'human');
  assert.deepEqual(human.data.content, good.events[2].data.content);
  for (const [i, source] of sources.entries()) {
    const control = restored.events.find(event => event.type === 'user/message' && event.data.id === 'control-' + i);
    assert.deepEqual(control.data.source, source);assert.equal(actualUser(control), false);
    assert.deepEqual(control.sourceEventSeqs, [human.seq], 'event references follow native sequence remapping');
  }
  const calls = [], hub = { ctx: { sessionPersistence: ctx.sessionPersistence, agents: new Map(), sessions: new Map() }, store: { dir: data, peek: () => null }, context: { store: { peek: () => null }, adapter: { message: text => ({ role: 'user', content: [{ type: 'text', text }] }) } }, config: () => ({ memoryScope: 'project', dreamProvider: 'fixture', dreamModel: 'fixture', dreamDailyTokens: 200000, dreamDeepAgeMs: 0, backgroundMaxRetries: 0 }) };
  hub.efforts = createEffortResolver(hub.ctx);
  const store = new DreamStore(data);
  service = hub.dream = new DreamService(hub, { store, generate: async input => {
    calls.push(input);
    return { value: { summary: '保留真实用户原话。', references: input.sources.map(source => source.id) }, usage: { inputTokens: 100, outputTokens: 50 } };
  } });
  const job = await service.enqueue('global', 'global'); await service.draining;
  assert.equal(store.job(job.id).state, 'complete', store.job(job.id).error);
  assert.equal(store.session('compatible').available, true);assert.equal(store.session('compatible').shared, true);
  assert.equal(store.session('unsupported').available, false);assert.equal(service.status().indexError, null);
  assert.deepEqual(service.status().indexWarnings.map(warning => warning.sessionId).sort(), ['corrupt-owned', 'unsupported']);
  assert(store.memory('session:compatible'));assert(store.memory('global'));
  assert(!JSON.stringify(calls).includes('PLUGIN_CONTROL_'), 'plugin controls are not distilled as user decisions');
  const inputSource = calls.find(input => input.kind === 'session' && input.target === 'compatible').sources[0];
  const ref = store.source(inputSource.id);
  assert.equal(await service.sources.sourceText(ref), human.data.content[0].text);
  await migrateSessionStorage(migrationContext, data, support);
  assert.deepEqual(await readFile(good.path), good.bytes);assert.deepEqual(await readFile(bad.path), bad.bytes);
});

test('historical compatibility refuses unknown kinds, unexpected fields, wrong types and malformed content', () => {
  for (const source of [{ kind: 'unknown-plugin' }, { kind: 'dream-command', seq: 2 }, JSON.parse('{"kind":"dream-command","__proto__":{}}'), { kind: 'instruction-hint', form: 'replace' }, { kind: 'instruction-hint', targetSeq: 2 }, { kind: 'agent-teams-command', goal: 12 }, { kind: 'agent-teams-command', profile: { seq: 2 } }]) {
    const header = releasedV2SessionFormatCodec.encodeHeader({ id: 'refusal', version: 2, isSeeded: false, delegationDepth: 0, createdAt: 100 }, 0);
    const restore = createHistoricalRestore(support, header);
    assert.throws(() => { for (const event of legacyEvents([source])) restore.decodeRow(releasedV2SessionFormatCodec.encodeEvent(event)); restore.finish(); }, /unclassified message source/);
  }
  const header = releasedV2SessionFormatCodec.encodeHeader({ id: 'malformed', version: 2, isSeeded: false, delegationDepth: 0, createdAt: 100 }, 0);
  const restore = createHistoricalRestore(support, header), events = legacyEvents();
  events[3].data.content = [{ type: 'unclassified-content', text: 'do not silently accept' }];
  assert.throws(() => { for (const event of events) restore.decodeRow(releasedV2SessionFormatCodec.encodeEvent(event)); restore.finish(); }, /unclassified message content/);
});

test('source adaptation preserves distinct repeated message IDs and opaque content without tag collisions', () => {
  const input = { type: 'session/title-llm-request', data: { messages: [
    { id: 'repeated', source: { kind: 'agent-teams-command', goal: 'first' }, content: [{ type: 'text', text: 'exact' }] },
    { id: 'repeated', source: { kind: 'agent-teams-command', goal: 'second' }, content: [{ type: 'file', attachment: { kind: 'dream-command' } }] },
    { id: 'repeated', source: { kind: 'plugin', plugin: 'omd:legacy-source:0' }, content: [] },
  ] } }, before = structuredClone(input), outputs = [];
  const native = { createStage: () => ({ headerInheritedEventCount: 7, transformEvent: (event, context) => context.emitEvent(structuredClone(event)), finish: () => 9 }) };
  const stage = legacyPluginSourceMigration(native).createStage({});
  stage.transformEvent(input, { emitEvent: event => outputs.push(event) });
  assert.deepEqual(outputs, [before]);assert.deepEqual(input, before);
  assert.equal(stage.headerInheritedEventCount, 7);assert.equal(stage.finish({}), 9);
});

test('a preexisting migration journal remains strict when its owned source is unreadable', async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-legacy-journal-'));t.after(() => rm(root, { recursive: true, force: true }));
  const source = await writeLegacy(join(root, 'logs'), 'unfinished', 2, 'none', [{ kind: 'unknown-source' }], { preset: 'trisoul-x' });
  const journal = JSON.stringify({ version: 1, id: 'unfinished', complete: false });
  await writeFile(join(source.dir, 'omd-v4-migration.json'), journal);
  const ctx = { get: () => ({ config: { root: join(root, 'logs'), compression: 'none' } }), logger: { info() {}, warn() { assert.fail('an interrupted migration must not be downgraded to a warning'); } } };
  await assert.rejects(migrateSessionStorage(ctx, join(root, 'omd'), support), { name: 'SessionFormatUnsupportedMigrationError' });
  assert.deepEqual(await readFile(source.path), source.bytes);assert.equal(await readFile(join(source.dir, 'omd-v4-migration.json'), 'utf8'), journal);
});

for (const version of [0, 1, 2]) test(`V${version} owned context references include every native coordinate shift before V4 publication`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-legacy-owned-'));t.after(() => rm(root, { recursive: true, force: true }));
  const source = await writeLegacy(join(root, 'logs'), 'owned', version, 'none', sources, { preset: 'trisoul-x' });
  const data = join(root, 'omd'), path = join(data, 'context-v1', 'sessions', hash('owned') + '.json');
  await mkdir(join(data, 'context-v1', 'sessions'), { recursive: true });
  const before = { schema: 1, id: 'owned', records: [{ id: 'r', sessionId: 'owned', mode: 'raw', sourceSeqs: [2, 3], originalSeqs: [2, 3], sourceHash: 'before', summary: '准确原话', documents: [], ranges: [{ sessionId: 'owned', from: 2, to: 3 }], userOriginals: [{ sessionId: 'owned', seq: 2, content: source.events[2].data.content }], decisions: [{ seq: 2, text: '保留原话', quote: '真实用户原话' }] }], transaction: null, pending: null, review: {} };
  await writeFile(path, JSON.stringify(before));
  const ctx = { get: () => ({ config: { root: join(root, 'logs'), compression: 'none' } }), logger: { info() {}, warn(_message, _id, error) { assert.fail('owned compatible data must migrate: ' + error); } } };
  await migrateSessionStorage(ctx, data, support);
  const decoded = await support.readDecodedJsonlSource(join(source.dir, 'session.v4.jsonl'), 4, 'none', { createRestore: header => support.sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' }) });
  const human = decoded.artifact.events.find(event => event.type === 'user/message' && event.data.id === 'human'), control = decoded.artifact.events.find(event => event.type === 'user/message' && event.data.id === 'control-0');
  const after = JSON.parse(await readFile(path, 'utf8')), record = after.records[0];
  assert.notEqual(human.seq, 2, 'the native system head shifts the original V2 coordinates');
  assert.deepEqual(record.sourceSeqs, [human.seq, control.seq]);assert.deepEqual(record.originalSeqs, record.sourceSeqs);
  assert.equal(record.userOriginals[0].seq, human.seq);assert.equal(record.decisions[0].seq, human.seq);
  assert.equal(record.ranges[0].from, human.seq);assert.equal(record.ranges[0].to, control.seq);
  assert.deepEqual(record.userOriginals[0].content, before.records[0].userOriginals[0].content);
  assert.equal(record.sourceHash, sourceHash({ eventAt: seq => decoded.artifact.events[seq] }, record.sourceSeqs));
  assert.deepEqual(await readFile(source.path), source.bytes);
  const journal = JSON.parse(await readFile(join(source.dir, 'omd-v4-migration.json'), 'utf8'));
  assert.deepEqual(journal.updates[0].before, before);assert.equal(journal.mapping[2], human.seq);
});

for (const version of [0, 1]) test(`V${version} chunk coalescing preserves original sidecar references to the final assistant message`, async t => {
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-chunks-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=await writeLegacy(join(root,'logs'),'chunks',version,'none',sources,{preset:'trisoul-x',mutate:events=>{
    events.splice(6,0,
      {type:'assistant/chunk',data:{turn:1,step:1,chunk:{type:'block-end',index:0,block:{type:'text',text:'准确的历史回复'}}}},
      {type:'assistant/chunk',data:{turn:1,step:1,chunk:{type:'finish',reason:{kind:'max-tokens'}}}},
      {type:'assistant/message',surfaceOp:'append',sourceEventSeqs:[6,7],data:{turn:1,step:1,message:{id:'answer',role:'assistant',source:{kind:'model',provider:'fixture',model:'fixture'},content:[{type:'text',text:'准确的历史回复'}]}}});
    events.forEach((event,seq)=>{event.seq=seq;event.time=101+seq;});
  }});
  const data=join(root,'omd'),path=join(data,'context-v1','sessions',hash('chunks')+'.json');await mkdir(join(data,'context-v1','sessions'),{recursive:true});
  const before={schema:1,id:'chunks',records:[{id:'r',sessionId:'chunks',sourceSeqs:[2,8],originalSeqs:[2,8],sourceHash:'before',summary:'准确的历史回复',documents:[]}],transaction:null,pending:null,review:{}};
  await writeFile(path,JSON.stringify(before));
  const ctx={get:()=>({config:{root:join(root,'logs'),compression:'none'}}),logger:{info(){},warn(_message,_id,error){assert.fail(error);}}};
  await migrateSessionStorage(ctx,data,support);
  const decoded=await support.readDecodedJsonlSource(join(source.dir,'session.v4.jsonl'),4,'none',{createRestore:header=>support.sessionFormatCatalog.createRestore(header,{recovery:'strict',validation:'current'})});
  const human=decoded.artifact.events.find(event=>event.type==='user/message'&&event.data.id==='human'),answer=decoded.artifact.events.find(event=>event.type==='assistant/message'&&event.data.message.id==='answer');
  const after=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(after.records[0].sourceSeqs,[human.seq,answer.seq]);
  assert.deepEqual(answer.data.message.content,source.events[8].data.message.content);assert.deepEqual(await readFile(source.path),source.bytes);
});

test('a host without the pinned V1 coordinate map refuses publication and preserves owned state',async t=>{
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-map-guard-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const compatibleTree={import:async specifier=>{
    const module=await tree.import(specifier);if(specifier!=='@deepseek-ai/dsh-session-format-v1-to-v2')return module;
    const migration=module.sessionFormatV1ToV2;
    return {...module,sessionFormatV1ToV2:{...migration,createStage(input){
      const stage=migration.createStage(input);return {get headerInheritedEventCount(){return stage.headerInheritedEventCount;},transformEvent:(...args)=>stage.transformEvent(...args),transformRun:(...args)=>stage.transformRun(...args),finish:(...args)=>stage.finish(...args)};
    }}};
  }};
  const guarded=await loadMigrationSupport({loader:{entries:()=>[{options:{name:'@deepseek-ai/dsh-session-persistence-jsonl'},parent:{tree:compatibleTree}}]}});
  const source=await writeLegacy(join(root,'logs'),'guarded',0,'none',sources,{preset:'trisoul-x'}),warnings=[];
  const ctx={get:()=>({config:{root:join(root,'logs'),compression:'none'}}),logger:{info(){},warn(_message,_id,error){warnings.push(error);}}};
  await migrateSessionStorage(ctx,join(root,'omd'),guarded);assert(warnings.some(error=>/coordinate map is unavailable/.test(error)));
  assert.deepEqual(await readFile(source.path),source.bytes);assert(!(await readdir(source.dir)).some(name=>name.startsWith('session.v4.')));
});

test('V2 trace source headers follow every native coordinate shift and preserve quoted prose', async t => {
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-trace-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=await writeLegacy(join(root,'logs'),'trace',2,'none',sources,{preset:'trisoul-x',mutate:events=>{
    events.splice(6,0,{type:'user/message',surfaceOp:'append',sourceEventSeqs:[2],data:{id:'trace-carrier',role:'user',source:{kind:'plugin',plugin:'trisoul-x:trace'},content:[{type:'text',text:'[Previous analysis · source event 2]\nQuoted source event 2 stays literal.'}]}});
    events.forEach((event,seq)=>{event.seq=seq;event.time=101+seq;});
  }});
  const ctx={get:()=>({config:{root:join(root,'logs'),compression:'none'}}),logger:{info(){},warn(_m,_id,error){assert.fail(error);}}};
  await migrateSessionStorage(ctx,join(root,'omd'),support);
  const read=await support.readDecodedJsonlSource(join(source.dir,'session.v4.jsonl'),4,'none',{createRestore:header=>support.sessionFormatCatalog.createRestore(header,{recovery:'strict',validation:'current'})});
  const human=read.artifact.events.find(e=>e.type==='user/message'&&e.data.id==='human'),trace=read.artifact.events.find(e=>e.type==='user/message'&&e.data.id==='trace-carrier');
  assert.notEqual(human.seq,2);assert.deepEqual(trace.sourceEventSeqs,[human.seq]);
  assert.equal(trace.data.content[0].text,'[Previous analysis · source event '+human.seq+']\nQuoted source event 2 stays literal.');
  assert.deepEqual(human.data.content,source.events[2].data.content);assert.deepEqual(await readFile(source.path),source.bytes);
});

for(const compression of ['none','zstd']) test('an unjournaled malformed header is isolated while healthy migration completes ('+compression+')',async t=>{
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-header-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const logs=join(root,'logs'),dir=join(logs,'--fixture--','bad-header'),bytes=Buffer.from(compression==='none'?'{"version":4,"id":\n':'not a Zstandard frame');
  await mkdir(dir,{recursive:true});const path=join(dir,support.generationLogFilename(4,compression));await writeFile(path,bytes);
  const healthy=await writeLegacy(logs,'healthy',2,compression),warnings=[];
  const ctx={get:()=>({config:{root:logs,compression}}),logger:{info(){},warn(_m,id,error){warnings.push({id,error});}}};
  await migrateSessionStorage(ctx,join(root,'omd'),support);
  assert(warnings.some(w=>w.id==='bad-header'),JSON.stringify(warnings));assert.deepEqual(await readFile(path),bytes);assert.deepEqual(await readFile(healthy.path),healthy.bytes);
  const read=await support.readDecodedJsonlSource(join(healthy.dir,support.generationLogFilename(4,compression)),4,compression,{createRestore:header=>support.sessionFormatCatalog.createRestore(header,{recovery:'strict',validation:'current'})});
  assert.equal(read.artifact.header.id,'healthy');assert.equal(read.artifact.header.version,4);assert(!(await readdir(dir)).includes('omd-v4-migration.json'));
});

test('a malformed header with an unfinished migration journal remains a hard failure', async t=>{
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-header-journal-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const logs=join(root,'logs'),dir=join(logs,'--fixture--','unfinished');await mkdir(dir,{recursive:true});
  const path=join(dir,'session.v4.jsonl'),bytes=Buffer.from('{"version":4,"id":\n'),journalPath=join(dir,'omd-v4-migration.json'),journal=JSON.stringify({version:1,id:'unfinished',target:path,complete:false});
  await writeFile(path,bytes);await writeFile(journalPath,journal);
  const ctx={get:()=>({config:{root:logs,compression:'none'}}),logger:{info(){},warn(){assert.fail('unfinished publication must not become a warning');}}};
  await assert.rejects(migrateSessionStorage(ctx,join(root,'omd'),support));
  assert.deepEqual(await readFile(path),bytes);assert.equal(await readFile(journalPath,'utf8'),journal);
});

test('header filesystem permission errors are not classified as unreadable archive warnings',async t=>{
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-header-io-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=await writeLegacy(join(root,'logs'),'denied',2,'none'),warnings=[],originalOpen=fsPromises.open,denied=Object.assign(Error('fixture header read denied'),{code:'EACCES'});
  const openMock=t.mock.method(fsPromises,'open',(path,...args)=>path===source.path?Promise.reject(denied):originalOpen(path,...args));syncBuiltinESMExports();
  const ctx={get:()=>({config:{root:join(root,'logs'),compression:'none'}}),logger:{info(){},warn(...args){warnings.push(args);}}};
  try{await assert.rejects(migrateSessionStorage(ctx,join(root,'omd'),support),e=>e===denied);}finally{openMock.mock.restore();syncBuiltinESMExports();}
  assert.deepEqual(warnings,[]);assert.deepEqual(await readFile(source.path),source.bytes);assert(!(await readdir(source.dir)).some(n=>n.startsWith('session.v4.')));
});

for(const complete of [true,false])test(`a missing ${complete?'completed':'partially applied'} migration target cannot replay reference rebasing or overwrite its journal`,async t=>{
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-missing-target-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=await writeLegacy(join(root,'logs'),'owned',2,'none',sources,{preset:'trisoul-x'});
  const data=join(root,'omd'),sidecar=join(data,'sessions','owned.json');await mkdir(join(data,'sessions'),{recursive:true});
  await writeFile(sidecar,JSON.stringify({id:'owned',sourceSeqs:[2],content:'原始材料'}));
  const ctx={get:()=>({config:{root:join(root,'logs'),compression:'none'}}),logger:{info(){},warn(_m,_id,error){assert.fail(error);}}};
  await migrateSessionStorage(ctx,data,support);
  const journalPath=join(source.dir,'omd-v4-migration.json'),originalJournal=JSON.parse(await readFile(journalPath,'utf8')),after=await readFile(sidecar),target=join(source.dir,'session.v4.jsonl');
  assert.equal(originalJournal.complete,true);
  if(!complete)await writeFile(journalPath,JSON.stringify({...originalJournal,complete:false}));
  const journal=await readFile(journalPath);await rm(target);
  await assert.rejects(migrateSessionStorage(ctx,data,support),complete?/迁移目标.*不存在/:/迁移关联记录在发布前被修改/);
  assert.deepEqual(await readFile(journalPath),journal);assert.deepEqual(await readFile(sidecar),after);assert.deepEqual(await readFile(source.path),source.bytes);
  assert(!(await readdir(source.dir)).some(n=>n.startsWith('session.v4.')));
});

test('native historical body filesystem errors remain strict after a readable header', async t => {
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-body-io-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const logs=join(root,'logs'),source=await writeLegacy(logs,'foreign-io',2,'none');
  const originalRead=fsPromises.readFile,denied=Object.assign(Error('fixture native body read denied'),{code:'EACCES'});
  let deniedReads=0;
  const readMock=t.mock.method(fsPromises,'readFile',(path,...args)=>{
    if(path===source.path){deniedReads++;return Promise.reject(denied);}
    return originalRead(path,...args);
  });
  syncBuiltinESMExports();
  const warnings=[],ctx={get:()=>({config:{root:logs,compression:'none'}}),logger:{info(){},warn(...args){warnings.push(args);}}};
  try {
    // The host adapter captures filesystem functions at factory creation.
    // Header admission uses open/read; the actual native body read then fails.
    const guarded=await loadMigrationSupport({loader});
    await assert.rejects(migrateSessionStorage(ctx,join(root,'omd'),guarded),error=>error===denied);
  } finally {readMock.mock.restore();syncBuiltinESMExports();}
  assert.equal(deniedReads,1);assert.deepEqual(warnings,[]);assert.deepEqual(await readFile(source.path),source.bytes);
  assert(!(await readdir(source.dir)).some(name=>name.startsWith('session.v4.')));
});

for(const version of [0,1])test(`a pre-publication interruption resumes a V${version} sparse coordinate map without rebasing sidecars twice`,async t=>{
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-sparse-journal-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=await writeLegacy(join(root,'logs'),'chunks',version,'none',sources,{preset:'trisoul-x',mutate:events=>{
    events.splice(6,0,
      {type:'assistant/chunk',data:{turn:1,step:1,chunk:{type:'block-end',index:0,block:{type:'text',text:'准确的历史回复'}}}},
      {type:'assistant/chunk',data:{turn:1,step:1,chunk:{type:'finish',reason:{kind:'max-tokens'}}}},
      {type:'assistant/message',surfaceOp:'append',sourceEventSeqs:[6,7],data:{turn:1,step:1,message:{id:'answer',role:'assistant',source:{kind:'model',provider:'fixture',model:'fixture'},content:[{type:'text',text:'准确的历史回复'}]}}});
    events.forEach((event,seq)=>{event.seq=seq;event.time=101+seq;});
  }});
  const data=join(root,'omd'),sidecar=join(data,'sessions','chunks.json');await mkdir(join(data,'sessions'),{recursive:true});
  const before=JSON.stringify({id:'chunks',sourceSeqs:[2,8],content:'准确的历史回复'});await writeFile(sidecar,before);
  const ctx={get:()=>({config:{root:join(root,'logs'),compression:'none'}}),logger:{info(){},warn(_m,_id,error){assert.fail(error);}}};
  const crash={...support,prepareJsonlMigration:async options=>({...await support.prepareJsonlMigration(options),publish:async()=>{throw Error('fixture before publication interruption');}})};
  await assert.rejects(migrateSessionStorage(ctx,data,crash),/fixture before publication/);
  const journalPath=join(source.dir,'omd-v4-migration.json'),journal=JSON.parse(await readFile(journalPath,'utf8'));
  assert(journal.mapping.includes(null));assert.equal(await readFile(sidecar,'utf8'),before);
  await migrateSessionStorage(ctx,data,support);
  const read=await support.readDecodedJsonlSource(join(source.dir,'session.v4.jsonl'),4,'none',{createRestore:header=>support.sessionFormatCatalog.createRestore(header,{recovery:'strict',validation:'current'})});
  const human=read.artifact.events.find(e=>e.type==='user/message'&&e.data.id==='human'),answer=read.artifact.events.find(e=>e.type==='assistant/message'&&e.data.message.id==='answer');
  assert.deepEqual(JSON.parse(await readFile(sidecar,'utf8')).sourceSeqs,[human.seq,answer.seq]);
  assert.deepEqual(JSON.parse(await readFile(journalPath,'utf8')),{...journal,complete:true});
  const after=await readFile(sidecar);await migrateSessionStorage(ctx,data,support);assert.deepEqual(await readFile(sidecar),after);assert.deepEqual(await readFile(source.path),source.bytes);
});

test('a log in the wrong native directory cannot impersonate a session or rebase its sidecar',async t=>{
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-storage-id-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const logs=join(root,'logs'),data=join(root,'omd'),owned=await writeLegacy(logs,'owned',2,'none',sources,{preset:'trisoul-x'}),bad=await writeLegacy(logs,'badcopy',2,'none',sources,{preset:'trisoul-x'});
  const rows=bad.bytes.toString().trimEnd().split('\n').map(JSON.parse);rows[0].id='owned';
  const badBytes=Buffer.from(rows.map(row=>JSON.stringify(row)+'\n').join(''));await writeFile(bad.path,badBytes);
  const sidecar=join(data,'sessions','owned.json');await mkdir(join(data,'sessions'),{recursive:true});await writeFile(sidecar,JSON.stringify({id:'owned',sourceSeqs:[2],content:'真实用户原话'}));
  const native=new Context();t.after(()=>native.fiber.dispose());await native.plugin(Persistence,{root:logs,compression:'none'});
  await assert.rejects(native.sessionPersistence.list(),/header id.*cwd identify/);
  const warnings=[],ctx={get:()=>({config:{root:logs,compression:'none'}}),logger:{info(){},warn(_m,id,error){warnings.push({id,error});}}};
  await migrateSessionStorage(ctx,data,support);
  assert(warnings.some(w=>w.id==='badcopy'&&/身份/.test(w.error)),JSON.stringify(warnings));
  assert(!(await readdir(bad.dir)).some(n=>n.startsWith('session.v4.')));
  const decoded=await support.readDecodedJsonlSource(join(owned.dir,'session.v4.jsonl'),4,'none',{createRestore:header=>support.sessionFormatCatalog.createRestore(header,{recovery:'strict',validation:'current'})});
  const human=decoded.artifact.events.find(e=>e.type==='user/message'&&e.data.id==='human');
  assert.deepEqual(JSON.parse(await readFile(sidecar,'utf8')).sourceSeqs,[human.seq]);
  assert.deepEqual(await readFile(owned.path),owned.bytes);assert.deepEqual(await readFile(bad.path),badBytes);
});

test('duplicate native session IDs are isolated before any shared sidecar can change',async t=>{
  const root=await mkdtemp(join(tmpdir(),'omd-legacy-duplicate-id-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const logs=join(root,'logs'),data=join(root,'omd');
  const a=await writeLegacy(logs,'duplicate',2,'none',sources,{preset:'trisoul-x',cwd:'/fixture/a'}),b=await writeLegacy(logs,'duplicate',2,'none',sources,{preset:'trisoul-x',cwd:'/fixture/b'});
  const healthy=await writeLegacy(logs,'healthy',2,'none');
  const sidecar=join(data,'sessions','duplicate.json'),before=JSON.stringify({id:'duplicate',sourceSeqs:[2],content:'原样保留'});await mkdir(join(data,'sessions'),{recursive:true});await writeFile(sidecar,before);
  const warnings=[],ctx={get:()=>({config:{root:logs,compression:'none'}}),logger:{info(){},warn(_m,id,error){warnings.push({id,error});}}};
  await migrateSessionStorage(ctx,data,support);
  assert(warnings.some(w=>w.id==='duplicate'&&/重复/.test(w.error)),JSON.stringify(warnings));
  assert.equal(await readFile(sidecar,'utf8'),before);
  for(const source of [a,b]){assert.deepEqual(await readFile(source.path),source.bytes);assert(!(await readdir(source.dir)).some(n=>n.startsWith('session.v4.')));assert(!(await readdir(source.dir)).includes('omd-v4-migration.json'));}
  assert((await readdir(healthy.dir)).includes('session.v4.jsonl'));
});
