import { decorateSlot } from './slot-decoration.mjs';
import {ComputerIcon} from './computer-icons.jsx';
import React, { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { computerGroups,processSummaries,operationSummary,operationIcon,operationRowLocale,finalAnswerPresentation,processContextKinds, latestOperation } from './computer-groups.mjs';
import {SavedImage} from './tool-image.jsx';

function LatestAction({action}){
  return <><strong data-cu-latest-action title={action.label}>{action.label}</strong><span data-cu-action-state={action.state} className={action.state==='error'?'tx-cu-error':undefined}>{{running:'进行中',done:'已完成',error:'失败',stopped:'已停止'}[action.state]}</span></>;
}

export function computerGroupPresentation(ctx) {
  const genericViews = new Map(), fallbackScans = new WeakMap();
  const cache = new WeakMap(), processCache=new WeakMap(), open = new Set(), lists = new Map(), listeners = new Set();
  const notify = () => { for (const listener of listeners) listener(); };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const subscribeToolviews = listener => ctx.slots.subscribe('tool.call.toolview', listener);
  const readToolviews = () => ctx.slots.entries('tool.call.toolview');
  const groups = (snapshot, toolviews) => {
    let cached=cache.get(snapshot);
    if (!cached||cached.toolviews!==toolviews) {
      cached={toolviews,groups:computerGroups(snapshot.order.map(key => snapshot.nodes.get(key)).filter(Boolean),new Set(toolviews.map(entry=>entry.options.key)))};
      cache.set(snapshot,cached);
    }
    return cached.groups;
  };
  const emptyProcess = { label: operationSummary([]), icon: operationIcon([]), failures: 0, stopped: 0 };
  const process = (snapshot, turn) => {
    if (!processCache.has(snapshot)) processCache.set(snapshot, processSummaries(snapshot));
    return processCache.get(snapshot).get(turn) || emptyProcess;
  };
  function GenericTool({block,toolName,inspect,loadImage}) {
    const action=latestOperation(block),[expanded,setExpanded]=useState(false);
    return <div className="tx-cu-card" data-cu-generic-tool={toolName}>
      <button type="button" className="tx-cu-card-heading" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}><ComputerIcon name={action.icon} size={16}/><LatestAction action={action}/></button>
      {expanded&&<div className="tx-cu-card-body"><pre>{block.call?.argsRaw??block.argsRaw}</pre>{(block.content??[]).map((item,index)=>item.type==='image'&&item.attachment?<SavedImage key={index} attachment={item.attachment} loadImage={loadImage}/>:<pre key={index}>{item.type==='text'?item.text:JSON.stringify(item,null,2)}</pre>)}{block.error&&<pre className="tx-cu-error">{block.error.reason||block.error.message||block.error.code}</pre>}<button type="button" onClick={inspect}>查看完整调用</button></div>}
    </div>;
  }
  function Group({ sessionId, useChat, nodeKey, callId, turnProcess, completedContext=false, children }) {
    // Registration changes can turn a specialized tool into a generic card
    // even when the conversation snapshot itself has not changed.
    const toolviews=useSyncExternalStore(subscribeToolviews,readToolviews);
    const snapshot=useChat(value=>value);
    const group = groups(snapshot,toolviews).get(nodeKey ?? `call:${callId}`);
    useLayoutEffect(()=>{
      if(fallbackScans.get(snapshot)===toolviews)return;
      fallbackScans.set(snapshot,toolviews);
      // Low-priority fallbacks let the host retain its normal keyed dispatch,
      // while specialized renderers can still load or unload at any time.
      for(const node of snapshot.nodes.values())if(node.kind==='tool-call'){
        const root=node.data.root,name=root.call?.name??root.name;
        if(name&&!genericViews.has(name)&&!toolviews.some(entry=>entry.options.key===name)){
          genericViews.set(name,ctx.slots.register({name:'tool.call.toolview',key:name,priority:1000000},GenericTool));
        }
      }
    },[snapshot,toolviews]);
    const identity = `${sessionId}:${group?.id}`;
    const expanded = useSyncExternalStore(subscribe, () => open.has(identity));
    const wasFoldable=useRef(false), [visited,setVisited]=useState(false), listId=useId();
    const first=!!group&&(nodeKey?nodeKey===group.id:group.headerCallId===callId), foldable=!!turnProcess?.foldable||completedContext;
    const target=useSyncExternalStore(subscribe,()=>lists.get(identity));
    const listRef=useCallback(element=>{
      if(element)lists.set(identity,element);else lists.delete(identity);
      notify();
    },[identity]);
    useLayoutEffect(()=>{if(expanded)setVisited(true);},[expanded]);
    useLayoutEffect(()=>{
      // Completion may add an outer process disclosure. Preserve the group
      // being read, but never let that outer disclosure open other groups.
      if(foldable&&!wasFoldable.current&&first&&expanded)turnProcess?.setOpen(true);
      wasFoldable.current=foldable;
    },[foldable,first,expanded,turnProcess?.setOpen]);
    const toggle = () => { if (expanded) open.delete(identity); else open.add(identity); notify(); };
    if(!group)return <div style={{display:'contents'}} data-cu-group-hidden={completedContext&&!turnProcess.open||undefined} data-cu-process-context={completedContext||undefined}>{children}</div>;
    const order=group.keys.indexOf(nodeKey??group.callKeys.get(callId));
    const latest=group.running||group.turnActive?group.latest:null;
    const label=latest?.label||(group.calls.length?operationSummary(group.names):group.contexts?'上下文记录':'思考过程');
    // Each native renderer keeps its original React owner and subscriptions.
    // Portals collect adjacent rows into one bounded list without moving DOM
    // owned by the host or rendering a second copy of a tool result.
    return <div className="tx-cu-group" data-cu-group={first?group.id:undefined} data-cu-group-hidden={!first||completedContext&&!turnProcess.open||undefined}>
      {first&&<>
        <button type="button" className="tx-cu-group-toggle" aria-expanded={expanded} aria-controls={listId} title={group.title||undefined} onClick={toggle}>
          <ComputerIcon name={latest?.icon||(group.calls.length?operationIcon(group.names):'book')} size={16}/>{latest?<LatestAction action={latest}/>:<strong>{label}</strong>}{group.calls.length>0&&<span>{group.calls.length} 次操作</span>}
          {group.failures>0&&<span className="tx-cu-error">{group.failures} 次失败</span>}
          {group.stopped>0&&<span>{group.stopped} 项已停止</span>}
          <ComputerIcon className="tx-cu-disclosure" name="chevron" size={12}/>
        </button>
        <div ref={listRef} id={listId} className="tx-cu-group-list" role="region" aria-label={label+'详情'} tabIndex={0} hidden={!expanded}/>
      </>}
      {target&&(expanded||visited)&&createPortal(<div className="tx-cu-group-item" data-cu-operation={callId||undefined} data-chat-call-id={callId||undefined} data-cu-process-node={nodeKey||undefined} style={{order}}>{children}</div>,target)}
    </div>;
  }

  ctx.slots.inject('conversation.chat.node', () => {
    const dispose = decorateSlot(ctx.slots, 'conversation.chat.node', key => ['assistant-step', 'turn-process', ...processContextKinds].includes(key), original => {
        const key = original.options.key;
        const Original=original.component;
        function GroupedAssistant(props){
          const node=useMemo(()=>finalAnswerPresentation(props.node,props.turnProcess),[props.node,props.turnProcess?.foldable,props.turnProcess?.spec.answerStep,props.turnProcess?.spec.inlineReasoning]);
          const inline=props.turnProcess?.foldable&&props.turnProcess.spec.inlineReasoning&&props.turnProcess.spec.answerStep===node.data.step;
          return <Group {...props} nodeKey={props.node.key}><div className={inline?'tx-cu-process-answer':undefined} data-process-open={inline&&props.turnProcess.open||undefined} style={{display:'contents'}}><Original {...props} node={node}/></div></Group>;
        }
        function GroupedProcess(props){
          const {failures,stopped}=props.useChat(snapshot=>process(snapshot,props.node.data.turn));
          const turn=props.node.location?.turn;
          const seconds=turn?.start&&turn?.end?Math.max(0,Math.round((turn.end.time-turn.start.time)/1000)):null;
          const duration=seconds===null?'执行过程':`用时 ${seconds>=60?Math.floor(seconds/60)+'分':''}${seconds%60}秒`;
          if(!props.turnProcess?.foldable||!props.node.data.toolCallCount)return <Original {...props}/>;
          return <button type="button" className="tx-cu-group-toggle tx-cu-turn-toggle" data-turn-process={props.node.data.turn} data-turn-process-tool-calls={props.node.data.toolCallCount} aria-expanded={props.turnProcess.open} title={props.node.data.toolCallCount+' 次工具调用'} onClick={()=>props.turnProcess.setOpen(!props.turnProcess.open)}><strong>{duration}</strong>{failures>0&&<span className="tx-cu-error">{failures} 项失败</span>}{stopped>0&&<span>{stopped} 项已停止</span>}<ComputerIcon className="tx-cu-disclosure" name="chevron" size={12}/></button>;
        }
        function GroupedContext(props){
          const spec=props.turnProcess?.spec,node=props.node;
          // The host intentionally leaves system prompts independent. A prompt
          // inside a completed process follows that process's disclosure here;
          // initial/session prompts and anything after the answer stay outside.
          const completedContext=key==='system-prompt'&&node.location?.turn?.status==='closed'&&spec?.answerAnchorSeq!=null&&node.anchorSeq>=spec.processStartSeq&&node.anchorSeq<spec.answerAnchorSeq;
          return <Group {...props} nodeKey={node.key} completedContext={completedContext}><Original {...props}/></Group>;
        }
        const GroupedNode=key==='turn-process'?GroupedProcess:key==='assistant-step'?GroupedAssistant:GroupedContext;
        return { options: {name:'conversation.chat.node',key,locale:'chat',priority:(original.options.priority??0)-1}, component: GroupedNode };
    });
    return () => { dispose(); for(const disposeView of genericViews.values())disposeView(); genericViews.clear(); open.clear(); lists.clear(); listeners.clear(); };
  });
  ctx.slots.inject('tool.call.toolview', () => decorateSlot(ctx.slots, 'tool.call.toolview', () => true, original => {
      const Original=original.component;
      function GroupedTool(props){
        // read_image owns a private child gallery. Reuse its row and provide
        // our modal gallery without redeclaring the host's child slot.
        const images=(name,owner)=>{if(name!=='tool.call.images')throw new Error('Unsupported tool image slot: '+name);return <div className="tx-cu-result-images">{owner.images.map((image,index)=>image.attachment?<SavedImage key={index} attachment={image.attachment} loadImage={owner.loadImage}/>:null)}</div>;};
        return <Group {...props}><Original {...props} {...(props.t?{t:operationRowLocale(props.t,props.toolName,props.block)}:{})} {...(original.children?.['tool.call.images']?{renderSlot:images}:{})}/></Group>;
      }
      const{children,...options}=original.options;
      return { options: {...options,name:'tool.call.toolview',locale:original.locale,inject:original.inject,children:undefined,priority:(options.priority??0)-1}, component: GroupedTool };
  }));
  return Group;
}
