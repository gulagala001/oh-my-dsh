import {createUserMessage}from'@deepseek-ai/dsh-llm';

export const RUNTIME_CONTEXT_NOTICE='[Computer Use runtime status] The JavaScript runtime is fresh after a stop, reset, timeout, disposal, or server restart. Variables and application/browser handles from earlier calls are no longer available, even though the conversation history remains. On the next computer_use call, bind the existing target again with cua.getApp or cua.getTab (use cua.getState to find it when needed), read its current state, and then continue. Do not create a replacement tab or replay completed actions merely to restore a binding. Do not reuse old element IDs or resend already completed messages. Existing API documentation remains valid; reread it with cua.rewriteDocumentation(topic) when needed. If control is stopped, wait for the user to resume it; this notice does not authorize resuming control.';

export function announceFreshComputerRuntime(manager,session){
  const runtime=manager.sessions.get(session.id)?.runtime;
  if(runtime?.worker)return false;
  const generation=runtime?.generation??0;
  manager.runtimeContextSeen??=new Map();
  if(manager.runtimeContextSeen.get(session.id)===generation)return false;
  if(!session.snapshotEvents().some(event=>event.type==='tool/call'&&['computer_use','computer_use_reset'].includes(event.data?.name)))return false;
  session.append('user/message',createUserMessage({content:[{type:'text',text:RUNTIME_CONTEXT_NOTICE}],source:{kind:'plugin:trisoul-x:computer-use-runtime'}}),{surfaceOp:'append'});
  manager.runtimeContextSeen.set(session.id,generation);return true;
}
