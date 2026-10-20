/** Native composer popup and keyboard arbitration; no document-wide key handler. */
export function installEntryPoints(ctx,{api,handlers,subscribe,states}){
  ctx.inject(['commandUi'],scope=>{
    const ui=scope.commandUi,decorations=new Map(),timers=new Set();
    const available=id=>{
      const session=ctx.sessions.binding(id)?.session.getSnapshot();
      return !!handlers.get(id)&&session&&!session.removed&&(!session.subagent||session.subagent.address.mode==='continuable');
    };
    const later=(id,run)=>{
      const timer=setTimeout(()=>{timers.delete(timer);if(available(id))run();},0);
      timers.add(timer);
    };
    const open=(id,pages=[undefined])=>{
      if(!available(id)||handlers.get(id).blocked())return;
      const popup=ui.popupFor(ctx.sessions.scope(id));
      popup.open('dsh-undo-picker',{
        searchLabels:()=>({placeholder:'搜索本页消息',empty:'还没有可撤回的用户消息',noResults:'本页没有匹配的消息'}),
        options:async(_,signal)=>{
          const result=await api('candidates',{sessionId:id,before:pages.at(-1)},false,signal);
          return [
            ...result.items.map(item=>({id:String(item.seq),label:item.text,badge:item.conversationOnly?'仅对话':undefined,detail:`消息 ${item.seq} · 撤回到发送之前`})),
            ...(pages.length>1?[{id:'newer',label:'较新的消息',detail:'返回上一页'}]:[]),
            ...(result.before!==null?[{id:`older:${result.before}`,label:'更早的消息',detail:'继续查看更早的 100 条'}]:[]),
          ];
        },
        onSelect:option=>{
          // Let the native picker close and restore focus before mounting a
          // confirmation or another page; the original draft is never replaced.
          later(id,()=>{
            if(option.id==='newer')open(id,pages.slice(0,-1));
            else if(option.id.startsWith('older:'))open(id,[...pages,Number(option.id.slice(6))]);
            else handlers.get(id)?.inspect({seq:Number(option.id)});
          });
        },
      },{sessionId:id},{via:'menu',span:{start:0,end:0,draftRev:-1}});
      // Negative draft revision intentionally cannot consume any user text.
    };
    const refresh=()=>{
      const owned=new Set([...states.values()].flatMap(state=>state.commands||[]));
      for(const name of ['rewind','undo']){
        if(!owned.has(name)||decorations.has(name))continue;
        try{decorations.set(name,ui.decorate({name,available:session=>available(session.sessionId),
          ui:{kind:'action',run:session=>later(session.sessionId,()=>name==='rewind'?open(session.sessionId):handlers.get(session.sessionId)?.inspect({undo:true}))},
        }));}catch(error){decorations.set(name,()=>{});scope.logger.warn(`/${name} UI unavailable: ${error.message}`);}
      }
    };
    const off=subscribe(refresh);refresh();
    scope.effect(()=>()=>{off();for(const timer of timers)clearTimeout(timer);for(const dispose of decorations.values())dispose();ui.dismiss('dsh-undo-picker');});
    scope.inject(['shortcuts'],keys=>{
      keys.effect(()=>keys.shortcuts.registerFixed({id:'dsh-undo.open',label:()=> '打开回退列表（会话空闲时）',keys:['Esc','Esc'],bindings:[{code:'Escape',modifiers:[]}],group:'input'}));
      keys.effect(()=>installRewindShortcut(keys.shortcuts,{
        resolve:context=>{
          const target=context.target,region=target?.closest('[data-conversation-region]');
          const occurrence=target?.closest('[data-conversation-session]'),id=occurrence?.dataset.conversationSession;
          if(!id||!region||!occurrence.contains(region)||!available(id)||handlers.get(id).blocked()
            ||target.closest('[data-approval-key],iframe,.xterm,[inert]'))return;
          const binding=ctx.sessions.binding(id);
          if(binding.session.getSnapshot().running||ui.popupFor(ctx.sessions.scope(id)).state.getSnapshot().open)return;
          return {id,region,binding,open:()=>open(id)};
        },
      }));
    });
  });
}

/** Two real presses in one idle occurrence; native overlays/stop keep priority. */
export function installRewindShortcut(shortcuts,{resolve}){
  let first,timer;
  const reset=()=>{first=undefined;clearTimeout(timer);};
  const off=shortcuts.observeFixedInput(event=>{
    if(event.type==='reset'){reset();return;}
    const {gesture:g,context}=event;
    if(g.code!=='Escape'||g.repeat||g.composing||g.defaultPrevented||g.control||g.alt||g.shift||g.meta||context.modal!==null||context.region==='terminal'){reset();return;}
    const target=resolve(context);
    if(!target){reset();return;}
    const previous=first;reset();
    if(previous&&performance.now()<=previous.deadline&&previous.id===target.id&&previous.binding===target.binding&&previous.region===target.region){
      event.consume();target.open();return;
    }
    first={...target,deadline:performance.now()+shortcuts.stopSequenceMs};timer=setTimeout(reset,shortcuts.stopSequenceMs);
  });
  return()=>{off();reset();};
}
