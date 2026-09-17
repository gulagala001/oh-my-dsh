import { decorateSlot } from './slot-decoration.mjs';
import {ComputerIcon} from './computer-icons.jsx';
import React, { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { computerGroups,processSummaries,operationSummary,operationIcon,operationState,operationRowLocale,finalAnswerPresentation,processContextKinds } from './computer-groups.mjs';
import {SavedImage} from './tool-image.jsx';

export function computerGroupPresentation(ctx) {
  const cache = new WeakMap(), processCache=new WeakMap(), open = new Set(), listeners = new Set();
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const groups = snapshot => {
    if (!cache.has(snapshot)) cache.set(snapshot, computerGroups(snapshot.order.map(key => snapshot.nodes.get(key)).filter(Boolean)));
    return cache.get(snapshot);
  };
  const emptyProcess = { label: operationSummary([]), icon: operationIcon([]), failures: 0, stopped: 0 };
  const process = (snapshot, turn) => {
    if (!processCache.has(snapshot)) processCache.set(snapshot, processSummaries(snapshot));
    return processCache.get(snapshot).get(turn) || emptyProcess;
  };
  function Group({ sessionId, useChat, nodeKey, callId, turnProcess, completedContext=false, children }) {
    const group = useChat(snapshot => groups(snapshot).get(nodeKey ?? `call:${callId}`));
    const identity = `${sessionId}:${group?.id}`;
    const expanded = useSyncExternalStore(subscribe, () => open.has(identity));
    const seat=useRef(null),wasFoldable=useRef(false),[hostGrouped,setHostGrouped]=useState(false),[visited,setVisited]=useState(false);
    const first=!!group&&(nodeKey?nodeKey===group.id:group.headerCallId===callId),foldable=!!turnProcess?.foldable||completedContext;
    const standalone=hostGrouped||foldable||!group;
    useLayoutEffect(()=>{if(expanded||standalone)setVisited(true);},[expanded,standalone]);
    useLayoutEffect(()=>{
      // Transfer the user's live disclosure choice once when the completed
      // turn takes over. Subsequent manual closing must never reopen it.
      if(foldable&&!wasFoldable.current&&first&&expanded)turnProcess?.setOpen(true);
      wasFoldable.current=foldable;
    },[foldable,first,expanded,turnProcess?.setOpen]);
    useLayoutEffect(()=>{
      const flow=seat.current?.closest('[data-chat-flow-kind]');if(!flow)return;
      const sync=()=>setHostGrouped(flow.hasAttribute('data-turn-process-member'));sync();
      const observer=new MutationObserver(sync);observer.observe(flow,{attributes:true,attributeFilter:['data-turn-process-member']});return()=>observer.disconnect();
    },[]);
    const toggle = () => { if (expanded) open.delete(identity); else open.add(identity); for (const notify of listeners) notify(); };
    const hidden=completedContext?!turnProcess.open:!standalone&&!first&&!expanded;
    return <div ref={seat} className={standalone?undefined:'tx-cu-group'} style={standalone?{display:'contents'}:undefined} data-cu-group={!standalone&&first?group.id:undefined} data-cu-group-hidden={hidden||undefined} data-cu-process-context={completedContext||undefined}>
      {!standalone&&first && <button key="summary" type="button" className="tx-cu-group-toggle" aria-expanded={expanded} title={group.title||undefined} onClick={toggle}>
        <ComputerIcon name={group.calls.length?operationIcon(group.names):'book'} size={16}/><strong>{group.calls.length?operationSummary(group.names,group.running):group.contexts?'上下文记录':'思考过程'}</strong>{group.calls.length>0&&<span>{group.calls.length} 次操作</span>}
        {group.failures>0&&<span className="tx-cu-error">{group.failures} 次失败</span>}
        {group.stopped>0&&<span>已停止</span>}
        <ComputerIcon className="tx-cu-disclosure" name="chevron" size={12}/>
      </button>}
      <div key="content" style={{display:standalone||expanded?'contents':'none'}}>{(standalone||expanded||visited)&&children}</div>
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
          const {label,icon,failures,stopped}=props.useChat(snapshot=>process(snapshot,props.node.data.turn));
          if(!props.turnProcess?.foldable||!props.node.data.toolCallCount)return <Original {...props}/>;
          return <button type="button" className="tx-cu-group-toggle" data-turn-process={props.node.data.turn} data-turn-process-tool-calls={props.node.data.toolCallCount} aria-expanded={props.turnProcess.open} title={props.node.data.toolCallCount+' 次工具调用'} onClick={()=>props.turnProcess.setOpen(!props.turnProcess.open)}><ComputerIcon name={icon} size={16}/><strong>{label}</strong>{failures>0&&<span className="tx-cu-error">{failures} 项失败</span>}{stopped>0&&<span>{stopped} 项已停止</span>}<ComputerIcon className="tx-cu-disclosure" name="chevron" size={12}/></button>;
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
    return () => { dispose(); open.clear(); listeners.clear(); };
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
