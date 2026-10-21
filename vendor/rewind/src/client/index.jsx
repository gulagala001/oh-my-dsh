import React, {useState,useEffect,useLayoutEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {Button,Modal,Tooltip} from '@deepseek-ai/dsh-client-ui-primitives';
import {decorateSlotComponent} from './slot-decoration.mjs';
import {acquireShared} from '../shared.mjs';
import {installEntryPoints} from './entry-points.mjs';
export const name='dsh-undo-plugin-client';
export const inject=['slots','sessions','conversation'];
const EMPTY={revision:0,hiddenRanges:[],undoAvailable:false};
const contains=(ranges,seq)=>Number.isFinite(seq)&&ranges.some(r=>seq>=r.start&&seq<=r.end);
async function api(operation,data,raw=false,signal){const r=await fetch(`/api/dsh-rewind/${operation}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});if(raw&&r.ok)return r;const value=await r.json();if(!r.ok)throw Error(value.error||'撤回操作失败');return value;}
export function install(ctx){
  const states=new Map(),listeners=new Set(),attachmentBytes=new Map(),handlers=new Map();
  const update=(id,value)=>{if((states.get(id)?.revision??-1)>(value.revision??-1))return;if(JSON.stringify(states.get(id))===JSON.stringify(value))return;states.set(id,value);for(const fn of listeners)fn();};
  const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
  installEntryPoints(ctx,{api,handlers,subscribe,states});
  const useStateOf=id=>useSyncExternalStore(subscribe,()=>states.get(id)||EMPTY);
  const load=async id=>{try{update(id,await api('state',{sessionId:id}));}catch(error){update(id,{...(states.get(id)||EMPTY),error:error.message});}};
  const input=id=>ctx.conversation.input.for(ctx.sessions.scope(id));
  const blocked=(node,ranges)=>contains(ranges,node?.anchorSeq??node?.data?.seq);
  const projectionAdapter=(props,state)=>{
    const cache=new Map();
    return key=>{const value=props.useProjection(key),old=cache.get(key);if(old&&old.input===value)return old.output;let output=value;
      if(key==='turnOutline'&&Array.isArray(value))output=value.filter(t=>!state.hiddenTurns?.includes(t.turn));
      if(key==='sessionStats'&&value)output={...value,turns:Math.max(0,value.turns-(state.hiddenTurns?.length||0)),steps:Math.max(0,value.steps-(state.hiddenSteps||0))};
      cache.set(key,{input:value,output});return output;
    };
  };
  ctx.slots.inject('conversation.view',()=>decorateSlotComponent(ctx.slots,'conversation.view',()=>true,original=>{
    const Original=original.component;
    return function RewindView(props){
      const state=useStateOf(props.sessionId),useProjection=useMemo(()=>projectionAdapter(props,state),[props.useProjection,state]);
      const transform=useMemo(()=>{const cache=new WeakMap();return snapshot=>({...snapshot,navigation:{...snapshot.navigation,items:()=>{const items=snapshot.navigation.items();if(!cache.has(items))cache.set(items,items.filter(t=>!state.hiddenTurns?.includes(t.turn)));return cache.get(items);}}});},[state]);
      const useChat=selector=>props.useChat(snapshot=>selector(transform(snapshot)));
      return <Original {...props} useProjection={useProjection} useChat={useChat}/>;
    };
  }));
  ctx.slots.inject('conversation.composer.dock',()=>decorateSlotComponent(ctx.slots,'conversation.composer.dock',()=>true,original=>{
    const Original=original.component;
    return function RewindStats(props){const state=useStateOf(props.sessionId),useProjection=useMemo(()=>props.useProjection?projectionAdapter(props,state):undefined,[props.useProjection,state]);return <Original {...props} {...(useProjection?{useProjection}:{})}/>;};
  }));
  ctx.slots.inject('conversation.chat.flow',()=>decorateSlotComponent(ctx.slots,'conversation.chat.flow',()=>true,original=>{
    const Original=original.component;
    return function RewindFlow(props){
      const state=useStateOf(props.sessionId),nodes=props.useChat(s=>s.nodes),ranges=state.hiddenRanges;
      const useChatGroup=(key,selector)=>props.useChatGroup(key,group=>{
        if(!group)return selector(group);
        const members=group.members.filter(m=>!blocked(nodes.get(m.key),ranges));
        return selector(members.length?{...group,members}:undefined);
      });
      const entries=ranges.length?props.entries.filter(e=>e.kind!=='node'||!blocked(nodes.get(e.key),ranges)):props.entries;
      return <Original {...props} entries={entries} useChatGroup={useChatGroup}/>;
    };
  }));
  function Controls(props){
    const id=props.sessionId,state=useStateOf(id),nodesRef=useRef();
    nodesRef.current=props.useChat(s=>s.nodes);
    const [targets,setTargets]=useState([]),[dialog,setDialog]=useState(null),[plan,setPlan]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[pendingDraft,setPendingDraft]=useState(null);
    useEffect(()=>{setPendingDraft(state.pendingDraft?.draft||null);},[state.pendingDraft]);
    useEffect(()=>{void load(id);let timer;const source=ctx.sessions.binding(id).eventSource;
      let lastSeq=source.getSnapshot().entries.at(-1)?.event?.seq??-1;
      const unsub=source.subscribe(()=>{const entries=source.getSnapshot().entries;let changed=false;for(let i=entries.length-1;i>=0;i--){const e=entries[i].event||entries[i];if(e.seq<=lastSeq)break;if(e.type==='plugin:dsh-rewind-plus/commit')changed=true;}lastSeq=(entries.at(-1)?.event||entries.at(-1))?.seq??lastSeq;if(changed){clearTimeout(timer);timer=setTimeout(()=>void load(id),60);}});
      return()=>{clearTimeout(timer);unsub();};},[id]);
    useLayoutEffect(()=>{
      let queued=false,disposed=false;
      const scan=()=>{queued=false;if(disposed)return;const found=[];
        for(const row of document.querySelectorAll('[data-chat-anchor-key][data-chat-flow-kind="user"],[data-chat-anchor-key][data-chat-flow-kind="steering"]')){
          if(row.closest('[data-conversation-session]')?.dataset.conversationSession!==id)continue;
          const node=nodesRef.current.get(row.dataset.chatAnchorKey),seq=node?.data?.seq??node?.anchorSeq,container=row.querySelector('[data-clock="start"]');
          if(container&&Number.isSafeInteger(seq)&&!contains(state.hiddenRanges,seq))found.push({container,seq});
        }
        setTargets(old=>old.length===found.length&&old.every((x,i)=>x.container===found[i].container&&x.seq===found[i].seq)?old:found);
      };
      const rowSelector='[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]';
      const observer=new MutationObserver(records=>{if(!queued&&records.some(r=>r.target.matches?.('[data-clock="start"]')||[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.(rowSelector)||n.querySelector?.(rowSelector))))){queued=true;queueMicrotask(scan);}});observer.observe(document.body,{childList:true,subtree:true});scan();
      return()=>{disposed=true;observer.disconnect();};
    },[id,state.hiddenRanges]);
    const inspect=async(next=dialog)=>{setDialog(next);setPlan(null);setError('');setBusy(true);try{setPlan(await api(next.undo?'undo-preview':'preview',{sessionId:id,messageSeq:next.seq}));}catch(e){setError(e.message);}finally{setBusy(false);}};
    const actionsRef=useRef();actionsRef.current={inspect,blocked:()=>!!dialog||busy};
    useEffect(()=>{const handler={inspect:next=>actionsRef.current.inspect(next),blocked:()=>actionsRef.current.blocked()};handlers.set(id,handler);return()=>{if(handlers.get(id)===handler)handlers.delete(id);ctx.get('commandUi')?.dismiss('dsh-undo-picker');};},[id]);
    const restore=async(draft,expectedRev)=>{
      const shell=input(id),current=shell.state.getSnapshot();
      if(current.draftRev!==expectedRev){setPendingDraft(draft);throw Error('输入框在操作期间有新编辑，已保留草稿。可点击“回填撤回内容”重试。');}
      let attachments=[];
      if(draft.attachmentIds){
        attachments=ctx.conversation.resolveDraftAttachments(draft.attachmentIds);
        if(attachments.length!==draft.attachmentIds.length)throw Error('原草稿附件已不在浏览器中，请重新添加；文字仍保留。');
      }else if(draft.attachments?.length){
        const files=[];
        for(const item of draft.attachments){const key=`${id}:${draft.seq}:${item.contentIndex}`;const blob=attachmentBytes.get(key)||await api('attachment',{sessionId:id,messageSeq:draft.seq,index:item.contentIndex},true).then(r=>r.blob());attachmentBytes.delete(key);files.push(new File([blob],item.attachment?.name||`attachment-${item.contentIndex}`,{type:blob.type}));}
        attachments=ctx.conversation.createDrafts(id,files);
      }
      if(shell.state.getSnapshot().draftRev!==expectedRev){setPendingDraft(draft);throw Error('输入框已改变，撤回内容已保留待回填。');}
      if(['adjudicating','submitting'].includes(shell.state.getSnapshot().phase))throw Error('输入框正在发送，请稍后回填');
      shell.pruneAttachments([]);shell.setDraft(draft.text||'');
      if(!shell.addAttachments(attachments.map(a=>a.id)))throw Error('附件暂时不能回填，请重试');
      shell.persistDraft?.();setPendingDraft(null);const receipt=states.get(id)?.pendingDraft;if(receipt)update(id,await api('ack',{sessionId:id,draftToken:receipt.id}));
    };
    const confirm=async()=>{setBusy(true);setError('');const shell=input(id),before=shell.state.getSnapshot();
      try{
        // Fetch every original attachment before changing either conversation or files.
        if(plan.target?.attachments?.length)for(const item of plan.target.attachments)attachmentBytes.set(`${id}:${plan.target.seq}:${item.contentIndex}`,await api('attachment',{sessionId:id,messageSeq:plan.target.seq,index:item.contentIndex},true).then(r=>r.blob()));
        const result=await api(dialog?.undo?'undo':'apply',{sessionId:id,planId:plan.planId,draft:{text:before.draft,attachmentIds:before.attachmentIds}});
        update(id,result.state);setPendingDraft(result.draft);if(result.draft)await restore(result.draft,before.draftRev);setDialog(null);
      }catch(e){setError(e.message);void load(id);}finally{attachmentBytes.clear();setBusy(false);}
    };
    const action=<><span data-rewind-plus-status>{state.undoAvailable&&<Button size="sm" variant="ghost" onClick={()=>inspect({undo:true})}>撤销撤回</Button>}
      {pendingDraft&&<Button size="sm" variant="ghost" onClick={()=>{void restore(pendingDraft,input(id).state.getSnapshot().draftRev).catch(e=>setError(e.message));}}>回填撤回内容</Button>}
      {state.error&&<Button size="sm" variant="ghost" onClick={()=>{void api('recover',{sessionId:id}).then(result=>update(id,result.state)).catch(()=>load(id));}} title={state.error}>恢复中断操作 · 重试</Button>}
      {!dialog&&error&&<span role="alert">{error}</span>}</span>
      {targets.map(({container,seq})=>createPortal(<Tooltip label="撤回到发送此消息之前" side="bottom"><button type="button" className={container.querySelector('button')?.className} aria-label="撤回" data-rewind-plus-action onClick={()=>inspect({seq})}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" transform="translate(0 -2)"/></svg></button></Tooltip>,container,`${id}:${seq}`))}
      <Modal open={!!dialog} title={dialog?.undo?'撤销撤回':'撤回到这条消息之前'} closeLabel="取消" onClose={()=>{if(!busy)setDialog(null);}} footer={<><Button variant="ghost" disabled={busy} onClick={()=>setDialog(null)}>取消</Button><Button variant="primary" disabled={busy||!plan?.canApply} onClick={confirm}>{busy?'处理中…':dialog?.undo?'确认恢复':'确认撤回'}</Button></>}>
        {busy&&!plan&&<p>正在检查对话和文件…</p>}
        {plan&&dialog&&<><p>{dialog?.undo?'恢复撤回前的对话和文件，继续留在当前会话。':'这条消息及其之后的内容将撤回，原内容回填输入框。当前草稿暂存，可通过撤销恢复。'}</p>
          {!dialog.undo&&plan.target&&<p>选中消息：{plan.target.text.slice(0,240)||'（附件消息）'}{plan.target.text.length>240?'…':''}</p>}
          <p><code>{plan.workspace}</code></p><p>{plan.conversationOnly?'仅撤回对话：此消息没有可用的文件备份。':`恢复 ${plan.files.length} 个文件。`}</p>
          <div style={{maxHeight:240,overflow:'auto'}}>{plan.files.map(f=><div key={f.path}><code>{f.path}</code> · {({delete:'移除新增文件',restore:'找回文件',modify:'恢复原内容'})[f.kind]}</div>)}</div>
          {plan.warnings.map((w,i)=><p key={i} style={{fontSize:12,opacity:.75}}>{w}</p>)}
          {plan.reason&&<p role="alert">{plan.reason}</p>}
          {!plan.canApply&&<Button disabled={busy} onClick={async()=>{setBusy(true);try{await api('stop',{sessionId:id});await inspect();}catch(e){setError(e.message);setBusy(false);}}}>停止当前会话并重新检查</Button>}</>}
        {error&&<p role="alert">{error}</p>}
      </Modal></>;
    return action;
  }
  ctx.slots.register({name:'conversation.session.header.actions',id:'dsh-rewind-plus-controls',order:95},props=><Controls key={props.sessionId} {...props}/>);
}
export const apply=ctx=>acquireShared(ctx,'client',{name,inject,apply:install});
