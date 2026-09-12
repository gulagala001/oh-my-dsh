const stepKey = node => node.location?.kind === 'step' ? `${node.location.turn.turn}:${node.location.step.step}` : node.kind === 'assistant-step' ? `${node.data.turn}:${node.data.step}` : null;

// A completed answer's reasoning belongs to its process disclosure, even if
// the provider delivered text first in a combined delta. This is a render-only
// projection: retain every block and preserve order within each kind of content.
export function finalAnswerPresentation(node,process){
  if(!process?.foldable||!process.spec.inlineReasoning||process.spec.answerStep!==node.data.step)return node;
  const blocks=node.data.blocks??[],firstAnswer=blocks.findIndex(block=>block.kind!=='reasoning');
  if(firstAnswer<0||!blocks.slice(firstAnswer+1).some(block=>block.kind==='reasoning'))return node;
  return {...node,data:{...node.data,blocks:[...blocks.filter(block=>block.kind==='reasoning'),...blocks.filter(block=>block.kind!=='reasoning')]}};
}

export function operationKind(name=''){
  const key=name.split(/[./]/).at(-1);
  if(key==='read_image')return'image';
  if(['read','read_file','file_read','cat','cordis_package_inspect','cordis_runtime_inspect'].includes(key))return'read';
  if(['bash','pwsh','exec','exec_command','terminal','shell','run_code'].includes(key))return'command';
  if(['grep','glob','search','web_search','search_web'].includes(key))return'search';
  if(key==='web_fetch')return'web';
  if(/^computer_use(?:_|$)/.test(key))return'computer';
  if(['write','write_file','edit','edit_file','apply_patch'].includes(key))return'edit';
  return'tool';
}
const summaryLabels={image:'查看图像',read:'读取文件',command:'运行命令',search:'搜索',web:'读取网页',computer:'操作电脑',edit:'编辑文件',tool:'调用工具'};
export const operationIcon=names=>({image:'image',read:'book',command:'terminal',search:'search',web:'browser',computer:'screen',edit:'annotate',tool:'stack'})[operationKind(names[0])];
export function operationSummary(names,running=false){
  const labels=[...new Set(names.map(name=>summaryLabels[operationKind(name)]))];
  return (running?'正在':'已')+(labels.join('、')||'执行操作');
}
export function operationState(block){
  if(block.kind!=='tool-result')return'running';
  const name=block.call?.name??block.name??'';
  if(['ABORTED','ABORTED_BEFORE_DISPATCH','interrupted','COMPUTER_USE_STOPPED'].includes(block.error?.code)||operationKind(name)==='computer'&&block.isError&&/tool call aborted|Computer Use (?:was |is )?stopped/i.test((block.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')))return'stopped';
  return block.isError||block.meta?.computerUseError?'error':'done';
}
const rowTitles={bash:['bash','运行'],pwsh:['pwsh','运行 PowerShell'],read:['read','读取'],read_image:['readImage','查看图像'],write:['write','写入'],edit:['edit','编辑'],grep:['grep','搜索'],glob:['glob','查找文件'],web_search:['webSearch','搜索网页'],web_fetch:['webFetch','读取网页'],run_code:['code','运行代码']};
export function operationRowLocale(t,name,block){
  const row=rowTitles[name];
  // Override only the host's Chinese title, never its result labels, actions,
  // tool identity or another plugin's locale / rendering contract.
  if(!row||!t||!/[\u3400-\u9fff]/.test(t('row.failed')))return t;
  const state=operationState(block),title=state==='running'?'正在'+row[1]:state==='stopped'?'已停止':state==='error'?row[1]+'失败':'已'+row[1];
  return(key,...args)=>key==='tool.title.'+row[0]?title:t(key,...args);
}

// Context maintenance and thinking belong to the same process as tool calls.
// Only visible prose, human input and turn boundaries split the live group.
export const processContextKinds=new Set(['context','system-prompt','compaction']);
export function computerGroups(nodes) {
  const steps = new Map(), result = new Map();
  for (const node of nodes) if (node.kind === 'tool-call') {
    const key = stepKey(node); if (!key) continue;
    steps.set(key,true);
  }
  let group;
  for (const node of nodes) {
    if(node.kind==='turn-process')continue;
    const step = steps.get(stepKey(node));
    const tool = node.kind === 'tool-call';
    const blocks=node.data.blocks??[],assistant = node.kind === 'assistant-step' && (step||blocks.some(block=>block.kind==='reasoning')) && !blocks.some(block=>!['reasoning','tool-call'].includes(block.kind)&&(block.kind!=='text'||block.text?.trim()));
    const turn = node.location?.turn?.turn ?? node.data.turn;
    const context=processContextKinds.has(node.kind)&&turn!=null;
    if ((!tool && !assistant && !context)||turn==null) { group = undefined; continue; }
    if (!group || group.turn !== turn) group = { id: node.key, turn, keys: [], calls: [], names: [], contexts:0, running: false, failures: 0, stopped: 0, title: '' };
    group.keys.push(node.key); result.set(node.key, group);
    if(context)group.contexts++;
    if (tool) {
      const root = node.data.root; if (group.keys.length === 1) group.headerCallId = root.callId; result.set(`call:${root.callId}`, group); group.calls.push(root.callId);
      group.names.push(root.call?.name??root.name??'');
      const state=operationState(root);group.running ||= state==='running';
      if (state==='stopped') group.stopped++; else if (state==='error') group.failures++;
      try { group.title = JSON.parse(root.call?.argsRaw ?? root.argsRaw ?? '{}').title || group.title; } catch {}
    }
  }
  return result;
}
