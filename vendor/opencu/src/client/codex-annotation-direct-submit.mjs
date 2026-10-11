export async function submitScopedAnnotation(ctx,sessionId,{attachmentIds,signal}) {
  signal?.throwIfAborted();
  if(!Array.isArray(attachmentIds)||!attachmentIds.length||attachmentIds.some(id=>typeof id!=='string'||!id)||new Set(attachmentIds).size!==attachmentIds.length)throw new Error('The direct annotation attachments are unavailable.');
  const session=ctx.get('sessions')?.binding(sessionId)?.session;
  const conversation=ctx.get('conversation');
  if(!session||session.sessionId!==sessionId||typeof conversation?.sendSession!=='function')throw new Error('The annotation conversation is no longer available.');
  const snapshot=session.getSnapshot();
  if(snapshot.removed||snapshot.subagent?.address.mode==='continuable'&&snapshot.subagent.parentAvailable!==true)throw new Error('The annotation conversation cannot accept this message.');
  // Direct mode sends only these drafts and never commits the user's composer.
  const outcome=await conversation.sendSession(session,'',[...attachmentIds],'queue',signal);
  if(outcome?.kind!=='success'&&outcome?.kind!=='error')throw new Error('The host did not confirm the annotation submission.');
  return outcome;
}
