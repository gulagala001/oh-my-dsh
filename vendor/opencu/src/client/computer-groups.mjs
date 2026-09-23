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
export const operationIcon=names=>({image:'image',read:'book',command:'terminal',search:'search',web:'browser',computer:'screen',edit:'annotate',tool:'stack'})[operationKind(names[0])];
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

export function summarizeToolOutcomes(data) {
  const seen = new Set();
  let failures = 0, stopped = 0;
  function visit(block) {
    if (!block || seen.has(block.callId)) return;
    seen.add(block.callId);
    const state = operationState(block);
    if (state === 'error') failures++;
    if (state === 'stopped') stopped++;
    for (const child of block.subCalls ?? []) visit(child);
  }
  for (const item of data) visit(item.root);
  return { failures, stopped };
}
