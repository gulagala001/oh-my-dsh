import {createPoller} from './polling.mjs';

export function createDreamPanel(React,{api,suffix,heading,button,icon,field,section,alert,badge,empty,DocumentReader,ReadingView}){
  function MemorySummary({ text }) {
    const [expanded, setExpanded] = React.useState(false), id = React.useId();
    const content = String(text ?? ''), characters = Array.from(content), long = characters.length > 220;
    return React.createElement(React.Fragment, null,
      React.createElement('p', { className: 'cx-prose', id }, long && !expanded ? characters.slice(0, 220).join('') + '…' : content),
      long && React.createElement('button', { type: 'button', className: 'cx-btn cx-quiet cx-memory-expand', 'aria-expanded': expanded, 'aria-controls': id, onClick: () => setExpanded(value => !value) }, expanded ? '收起记忆' : '展开完整记忆'));
  }
  const h=React.createElement,query=values=>'?' + new URLSearchParams(Object.entries(values).filter(([,v])=>v!==undefined&&v!==null&&v!==''));
  const title=path=>path==='@unclassified'?'未归类':path?.split(/[\\/]/).filter(Boolean).at(-1)||'项目';
  const jobs={queued:'等待执行',running:'整理中',paused:'已停止',budget:'等待每日额度',failed:'需要重试',complete:'已完成'};
  const scopes={session:'会话',project:'项目',global:'全局'},levels={global:0,project:1,session:2};
  const locationKey=(view,project,sessionId)=>JSON.stringify([view,project,sessionId]);
  const settingsKeys={enabled:'dreamAutoEnabled',intervalMinutes:'dreamIntervalMs',deepAgeDays:'dreamDeepAgeMs',dailyTokens:'dreamDailyTokens',provider:'dreamProvider',model:'dreamModel',folders:'dreamProjects'};
  const durationValue=(ms,unit)=>Number((ms/unit).toFixed(Math.ceil(Math.log10(unit))));
  const editSettings=s=>({enabled:s.enabled,intervalMinutes:String(durationValue(s.intervalMs,60000)),deepAgeDays:String(durationValue(s.deepAgeMs,86400000)),dailyTokens:String(s.dailyTokens),provider:s.provider,model:s.model,folders:Array.isArray(s.dreamProjects)?s.dreamProjects:[]});
  const settingValue=(key,value)=>key==='intervalMinutes'?Math.round(Number(value)*60000):key==='deepAgeDays'?Math.round(Number(value)*86400000):key==='dailyTokens'?Number(value):key==='folders'?Array.isArray(value)?[...value]:[]:value;
  // Folder selection is an array: compare element-wise, since a fresh reference per render would always look dirty.
  const sameFolders=(a,b)=>{const x=Array.isArray(a)?a:[],y=Array.isArray(b)?b:[];if(x.length!==y.length)return false;const left=[...x].sort(),right=[...y].sort();return left.every((value,index)=>value===right[index]);};
  const referenceLabel=s=>s.kind==='memory'?(s.key==='global'?'全局历史版本':s.key?.startsWith('project:')?'项目记忆 · '+title(s.key.slice(8)):'会话记忆'):
    ({summary:'摘要来源',raw:'原文来源',withdrawn:'已退出共享'})[s.kind]||'来源';
  const stamp=value=>new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  return class DreamPanel extends React.Component{
    state={data:null,error:'',loadError:'',catalogError:'',notice:'',busy:false,view:'global',project:'',selectedSession:'',selectedTitle:'',catalog:null,cursor:null,search:'',reader:null,detail:null,settings:null,savedSettings:null,settingsLoading:false,directory:[]};
    epoch=0;ticket=0;catalogTicket=0;catalogPending=false;catalogViews=[];
    componentDidMount(){this.alive=true;this.observe();this.loadCatalog();}
    componentWillUnmount(){this.alive=false;this.epoch++;this.ticket++;this.poller?.stop();}
    componentDidUpdate(prev){
      if(prev.sessionId!==this.props.sessionId){this.epoch++;this.ticket++;this.catalogViews=[];this.pendingCatalogPosition=null;this.setState({data:null,busy:false,settingsLoading:false,reader:null,detail:null,error:'',loadError:'',catalogError:'',notice:'',view:'global',selectedSession:'',selectedTitle:'',project:'',search:'',cursor:null,catalog:null},()=>{this.observe();this.loadCatalog();});}
      else if(prev.visible!==this.props.visible){this.observe();if(this.props.visible!==false){this.restoreCatalogPosition();this.loadCatalog();}}
    }
    observe(){
      this.poller?.stop();if(this.props.visible===false)return;
      const epoch=this.epoch;
      this.poller=createPoller({read:signal=>api('/dream'+suffix(this.props.sessionId),undefined,signal),onData:data=>{
        if(!this.alive||epoch!==this.epoch)return;
        const revision=this.state.data?.jobs?.[0]?.updatedAt,catalogChanged=this.state.data?.catalogRevision!==data.catalogRevision;
        this.setState({data,loadError:'',...(catalogChanged?{cursor:null}:{})},()=>{if(catalogChanged||revision!==data.jobs?.[0]?.updatedAt||this.state.catalogError&&!this.catalogPending)this.loadCatalog();});
      },onError:e=>{if(this.alive&&epoch===this.epoch)this.setState({loadError:e.message});}});this.poller.start();
    }
    go=(view,project='',selectedSession='',selectedTitle='')=>{
      const current=this.state,key=locationKey(view,project,selectedSession);
      if(key===locationKey(current.view,current.project,current.selectedSession))return;
      const focused=document.activeElement,body=this.catalogBody;
      this.catalogViews[levels[current.view]]={...Object.fromEntries(['view','project','selectedSession','selectedTitle','search','cursor','catalog'].map(k=>[k,current[k]])),
        revision:current.data?.catalogRevision,scrollTop:body?.scrollTop||0,focusId:focused?.closest('.cx-dream-entry')?.dataset.entryId};
      const level=levels[view];
      if(level>0&&this.catalogViews[1]&&this.catalogViews[1].project!==project)this.catalogViews.length=1;
      const saved=this.catalogViews[level],same=saved&&locationKey(saved.view,saved.project,saved.selectedSession)===key;
      if(!same)this.catalogViews.length=level;
      const stale=same&&saved.revision!=null&&current.data?.catalogRevision!=null&&saved.revision!==current.data.catalogRevision;
      const restore=same&&!stale?saved:null;
      this.pendingCatalogPosition={scrollTop:restore?.scrollTop||0,focusId:restore?.focusId,requestFocus:focused};
      this.ticket++;
      this.setState({view,project,selectedSession,selectedTitle:restore?.selectedTitle||selectedTitle,search:same?saved.search:'',cursor:restore?.cursor||null,catalog:restore?.catalog||null,
        reader:null,detail:null,error:'',catalogError:'',notice:stale&&saved.cursor?'目录已更新，已返回第一页。':''},()=>{this.restoreCatalogPosition();this.loadCatalog();});
    };
    restoreCatalogPosition=()=>{
      const position=this.pendingCatalogPosition,body=this.catalogBody;
      if(!position||this.props.visible===false||!body?.getClientRects().length)return;
      const list=body.querySelector('.cx-dream-list');
      if(!list||this.state.settings||body.closest('[inert]')||position.directory&&!this.state.catalog)return;
      const target=position.directory?list:[...body.querySelectorAll('.cx-dream-entry')].find(el=>el.dataset.entryId===position.focusId)||body.querySelector('[aria-current="page"]');
      if(document.activeElement===position.requestFocus||document.activeElement===document.body)target?.focus({preventScroll:true});
      body.scrollTop=position.directory?body.scrollTop+list.getBoundingClientRect().top-body.getBoundingClientRect().top:position.scrollTop;
      this.pendingCatalogPosition=null;
    };
    turnPage=cursor=>{
      this.pendingCatalogPosition={directory:true,requestFocus:document.activeElement};
      this.setState({cursor,catalog:null,catalogError:''},this.loadCatalog);
    };

    loadCatalog=async()=>{
      if(this.props.visible===false)return;const ticket=++this.catalogTicket,epoch=this.epoch;this.catalogPending=true;
      const {view,project,selectedSession,search,cursor}=this.state;
      const path=view==='session'?'/dream/read'+query({sessionId:selectedSession,query:search,cursor}):'/dream/catalog'+query({kind:view==='global'?'project':'session',project,query:search,cursor});
      try{const catalog=await api(path);if(this.alive&&epoch===this.epoch&&ticket===this.catalogTicket)this.setState({catalog,catalogError:''},this.restoreCatalogPosition);}
      catch(e){if(this.alive&&epoch===this.epoch&&ticket===this.catalogTicket)this.setState({catalogError:e.message});}
      finally{if(ticket===this.catalogTicket)this.catalogPending=false;}
    };
    act=async(path,body,message,onSuccess)=>{
      if(this.state.busy)return;const epoch=this.epoch;this.setState({busy:true,error:'',notice:''});
      try{const result=await api(path+suffix(this.props.sessionId),body);if(this.alive&&epoch===this.epoch){onSuccess?.(result);this.setState({notice:message});this.poller?.refresh();this.loadCatalog();}}
      catch(e){if(this.alive&&epoch===this.epoch)this.setState({error:e.message});}
      finally{if(this.alive&&epoch===this.epoch)this.setState({busy:false});}
    };
    run=scope=>this.act('/dream/run',{scope,sessionId:this.state.selectedSession||this.props.sessionId,project:this.state.project||this.state.data?.session?.project},'已加入 Dream 队列；可以继续对话。');
    read=async(args,back=this.state.reader)=>{
      const ticket=++this.ticket,epoch=this.epoch,position=this.sourceView?.capturePosition(),requestFocus=document.activeElement;
      const parent=back?{...back,position}:null;if(!back)this.sourceFocus=document.activeElement;
      this.setState({error:''});
      try{const value=await api('/dream/read'+query(args));if(this.alive&&epoch===this.epoch&&ticket===this.ticket)this.setState({reader:{args,value,back:parent,requestFocus}});}
      catch(e){if(this.alive&&epoch===this.epoch&&ticket===this.ticket)this.setState({error:e.message});}
    };
    document=async(sessionId,id)=>{
      const ticket=++this.ticket,epoch=this.epoch;this.documentFocus=document.activeElement;this.setState({error:''});
      try{const detail=await api('/dream/document'+query({sessionId,id}));if(this.alive&&epoch===this.epoch&&ticket===this.ticket)this.setState({detail});}
      catch(e){if(this.alive&&epoch===this.epoch&&ticket===this.ticket)this.setState({error:e.message});}
    };
    openSettings=async()=>{
      if(this.state.busy||this.state.settingsLoading)return;
      if(this.state.settings){this.setState({settings:null},this.restoreCatalogPosition);return;}
      const epoch=this.epoch;this.setState({settingsLoading:true,error:'',notice:''});
      try{const [settings,state]=await Promise.all([api('/dream/settings'),api('/state')]);if(this.alive&&epoch===this.epoch){const draft=editSettings(settings);this.setState({settings:draft,savedSettings:draft,directory:state.directory||[]});}}
      catch(e){if(this.alive&&epoch===this.epoch)this.setState({error:e.message});}
      finally{if(this.alive&&epoch===this.epoch)this.setState({settingsLoading:false});}
    };
    setting=(key,value)=>this.setState(s=>({settings:{...s.settings,[key]:value,...(key==='provider'?{model:''}:{})},notice:''}));
    settingsPatch=()=>{
      const {settings,savedSettings}=this.state;if(!settings||!savedSettings)return {};
      const patch=Object.fromEntries(Object.entries(settingsKeys).filter(([key])=>key==='folders'?!sameFolders(settings[key],savedSettings[key]):settingValue(key,settings[key])!==settingValue(key,savedSettings[key])).map(([key,name])=>[name,settingValue(key,settings[key])]));
      if('dreamProvider' in patch||'dreamModel' in patch){patch.dreamProvider=settings.provider;patch.dreamModel=settings.model;}
      return patch;
    };
    saveSettings=()=>{
      const draft=this.state.settings,patch=this.settingsPatch();if(!Object.keys(patch).length)return;
      return this.act('/dream/settings',patch,'自动 Dream 设置已保存。',result=>{const saved=editSettings(result);this.setState(state=>({savedSettings:saved,
        settings:state.settings&&Object.fromEntries(Object.keys(settingsKeys).map(key=>[key,state.settings[key]===draft[key]?saved[key]:state.settings[key]]))}));});
    };
    folders(s){
      const list=(this.state.data?.folders||[]).filter(item=>item&&typeof item.folder==='string'&&item.folder.trim()),selected=Array.isArray(s.folders)?s.folders:[];
      const write=next=>this.setting('folders',next);
      return h('div',{className:'cx-field cx-dream-folders'},h('span',null,'整理的文件夹'),
        h('small',null,'只整理勾选的工作区文件夹；不勾选表示整理全部。'),
        list.length>0&&h('div',{className:'cx-dream-folder-list',role:'group','aria-label':'整理的文件夹'},
          ...list.map(item=>h('label',{key:item.folder,className:'cx-dream-folder'+(item.exists===false?' cx-dream-folder-gone':''),title:item.exists===false?item.folder+'（文件夹已删除）':item.folder},h('input',{type:'checkbox','aria-label':`整理文件夹 ${item.folder}`,checked:selected.includes(item.folder),
            onChange:e=>write(e.target.checked?[...selected,item.folder]:selected.filter(folder=>folder!==item.folder))}),
            h('span',{className:'cx-dream-folder-text'},h('strong',{title:item.folder},h('span',{className:'cx-dream-folder-name'},title(item.folder)),item.exists===false&&h('em',{className:'cx-dream-folder-gone-tag'},'文件夹已删除')),h('small',{title:item.folder,className:'cx-dream-folder-path'},item.folder)),
            h('small',{className:'cx-dream-folder-count'},`${(item.projects||[]).length} 个项目`)))),
        list.length>0&&h('div',{className:'cx-actions cx-dream-folder-actions'},h('button',{type:'button',className:'cx-btn cx-quiet',onClick:()=>write(list.map(item=>item.folder))},'全选'),
          h('button',{type:'button',className:'cx-btn cx-quiet',onClick:()=>write([])},'清空')),
        list.length===0&&h('small',{className:'cx-hint'},'尚未读取到工作区文件夹；刷新后重试。'));
    }
    renderSettings(){
      const s=this.state.settings,providers=this.state.directory,models=providers.find(p=>p.id===s.provider)?.models||[];
      return section('自动 Dream 设置','定时检查新增摘要；没有新材料就不调用模型。',h('form',{onSubmit:e=>{e.preventDefault();this.saveSettings();}},
        h('label',{className:'cx-toggle'},h('span',null,h('strong',null,'启用自动 Dream'),h('small',null,'按项目整理共享会话，再更新全局短记忆。')),h('input',{type:'checkbox',role:'switch','aria-label':'启用自动 Dream',checked:s.enabled,onChange:e=>this.setting('enabled',e.target.checked)})),
        h('div',{className:'cx-grid'},field('检查间隔 · 分钟',h('input',{type:'number',min:1,step:'any',required:true,value:s.intervalMinutes,onChange:e=>this.setting('intervalMinutes',e.target.value)})),
          field('原文整理等待 · 天',h('input',{type:'number',min:durationValue(60000,86400000),step:'any',required:true,value:s.deepAgeDays,onChange:e=>this.setting('deepAgeDays',e.target.value)}),'从会话最后一次实际活动起算；未到时间只读摘要。')),
        field('每日 Dream token 上限',h('input',{type:'number',min:0,step:1,required:true,value:s.dailyTokens,onChange:e=>this.setting('dailyTokens',e.target.value)}),'手动与自动共用；达到上限保存进度，下一额度日继续。'),
        this.folders(s),
        field('固定后台提供方',h('select',{value:s.provider,onChange:e=>this.setting('provider',e.target.value)},h('option',{value:''},'沿用已配置的后台模型'),...providers.map(p=>h('option',{key:p.id,value:p.id},p.name||p.id)))),
        field('固定后台模型',h('input',{list:'dream-model-options',value:s.model,placeholder:'自动执行需要固定提供方与模型',onChange:e=>this.setting('model',e.target.value)})),h('datalist',{id:'dream-model-options'},...models.map(m=>h('option',{key:m.id,value:m.id}))),
        h('p',{className:'cx-hint'},'长度上限：会话 1,200、项目 2,400、全局 600 字符。单次输入按保守估算限制在 16,000 token；原始档案保留。'),
        h('button',{type:'submit',className:'cx-btn cx-primary',disabled:this.state.busy||!Object.keys(this.settingsPatch()).length},'保存自动 Dream 设置')));
    }
    memory(memory,label){
      return h('article',{className:'cx-dream-memory'},h('div',{className:'cx-row'},h('strong',null,label),memory&&badge(memory.invalid?'待更新':'v'+memory.revision)),
        h(MemorySummary,{key:memory?.ref||label,text:memory?.invalid?memory.notice:memory?.summary||'尚未生成。运行对应范围的 Dream 后，短记忆会显示在这里。'}),
        memory&&h('div',{className:'cx-record-footer'},h('small',null,stamp(memory.updatedAt)),button('查看来源',()=>this.read({reference:memory.ref}),{quiet:true,icon:'context'})));
    }
    job(job){
      const target=job.targetTitle||(job.scope==='global'?'全部共享项目':job.target==='@unclassified'?'未归类':job.scope==='session'&&job.target===this.state.data?.session?.id?this.state.data.session.title||job.target:job.target);
      return h('div',{key:job.id,className:'cx-dream-job',role:'status'},h('div',null,h('strong',null,scopes[job.scope]+' Dream · '+jobs[job.state]),h('small',{className:'cx-dream-job-target'},target),
        h('small',null,`${job.done||0} / ${job.total??'—'} 个范围 · ${job.calls||0} 次调用`),job.notice&&h('small',null,job.notice),job.error&&h('p',null,job.error)),
        ['running','queued','budget'].includes(job.state)?button('停止',()=>this.act('/dream/job',{id:job.id,action:'stop'},'已停止，已完成部分保留。'),{quiet:true,disabled:this.state.busy}):['paused','failed'].includes(job.state)?button(job.state==='failed'?'重试':'继续',()=>this.act('/dream/job',{id:job.id,action:'resume'},'继续已保存进度。'),{quiet:true,disabled:this.state.busy}):null);
    }
    closeReader=()=>{this.ticket++;this.setState({reader:this.state.reader?.back||null,error:''},this.restoreCatalogPosition);};
    renderReader(){
      const {args,value:v,back,position}=this.state.reader;
      return h(ReadingView,{className:'cx-dream-reader',label:'记忆来源',visible:this.props.visible,returnFocus:this.sourceFocus,page:this.state.reader,position,requestFocus:this.state.reader.requestFocus,ref:view=>{this.sourceView=view;},onClose:this.closeReader},
        h('header',{className:'cx-reader-head'},button(back?'返回上层':'返回记忆',this.closeReader,{quiet:true,icon:'arrow'}),h('strong',null,'记忆与来源')),
        this.state.error&&h('div',{className:'cx-reader-feedback'},alert(this.state.error,true)),
        h('div',{className:'cx-body'},h('div',{className:'cx-dream-source-heading'},h('strong',{title:v.key||v.sessionId||v.reference},v.presentation?.title||referenceLabel(v)),v.presentation?.detail&&h('small',null,v.presentation.detail)),h('pre',{className:'cx-prose'},v.text||v.message||''),
          v.recordId&&button('查看详细资料与附件',()=>this.document(v.sessionId,v.recordId),{icon:'context'}),
          v.seq!=null&&button('查看原始事件',()=>this.read({sessionId:v.sessionId,from:v.seq,to:v.seq}),{quiet:true}),
          ...(v.sources||v.entries||[]).map((s,i)=>h('div',{key:s.reference||i,className:'cx-dream-source'},h('button',{type:'button',className:'cx-dream-source-link',title:s.reference,onClick:()=>this.read({reference:s.reference})},icon(s.kind==='memory'?'memory':'context'),h('span',null,h('strong',null,s.presentation?.title||referenceLabel(s)),s.presentation?.detail&&h('small',null,s.presentation.detail),s.presentation?.preview&&h('p',null,s.presentation.preview)),icon('chevron',13)))),
          h('div',{className:'cx-actions'},v.nextCursor&&button('继续读取',()=>this.read({...args,cursor:v.nextCursor})),v.nextSources&&button('更多来源',()=>this.read({reference:v.reference,query:'sources',cursor:v.nextSources})))));
    }
    render(){
      const {data:d,error,loadError,catalogError,notice,busy,view,project,selectedSession,catalog,search,reader,settings}=this.state;
      const sid=selectedSession||this.props.sessionId,pid=project||d?.session?.project;
      const selectedTitle=sid===d?.session?.id?(d.session.title&&d.session.title!==sid?d.session.title:'当前会话'):this.state.selectedTitle||'会话资料';
      const unfinished=(d?.jobs||[]).filter(j=>['running','queued','budget','paused','failed'].includes(j.state));
      const active=unfinished.find(j=>j.state==='running')||unfinished.find(j=>j.state==='queued')||unfinished[0]||d?.jobs?.[0],otherJobs=unfinished.filter(j=>j!==active);
      const selectedMemory=view==='global'?d?.globalMemory:view==='project'&&pid===d?.session?.project?d?.projectMemory:view==='session'&&sid===d?.session?.id?d?.sessionMemory:null;
      return h('div',{className:'cx-panel cx-dream','data-dream-ui':'1'},heading('记忆','保留重要信息，随时回查来源。'),
        h('div',{className:'cx-dream-actions','aria-label':'记忆整理'},button('整理会话',()=>this.run('session'),{icon:'context',disabled:busy||!sid,title:sid}),button('整理项目',()=>this.run('project'),{icon:'layers',disabled:busy||!pid,title:pid}),button('整理全局',()=>this.run('global'),{icon:'globe',disabled:busy}),button('自动整理设置',this.openSettings,{icon:'settings',disabled:busy||this.state.settingsLoading})),
        !reader&&(error||loadError||catalogError||d?.indexError)&&h('div',{className:'cx-dream-feedback'},alert(error||loadError||catalogError||d?.indexError,true)),
        h('div',{className:'cx-body',ref:el=>{this.catalogBody=el;}},alert(notice),d?.notice&&alert(d.notice),
          d?.indexWarnings?.length>0&&h('details',{className:'cx-dream-index-warnings'},h('summary',null,`${d.indexWarnings.length} 个会话暂不可读取`),
            h('p',null,'这些会话暂不参与汇总；正常会话可继续使用，原始日志保留。'),
            ...d.indexWarnings.map(item=>h('p',{key:item.sessionId},h('strong',null,item.title),h('br'),item.error))),
          active&&this.job(active),otherJobs.length>0&&h('details',{className:'cx-dream-other-jobs'},h('summary',null,`其他作业（${otherJobs.length}）`),...otherJobs.map(job=>this.job(job))),
          d&&h('p',{className:'cx-hint cx-dream-usage'},`今日 ${Number(d.usage.used).toLocaleString()} / ${Number(d.settings.dailyTokens).toLocaleString()} token（含未知用量的保守预留） · ${stamp(d.usage.resetsAt)} 重置`),
          settings?this.renderSettings():h(React.Fragment,null,
            h('div',{className:'cx-dream-location'},h('nav',{className:'cx-dream-breadcrumb','aria-label':'记忆层级'},
              h('button',{type:'button',className:'cx-btn cx-quiet','aria-current':view==='global'?'page':undefined,onClick:()=>this.go('global')},'全局'),
              view!=='global'&&h(React.Fragment,null,icon('chevron',12),h('button',{type:'button',className:'cx-btn cx-quiet',title:pid,'aria-current':view==='project'?'page':undefined,onClick:()=>this.go('project',pid)},title(pid))),
              view==='session'&&h(React.Fragment,null,icon('chevron',12),h('button',{type:'button',className:'cx-btn cx-quiet','aria-current':'page',title:selectedTitle},selectedTitle))),
              (view!=='session'||sid!==this.props.sessionId)&&button('当前会话',()=>this.go('session',d.session.project||'',this.props.sessionId,d.session.title),{quiet:true,icon:'context',className:'cx-dream-current',disabled:!d?.session})),
            h(React.Fragment,null,
              selectedMemory||view==='global'?this.memory(selectedMemory,scopes[view]+'短记忆'):h('div',{className:'cx-dream-memory'},h('strong',null,scopes[view]+'短记忆'),button('读取短记忆与来源',()=>this.read({memory:view,project:pid,sessionId:view==='session'?sid:undefined}),{quiet:true})),
              view==='session'&&d?.session?.id===sid&&!d.session.shared&&h('p',{className:'cx-hint'},'独立会话：本会话 Dream 不会进入项目或全局记忆。'),
              h('label',{className:'cx-search'},icon('search'),h('input',{'aria-label':'搜索记忆目录',placeholder:view==='global'?'搜索项目':view==='project'?'搜索会话':'搜索摘要',value:search,onChange:e=>this.setState({search:e.target.value,cursor:null,catalog:null},this.loadCatalog)})),
              h('div',{className:'cx-dream-list',tabIndex:-1,role:'region','aria-label':view==='global'?'项目目录':view==='project'?'会话目录':'摘要目录'},...(catalog?.entries||[]).map(item=>h('button',{type:'button',key:item.id,'data-entry-id':item.id,className:'cx-dream-entry',onClick:()=>view==='global'?this.go('project',item.id):view==='project'?this.go('session',project,item.id,item.title):this.document(selectedSession,item.id)},
                icon(view==='global'?'layers':view==='project'?(item.shared?'context':'lock'):'context'),h('span',null,h('strong',null,view==='global'?title(item.id):view==='session'?item.summary||'未提供摘要':item.title||item.id),h('small',null,view==='session'?`${item.documents||0} 份详细资料 · ${item.assets||0} 个附件`:item.memory?.invalid?'待重新整理':item.memory?.summary?.slice(0,100)||'尚未生成短记忆')),icon('chevron',13)))),
              catalog&&!catalog.entries.length&&empty('暂无匹配记录',view==='session'?'尚未产生摘要的会话会在达到原文整理等待时间后参与 Dream。':'可以清空搜索，或稍后刷新目录。'),
              h('div',{className:'cx-actions'},this.state.cursor&&button('第一页',()=>this.turnPage(null),{quiet:true}),catalog?.nextCursor&&button('下一页',()=>this.turnPage(catalog.nextCursor)),button('刷新',()=>this.act('/dream/refresh',{},'目录已刷新。'),{quiet:true,icon:'refresh',disabled:busy}))))),
        reader&&this.renderReader(),
        this.state.detail&&h(DocumentReader,{record:this.state.detail,visible:this.props.visible,returnFocus:this.documentFocus,onClose:()=>{this.ticket++;this.setState({detail:null});}}));
    }
  };
}

export const DREAM_CSS=`
.cx-dream-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:0 22px 16px;flex-shrink:0}.cx-dream-actions .cx-btn{padding:9px 5px}
.cx-dream-job{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;background:var(--cx-tint);border-radius:9px;margin-bottom:9px}.cx-dream-job>div{min-width:0;overflow-wrap:anywhere}.cx-dream-job>.cx-btn{flex-shrink:0}.cx-dream-job strong,.cx-dream-job small{display:block}.cx-dream-job-target{margin:3px 0}.cx-dream-job p{font-size:11px;color:var(--cx-red);overflow-wrap:anywhere}.cx-dream-other-jobs{margin-bottom:12px}.cx-dream-other-jobs>summary{cursor:pointer;font-size:11px;padding:5px 0 10px;color:var(--cx-muted)}
.cx-dream-usage{font-size:11px!important}.cx-dream-location{display:flex;align-items:flex-start;gap:8px;margin:12px 0}.cx-dream-breadcrumb{display:flex;align-items:center;gap:2px;flex-wrap:wrap;min-width:0;margin:0 -7px;flex:1}.cx-dream-breadcrumb>svg{flex-shrink:0;color:var(--cx-muted)}.cx-dream-breadcrumb [aria-current=page]{color:var(--cx-text);font-weight:600}.cx-dream-current{flex-shrink:0;min-height:28px!important;padding:4px 6px!important;font-size:11px!important}.cx-dream-breadcrumb .cx-btn{display:block;max-width:100%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
.cx-dream-index-warnings{margin:10px 0;overflow-wrap:anywhere}.cx-dream-index-warnings>summary{cursor:pointer}.cx-dream-index-warnings>p{font-size:11px}
.cx-dream-memory{padding:14px 15px;border:1px solid var(--cx-line);border-radius:11px;margin-bottom:17px}.cx-dream-memory>.cx-row{justify-content:space-between;margin-bottom:8px}.cx-dream-memory .cx-record-footer{justify-content:space-between}
.cx-dream-entry{display:flex;align-items:center;gap:10px;width:100%;padding:14px 2px;background:none;color:var(--cx-text);font:inherit;text-align:left;border:0;border-bottom:1px solid var(--cx-line);cursor:pointer}.cx-dream-entry:hover{background:var(--cx-hover)}.cx-dream-entry>span{flex:1;min-width:0}.cx-dream-entry strong,.cx-dream-entry small{display:block;overflow-wrap:anywhere}.cx-dream-entry strong{font-weight:550}.cx-dream-entry small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:4px}
.cx-dream-list{margin-bottom:14px;outline:none}.cx-dream-source-heading{display:flex;flex-direction:column;gap:4px;margin:16px 0 12px;overflow-wrap:anywhere}.cx-dream-source-heading strong{font-size:14px}.cx-dream-source-heading small{color:var(--cx-muted);font-size:11px}.cx-dream-reader pre{font-family:inherit;font-size:12px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;max-height:none;overflow:visible;background:none;border:0;padding:0}.cx-dream-source-link{display:flex;align-items:flex-start;gap:10px;width:100%;padding:13px 0;border:0;border-top:1px solid var(--cx-line);background:none;color:var(--cx-text);font:inherit;text-align:left;cursor:pointer}.cx-dream-source-link:hover{background:var(--cx-hover)}.cx-dream-source-link>svg{flex-shrink:0;margin-top:3px;color:var(--cx-muted)}.cx-dream-source-link>span{flex:1;min-width:0}.cx-dream-source-link strong,.cx-dream-source-link small{display:block;overflow-wrap:anywhere}.cx-dream-source-link strong{font-size:12px;font-weight:550}.cx-dream-source-link small{font-size:11px;color:var(--cx-muted);margin-top:3px}.cx-dream-source-link p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:6px 0 0;font-size:12px;line-height:1.65}.cx-dream-reader .cx-actions{margin-top:14px}.cx-reader-feedback{padding:10px var(--wb-gutter,16px) 0;flex-shrink:0}.cx-dream-feedback{padding:0 var(--wb-gutter,16px) 12px;flex-shrink:0}.cx-reader-feedback .cx-alert,.cx-dream-feedback .cx-alert{margin:0;max-height:140px;overflow:auto}
.cx-dream-folder-list{display:flex;flex-direction:column;max-height:190px;overflow-y:auto;overscroll-behavior:contain;border:1px solid var(--cx-line);border-radius:9px;background:var(--cx-bg)}
.cx-dream-folder{display:flex;align-items:center;gap:9px;padding:9px 11px;cursor:pointer;min-width:0}.cx-dream-folder+.cx-dream-folder{border-top:1px solid var(--cx-line)}
.cx-dream-folder:hover{background:var(--cx-hover)}.cx-dream-folder-text{flex:1;min-width:0}.cx-dream-folder-text strong{display:flex;align-items:baseline;min-width:0;font-size:12px;font-weight:550}
.cx-dream-folder-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-dream-folder-path{display:block;font-size:10px;color:var(--cx-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-dream-folder-count{flex-shrink:0;font-size:10px;color:var(--cx-muted);white-space:nowrap}.cx-dream-folder-actions{margin-top:8px}
.cx-dream-folder-gone{opacity:.6}.cx-dream-folder-gone:hover{opacity:.85}
.cx-dream-folder-gone-tag{flex-shrink:0;margin-inline-start:8px;font-size:10px;font-style:normal;color:var(--cx-muted);white-space:nowrap}
@container cx (max-width:330px){.cx-dream-actions{padding-inline:12px;gap:5px}.cx-dream-actions .cx-btn{font-size:11px}.cx-dream-job{align-items:flex-start}.cx-dream .cx-grid{grid-template-columns:1fr}.cx-dream-folder{padding:8px 9px;gap:7px}.cx-dream-folder-count{font-size:9px}}
`;
