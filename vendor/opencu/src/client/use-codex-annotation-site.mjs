import {useEffect,useRef,useState} from 'react';

const identityFor=(sessionId,browserId,tabId,loaderId)=>JSON.stringify([sessionId,browserId,tabId,loaderId]);
const stateMatches=(state,context)=>state?.tabId===context.tabId&&state?.loaderId===context.loaderId&&Number.isSafeInteger(state.revision)&&state.revision>=0;

// Site requests are bound to a real streamed document, not a URL or screenshot.
export function useCodexAnnotationSite({api,sessionId,frame,browserId,tabId,scope,available,editorOpen,hasActiveEditor,onControl,onError}){
  const loaderId=frame?.tabId===tabId?frame.loaderId:undefined,identity=identityFor(sessionId,browserId,tabId,loaderId);
  const [received,setReceived]=useState(null),[responding,setResponding]=useState(null);
  const current=useRef(null),stateTail=useRef(Promise.resolve()),lastSync=useRef(null),responseController=useRef(null);
  current.current={identity,api,sessionId,browserId,tabId,loaderId,scope,available,editorOpen,hasActiveEditor,onControl,onError};
  const matches=context=>current.current.identity===context.identity;
  const accept=(result,context)=>{
    if(!matches(context))return;
    current.current.onControl(result);
    const next=result.siteAnnotationState;
    if(stateMatches(next,context))setReceived(previous=>previous?.identity===context.identity&&previous.state.revision>=next.revision?previous:{identity:context.identity,state:next});
  };
  const call=async(action,values={},signal)=>{
    const context=current.current;
    if(!context.api||!context.loaderId)throw new DOMException('网页批注请求已经失效','AbortError');
    const result=await context.api('annotation-site',context.sessionId,{...context.scope(),loaderId:context.loaderId,...values,action},signal);
    if(!matches(context)||signal?.aborted)throw new DOMException('网页批注请求已经失效','AbortError');
    accept(result,context);return result;
  };
  const sync=()=>{
    const context=current.current,actual=context.scope();
    if(!context.api||!context.loaderId||!actual.actor)return Promise.resolve(null);
    const values={...actual,loaderId:context.loaderId,available:context.available,editorOpen:context.editorOpen,hasActiveEditor:context.hasActiveEditor,interactionMode:context.editorOpen?'comment':'browse',action:'state'};
    const key=JSON.stringify([context.identity,values]);
    if(lastSync.current?.key===key)return lastSync.current.work;
    const work=stateTail.current.catch(()=>{}).then(async()=>{
      if(!matches(context))throw new DOMException('网页批注状态已经失效','AbortError');
      const result=await context.api('annotation-site',context.sessionId,values);
      if(!matches(context))throw new DOMException('网页批注状态已经失效','AbortError');
      accept(result,context);return result;
    });
    lastSync.current={key,work};stateTail.current=work.catch(()=>{});
    void work.catch(()=>{if(lastSync.current?.work===work)lastSync.current=null;});return work;
  };
  const local=received?.identity===identity?received.state:null,incoming=stateMatches(frame?.siteAnnotationState,current.current)?frame.siteAnnotationState:null;
  const state=incoming&&(!local||incoming.revision>=local.revision)?incoming:local;
  const permission=available?state?.permission:null;
  const respond=async allow=>{
    const context=current.current;
    if(!permission||responseController.current||!context.available)return false;
    const controller=new AbortController();responseController.current=controller;setResponding({identity,id:permission.id});
    try{
      await call('respond',{id:permission.id,allow},controller.signal);return true;
    }catch(error){if(matches(context)&&!controller.signal.aborted&&error.name!=='AbortError')current.current.onError(error.message);return false;}
    finally{if(responseController.current===controller){responseController.current=null;setResponding(null);}}
  };
  useEffect(()=>{
    void sync().catch(error=>{if(error.name!=='AbortError'&&error.code!=='VIEW_CHANGED'&&current.current.identity===identity)current.current.onError(error.message);});
  },[identity,available,editorOpen,hasActiveEditor,frame?.actor,frame?.controlEpoch]);
  useEffect(()=>{
    const context=current.current,actual=context.scope();
    setReceived(null);setResponding(null);
    return()=>{
      responseController.current?.abort();responseController.current=null;
      if(context.api&&context.loaderId&&actual.actor){const work=stateTail.current.catch(()=>{}).then(()=>context.api('annotation-site',context.sessionId,{...actual,loaderId:context.loaderId,action:'state',available:false,editorOpen:false,hasActiveEditor:false,interactionMode:'browse'}));stateTail.current=work.catch(()=>{});}
    };
  },[identity]);
  useEffect(()=>{if(!available)responseController.current?.abort();},[available]);
  return{identity,state,permission,permissionBusy:responding?.identity===identity&&responding.id===permission?.id,respond,call,sync};
}
