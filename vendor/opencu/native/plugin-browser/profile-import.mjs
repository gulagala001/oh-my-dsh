import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {basename,isAbsolute,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setImmediate as yieldRead} from 'node:timers/promises';
import {PluginManagedProfileImporter} from './import-profile-service.mjs';

const SCOPE='opencu-owned-browser';
const TYPES=Object.freeze({history:true,cookies:false,passwords:false,extensions:false});
const FORMATS=Object.freeze(['chromium-history-sqlite','opencu-history-query-json']);
const WINDOWS_EPOCH_US=11644473600000000n;
const SQLITE_HEADER=Buffer.from('SQLite format 3\0');
const failure=(message,code='PROFILE_IMPORT_INVALID')=>Object.assign(new Error(message),{code});
const hash=value=>createHash('sha256').update(value).digest('hex');
const stamp=info=>[String(info.dev),String(info.ino),String(info.size),String(info.mtimeNs)].join(':');
const inputObject=value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw failure('Import input must be an object');return value;};

// https://github.com/chromium/chromium/tree/152.0.7977.130/components/history/core/browser
// {url,visit}_database.cc defines
// urls(id,url,title,hidden), visits(id,url,visit_time); base/time/time.h defines
// microseconds since 1601. JSON accepts this plugin's actual history.query result.
export class BrowserProfileImporter {
  #options;#selections=new Map();#busy=false;#closed=false;#active=null;#idleWaiters=[];#sourceReads=new Set();#completedImports=new Map();
  constructor({history,chooseSource,runHistoryJob,selectionLifetimeMs=600000}={}) {
    if(!history||typeof history.importVisits!=='function'||typeof chooseSource!=='function')throw failure('Import requires the owned history store and native chooser');
    if(!Number.isSafeInteger(selectionLifetimeMs)||selectionLifetimeMs<=0||selectionLifetimeMs>3600000)throw failure('Invalid selection lifetime');
    this.#options={history,chooseSource,runHistoryJob,selectionLifetimeMs};
  }
  getSignals(){
    return{scope:SCOPE,available:!this.#closed,supportedDataTypes:{...TYPES},formats:[...FORMATS],
      selectionRequired:true,automaticProfileDiscovery:false,requiresClosedSqliteSource:true,
      transactionalHistoryImport:typeof this.#options.runHistoryJob==='function',passwordDecryption:false,cookieDecryption:false};
  }
  #assert(signal){if(this.#closed)throw failure('Profile import is closed','PROFILE_IMPORT_CLOSED');signal?.throwIfAborted();}
  #selection(selectionId){
    if(typeof selectionId!=='string'||!this.#selections.has(selectionId))throw failure('Choose the source with the native file dialog first','PROFILE_IMPORT_SELECTION_REQUIRED');
    const selection=this.#selections.get(selectionId);
    if(Date.now()>selection.expiresAt){this.#revokeSelection(selectionId,new DOMException('Source selection expired','AbortError'));throw failure('The selected source receipt expired','PROFILE_IMPORT_SELECTION_EXPIRED');}
    return selection;
  }
  #revokeSelection(selectionId,reason){
    this.#selections.delete(selectionId);
    if(this.#active?.id===selectionId)this.#active.controller.abort(reason);
    for(const task of this.#sourceReads)if(task.selectionId===selectionId)task.controller.abort(reason);
  }
  async #file(path,signal){
    this.#assert(signal);
    let info=await lstat(path,{bigint:true});
    if(info.isSymbolicLink())throw failure('Select a regular source, not a symbolic link');
    if(info.isDirectory()){path=join(path,'History');info=await lstat(path,{bigint:true});}
    if(!info.isFile()||info.isSymbolicLink()||info.size>536870912n)throw failure('Selected history must be a regular file no larger than 512 MiB');
    const actual=await realpath(path);this.#assert(signal);
    return{path:actual,stamp:stamp(info),bytes:Number(info.size)};
  }
  async #read(selection,{signal,metadataOnly=false}={}){
    const controller=new AbortController(),combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);
    const task={selectionId:selection.id,controller,promise:null};
    this.#sourceReads.add(task);
    try{
      task.promise=this.#readSource(selection,{signal:combined,metadataOnly});
      return await task.promise;
    }catch(error){
      if(this.#selections.get(selection.id)===selection)this.#revokeSelection(selection.id,error);
      throw error;
    }finally{this.#sourceReads.delete(task);}
  }
  async #readSource(selection,{signal,metadataOnly=false}={}){
    this.#assert(signal);
    const current=await this.#file(selection.path,signal);
    if(current.path!==selection.path||current.stamp!==selection.stamp)throw failure('The selected source changed; select it again','PROFILE_IMPORT_SOURCE_CHANGED');
    const handle=await open(selection.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    let database;
    try{
      const info=await handle.stat({bigint:true});if(stamp(info)!==selection.stamp)throw failure('Selected source was replaced','PROFILE_IMPORT_SOURCE_CHANGED');
      const header=Buffer.alloc(16);await handle.read(header,0,16,0);this.#assert(signal);
      let source,records=[],visitCount,historyResolution,sourceFingerprint;
      if(header.equals(SQLITE_HEADER)){
        // A closed/exported SQLite file is read without touching any live profile WAL.
        const wal=await lstat(selection.path+'-wal',{bigint:true}).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
        if(wal&&wal.size>0n)throw failure('Close the source browser or choose an exported database without a live WAL','PROFILE_IMPORT_SOURCE_BUSY');
        database=new DatabaseSync(selection.path,{readOnly:true,allowExtension:false,timeout:1000});
        database.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; BEGIN');
        const tables=database.prepare("SELECT name,type FROM sqlite_schema WHERE name IN ('urls','visits')").all();
        if(tables.length!==2||tables.some(table=>table.type!=='table'))throw failure('Selected SQLite file is not a Chromium history database','PROFILE_IMPORT_SOURCE_UNSUPPORTED');
        const urls=new Set(database.prepare("PRAGMA table_info('urls')").all().map(column=>column.name));
        const visits=new Set(database.prepare("PRAGMA table_info('visits')").all().map(column=>column.name));
        if(['id','url','title','hidden'].some(key=>!urls.has(key))||['id','url','visit_time'].some(key=>!visits.has(key)))throw failure('Chromium history schema is unsupported','PROFILE_IMPORT_SOURCE_UNSUPPORTED');
        source='chromium-history-sqlite';historyResolution='individual-visits';
        visitCount=Number(database.prepare('SELECT COUNT(*) AS count FROM visits').get().count);
        if(visitCount>500000)throw failure('The selected database exceeds the complete 500000-visit import limit','HISTORY_IMPORT_TOO_LARGE');
        sourceFingerprint=hash(JSON.stringify([source,selection.path,selection.stamp]));
        if(!metadataOnly){
          const sourceTable=database.prepare("SELECT name,type FROM sqlite_schema WHERE name='visit_source'").get();
          const sourceColumns=sourceTable?.type==='table'?new Set(database.prepare("PRAGMA table_info('visit_source')").all().map(column=>column.name)):null;
          if(sourceTable&&(!sourceColumns?.has('id')||!sourceColumns.has('source')))throw failure('Chromium history visit-source schema is unsupported','PROFILE_IMPORT_SOURCE_UNSUPPORTED');
          const nativeColumns={from_visit:'referringVisitId',opener_visit:'openerVisitId',transition:'transition',
            visit_duration:'visitDuration',incremented_omnibox_typed_score:'incrementedOmniboxTypedScore'};
          const columns=Object.entries(nativeColumns).filter(([column])=>visits.has(column));
          const sql='SELECT v.id AS source_id,v.url AS source_url_id,v.visit_time,u.url,u.title,u.hidden'+
            columns.map(([column,key])=>`,v.${column} AS ${key}`).join('')+
            (sourceColumns?',COALESCE(s.source,1) AS visitSource':'')+
            ' FROM visits v LEFT JOIN urls u ON u.id=v.url'+(sourceColumns?' LEFT JOIN visit_source s ON s.id=v.id':'')+' ORDER BY v.id';
          const statement=database.prepare(sql);statement.setReadBigInts(true);
          let count=0;
          for(const row of statement.iterate()){
            this.#assert(signal);
            if(typeof row.visit_time!=='bigint'||row.visit_time<=0n||typeof row.url!=='string'||typeof row.title!=='string'||![0n,1n].includes(row.hidden))throw failure('Chromium history contains an invalid visit','PROFILE_IMPORT_SOURCE_INVALID');
            const visitedAt=Number(row.visit_time-WINDOWS_EPOCH_US)/1000;
            if(!Number.isFinite(visitedAt)||Math.abs(visitedAt)>8640000000000000)throw failure('Chromium visit time is outside the supported range');
            const record={sourceVisitId:String(row.source_id),sourceUrlId:String(row.source_url_id),url:row.url,title:row.title,visitedAt,hidden:row.hidden===1n};
            for(const[,key]of columns){
              const value=row[key];if(value===null)continue;
              if(typeof value!=='bigint')throw failure('Chromium history native metadata is invalid','PROFILE_IMPORT_SOURCE_INVALID');
              if(key==='referringVisitId'||key==='openerVisitId')record[key]=String(value);
              else if(key==='incrementedOmniboxTypedScore'){
                if(value!==0n&&value!==1n)throw failure('Chromium typed-score metadata is invalid','PROFILE_IMPORT_SOURCE_INVALID');
                record[key]=value===1n;
              }else record[key]=key==='visitDuration'?Number(value)/1000:Number(value);
            }
            if(sourceColumns){
              if(typeof row.visitSource!=='bigint'||row.visitSource<0n||row.visitSource>7n)throw failure('Chromium native visit source is invalid','PROFILE_IMPORT_SOURCE_INVALID');
              record.visitSource=Number(row.visitSource);
            }
            records.push(record);
            if(++count%256===0)await yieldRead(undefined,{signal});
          }
          if(count!==visitCount)throw failure('Chromium history source did not produce its complete visit set','PROFILE_IMPORT_SOURCE_INVALID');
        }
      }else{
        if(selection.bytes>67108864)throw failure('Selected JSON export exceeds 64 MiB','HISTORY_IMPORT_TOO_LARGE');
        const data=await handle.readFile('utf8');this.#assert(signal);
        let result;try{result=JSON.parse(data);}catch{throw failure('Selected file is not structured history JSON','PROFILE_IMPORT_SOURCE_UNSUPPORTED');}
        const legacyExport=typeof result?.revision==='string'&&['navigation-snapshot','incomplete'].includes(result.actorClassification)&&result.nextCursor===null&&result.hasMore!==true&&result.complete!==false;
        const pluginExport=result?.source==='opencu-history'&&typeof result.revision==='string'&&result.nextCursor===null&&
          result.complete===true&&result.hasMore===false&&['navigation-snapshot','incomplete','unavailable'].includes(result.actorClassification);
        const nativeExport=result?.source==='chromium-history'&&result.actorClassification==='native-navigation-snapshot'&&
          result.revision===null&&result.nextCursor===null&&result.complete===true&&result.hasMore===false;
        if(!result||Array.isArray(result)||!Array.isArray(result.entries)||!legacyExport&&!pluginExport&&!nativeExport)
          throw failure('JSON must be a complete owned history.query result; arbitrary arrays and paginated results are unsupported','PROFILE_IMPORT_SOURCE_UNSUPPORTED');
        source='opencu-history-query-json';historyResolution='selected-visits-only';visitCount=result.entries.length;sourceFingerprint=hash(data);
        if(visitCount>500000)throw failure('The selected export exceeds the complete import limit','HISTORY_IMPORT_TOO_LARGE');
        if(!metadataOnly)for(let index=0;index<result.entries.length;index++){
          const row=result.entries[index];
          if(!row||typeof row.id!=='string'||typeof row.url!=='string'||typeof row.title!=='string'||!Number.isFinite(row.selectedVisitTime))throw failure('Owned history JSON contains an invalid visit','PROFILE_IMPORT_SOURCE_INVALID');
          const record={sourceVisitId:nativeExport&&typeof row.sourceVisitId==='string'&&row.sourceVisitId?row.sourceVisitId:row.id+':'+row.selectedVisitTime,
            ...(nativeExport?{sourceUrlId:row.id}:{}),url:row.url,title:row.title,visitedAt:row.selectedVisitTime,hidden:false};
          if(nativeExport)for(const key of ['sourceUrlId','referringVisitId','openerVisitId','transition','visitDuration','incrementedOmniboxTypedScore','visitSource'])
            if(Object.hasOwn(row,key))record[key]=row[key];
          records.push(record);
          if(index%256===255)await yieldRead(undefined,{signal});
        }
      }
      this.#assert(signal);
      if(stamp(await handle.stat({bigint:true}))!==selection.stamp||(await this.#file(selection.path,signal)).stamp!==selection.stamp)throw failure('History source changed while being read','PROFILE_IMPORT_SOURCE_CHANGED');
      return{source,records,sourceFingerprint,dryMetadata:{visitCount,historyResolution,bytes:selection.bytes,sourceReadOnly:true}};
    }finally{try{if(database){try{database.exec('ROLLBACK');}finally{database.close();}}}finally{await handle.close();}}
  }
  #public(selection){return{id:selection.id,scope:SCOPE,source:selection.source,displayName:basename(selection.path),selectedPath:selection.path,
    receiptId:selection.receiptId,expiresAt:selection.expiresAt,supportedDataTypes:{...TYPES},dryMetadata:{...selection.dryMetadata}};}
  async chooseSource(input={}, {trustedUserAction=false,signal}={}){
    this.#assert(signal);
    inputObject(input);
    if(Object.keys(input).some(key=>key!=='kind')||!['file','directory'].includes(input.kind))throw failure('Choose explicitly between a history file and a profile directory');
    if(!trustedUserAction)throw failure('Source selection requires an explicit native user action','PROFILE_IMPORT_USER_ACTION_REQUIRED');
    if(this.#busy)throw failure('Another history import is running','PROFILE_IMPORT_BUSY');
    const chosen=await this.#options.chooseSource({signal,kind:input.kind});this.#assert(signal);
    if(chosen?.canceled)return{scope:SCOPE,canceled:true,selection:null};
    if(this.#busy)throw failure('Another history import started while choosing the source','PROFILE_IMPORT_BUSY');
    if(!Array.isArray(chosen?.filePaths)||chosen.filePaths.length!==1||!isAbsolute(chosen.filePaths[0]))throw failure('Native source selection did not return one absolute path');
    const file=await this.#file(chosen.filePaths[0],signal),selection={...file,id:randomUUID(),receiptId:randomUUID(),expiresAt:Date.now()+this.#options.selectionLifetimeMs};
    const detected=await this.#read(selection,{signal,metadataOnly:true});Object.assign(selection,{source:detected.source,dryMetadata:detected.dryMetadata});
    this.#assert(signal);if(this.#busy)throw failure('Another import started before the source selection completed','PROFILE_IMPORT_BUSY');
    for(const id of this.#selections.keys())this.#revokeSelection(id,new DOMException('A new history source was selected','AbortError'));
    this.#selections.set(selection.id,selection);
    return{scope:SCOPE,canceled:false,selection:this.#public(selection)};
  }
  async list(input={}, {signal}={}){
    this.#assert(signal);inputObject(input);
    if(Object.keys(input).some(key=>key!=='selectionId'))throw failure('List accepts only a native source selection ID');
    if(input.selectionId===undefined)return{scope:SCOPE,profiles:[],supportedDataTypes:{...TYPES},selectionRequired:true};
    const selection=this.#selection(input.selectionId),detected=await this.#read(selection,{signal,metadataOnly:true});
    this.#selection(selection.id);
    if(detected.source!==selection.source)throw failure('Selected source format changed','PROFILE_IMPORT_SOURCE_CHANGED');
    return{scope:SCOPE,profiles:[this.#public({...selection,dryMetadata:detected.dryMetadata})],supportedDataTypes:{...TYPES}};
  }
  async import(input,{trustedUserAction=false,signal}={}){
    this.#assert(signal);inputObject(input);
    if(!trustedUserAction)throw failure('History import requires an explicit user action','PROFILE_IMPORT_USER_ACTION_REQUIRED');
    if(Object.keys(input).some(key=>!['selectionId','importHistory','importCookies','importPasswords','importExtensions','dryRun'].includes(key))
      ||input.importHistory!==true||['importCookies','importPasswords','importExtensions'].some(key=>input[key]!==undefined&&input[key]!==false)
      ||input.dryRun!==undefined&&typeof input.dryRun!=='boolean')throw failure('This importer supports only explicitly selected history','PROFILE_IMPORT_DATA_TYPE_UNSUPPORTED');
    if(this.#busy)throw failure('Another history import is running','PROFILE_IMPORT_BUSY');
    const controller=new AbortController();signal=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);
    let finishActive;
    const active={id:input.selectionId,controller,writeStarted:false,terminal:null,done:new Promise(resolve=>{finishActive=resolve;})};
    this.#busy=true;this.#active=active;
    try{
      const selection=this.#selection(input.selectionId),result=await this.#read(selection,{signal,metadataOnly:input.dryRun===true});
      if(input.dryRun===true)return{scope:SCOPE,status:'inspected',source:result.source,receiptId:selection.receiptId,dryMetadata:result.dryMetadata,supportedDataTypes:{...TYPES}};
      if(typeof this.#options.runHistoryJob!=='function')throw failure('The importer is not connected to the owned history write queue','PROFILE_IMPORT_WRITE_QUEUE_REQUIRED');
      const receipt={id:selection.receiptId,sourceFingerprint:result.sourceFingerprint,selectedByUser:true};
      const imported=await this.#options.runHistoryJob(async()=>{
        this.#assert(signal);this.#selection(selection.id);
        if((await this.#file(selection.path,signal)).stamp!==selection.stamp)throw failure('Source changed while waiting for the import queue','PROFILE_IMPORT_SOURCE_CHANGED');
        active.writeStarted=true;
        return this.#options.history.importVisits(result.records,{source:result.source,receipt,signal});
      });
      this.#selections.delete(selection.id);
      let status=imported.status;
      if(status===undefined&&imported.accepted===true&&typeof imported.committed==='boolean'){
        status=imported.canceled===true?'canceled':!imported.committed?'failed':
          imported.failed>0?(imported.imported>0?'partial-success':'failed'):'completed';
      }
      active.terminal={...imported,scope:SCOPE,...(status===undefined?{}:{status}),dryMetadata:result.dryMetadata,supportedDataTypes:{...TYPES}};
      this.#completedImports.set(selection.id,active.terminal);
      if(this.#completedImports.size>32)this.#completedImports.delete(this.#completedImports.keys().next().value);
      return active.terminal;
    }catch(error){
      this.#revokeSelection(input.selectionId,error);throw error;
    }finally{
      if(active.writeStarted&&!active.terminal){
        this.#completedImports.set(input.selectionId,{outcomeUnconfirmed:true});
        if(this.#completedImports.size>32)this.#completedImports.delete(this.#completedImports.keys().next().value);
      }
      this.#busy=false;this.#active=null;finishActive();for(const resolve of this.#idleWaiters.splice(0))resolve();
    }
  }
  async cancelSelection(input={}){
    inputObject(input);
    if(Object.keys(input).some(key=>key!=='selectionId')||typeof input.selectionId!=='string')throw failure('Cancel accepts only a native source selection ID');
    const {selectionId}=input;
    const active=this.#active?.id===selectionId?this.#active:null;
    const reads=[...this.#sourceReads].filter(task=>task.selectionId===selectionId);
    this.#revokeSelection(selectionId,new DOMException('History import canceled','AbortError'));
    await Promise.allSettled([...reads.map(task=>task.promise),...(active?[active.done]:[])]);
    const terminal=active?.terminal??this.#completedImports.get(selectionId);
    if(active?.writeStarted||terminal){
      if(!terminal||terminal.outcomeUnconfirmed)throw failure('The native history transaction did not provide a terminal receipt; its committed outcome is unconfirmed','PROFILE_IMPORT_OUTCOME_UNCONFIRMED');
      return{scope:SCOPE,status:'import-terminal',selectionId,transactionStarted:true,importResult:terminal};
    }
    return{scope:SCOPE,status:'selection-canceled',selectionId,transactionStarted:false};
  }
  handle(method,input={},options={}){
    if(method==='profileImport.getSignals'){inputObject(input);if(Object.keys(input).length)throw failure('Import signals accept no paths or parameters');return this.getSignals();}
    if(method==='profileImport.chooseSource')return this.chooseSource(input,options);
    if(method==='profileImport.list')return this.list(input,options);
    if(method==='profileImport.import')return this.import(input,options);
    if(method==='profileImport.cancelSelection')return this.cancelSelection(input);
    throw failure('Unknown owned profile import operation','PROFILE_IMPORT_METHOD_UNAVAILABLE');
  }
  close(){
    this.#closed=true;
    const reason=new DOMException('Profile importer closed','AbortError');
    this.#active?.controller.abort(reason);
    const reads=[...this.#sourceReads];for(const task of reads)task.controller.abort(reason);
    this.#selections.clear();
    const idle=this.#busy?new Promise(resolve=>this.#idleWaiters.push(resolve)):Promise.resolve();
    return Promise.allSettled([...reads.map(task=>task.promise),idle]).then(()=>{this.#completedImports.clear();});
  }
  dispose(){return this.close();}
}

// Preserve the route/export identity used by existing installations.
export class EngineNativeProfileImporter extends PluginManagedProfileImporter {}
