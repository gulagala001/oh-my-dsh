import { createHash } from 'node:crypto';
import { documentationTopic } from './api-docs.mjs';

const topics = ['core', 'browser', 'app', 'recovery', 'files', 'screenshots', 'webmcp', 'network'];
export function documentationKey(topic, text) {
  return topic + ':' + createHash('sha256').update(text).digest('hex');
}
export function documentationKeyForText(text, platform = process.platform) {
  if (typeof text !== 'string') return undefined;
  for (const topic of topics) {
    const installed = documentationTopic(topic, platform);
    if (text === installed) return documentationKey(topic, installed);
  }
}

// Restore only text that the current model request actually contains. A prior
// log result is evidence of its producer, not evidence that it is still visible
// after compaction. User messages and generated summaries cannot mark docs sent.
export function visibleDocumentationKeys(session, messages, platform = process.platform) {
  const events = session.snapshotEvents(), calls = new Map(), results = new Map(), dispatched = new Map();
  for (const event of events) {
    if (event.type === 'tool/call' && event.data?.callId) calls.set(event.data.callId, event.data.name);
    if (event.type === 'assistant/message' && event.data?.message?.source?.kind === 'model') {
      for (const block of event.data.message.content || []) if (block.type === 'tool-call') calls.set(block.id, block.name);
    }
    if (event.type === 'tool/result') {
      const message = event.data?.message;
      if (message?.id) results.set(message.id, message);
    }
    if (event.type === 'tool/ptc-dispatch' && event.data?.name === 'computer_use') {
      for (const block of event.data.content || []) {
        if (block.type !== 'text') continue;
        const key = documentationKeyForText(block.text, platform);
        if (!key) continue;
        for (const callId of [event.data.parentCallId,event.data.rootCallId].filter(Boolean)) {
          if (!dispatched.has(callId)) dispatched.set(callId, new Map());
          dispatched.get(callId).set(key, block.text);
        }
      }
    }
  }
  const trustedDocs = new Map();
  for (const original of results.values()) {
    if (original.role !== 'tool' || original.source?.kind !== 'tool'
      || original.source.callId !== original.toolCallId || calls.get(original.toolCallId) !== 'computer_use') continue;
    for (const block of original.content || []) {
      if (block.type !== 'text') continue;
      const key = documentationKeyForText(block.text, platform);
      if (key) trustedDocs.set(key, block.text);
    }
  }
  for (const texts of dispatched.values()) for (const [key,text] of texts) trustedDocs.set(key,text);
  const found = new Set();
  for (const message of messages || []) {
    const original = results.get(message.id);
    const callId = message.source?.callId;
    if (!['tool','user'].includes(message.role) || message.source?.kind !== 'tool' || !original
      || !callId || original.source?.kind !== 'tool' || original.toolCallId !== callId
      || original.source.callId !== callId || !calls.has(callId)
      || message.role === 'tool' && message.toolCallId !== callId) continue;
    // Some host route projections combine historical tool results into one
    // user-role context message. Its stable first-result identity and tool
    // source remain trustworthy; ordinary user/summarizer sources do not.
    if (message.role === 'user') {
      for (const block of message.content || []) if (block.type === 'text') {
        for (const [key,text] of trustedDocs) {
          if (block.text.includes(text) || block.text.includes(JSON.stringify(text).slice(1,-1))) found.add(key);
        }
      }
      continue;
    }
    for (const block of message.content || []) {
      if (block.type !== 'text' || !original.content?.some(saved => saved.type === 'text' && saved.text === block.text)) continue;
      if (calls.get(message.toolCallId) === 'computer_use') {
        const key = documentationKeyForText(block.text, platform);
        if (key) found.add(key);
      }
      // PTC can print the child result as JSON instead of attaching each child
      // block directly. Its dispatch log proves the CU producer; the outer
      // result must still contain the complete installed text in this request.
      for (const [key,text] of dispatched.get(message.toolCallId) || []) {
        if (block.text.includes(text) || block.text.includes(JSON.stringify(text).slice(1,-1))) found.add(key);
      }
    }
  }
  return found;
}

export function updateDocumentationContext(shared, session, messages) {
  const state = shared.documentationState(session.id);
  const platform = shared.computerUse.native?.platform ?? process.platform;
  const visible = visibleDocumentationKeys(session, messages, platform);
  state.clear();
  for (const key of visible) state.add(key);
  return state;
}
