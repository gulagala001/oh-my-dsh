import { appendPluginRecord } from '@deepseek-ai/dsh-session';

export const PERSONA_SNAPSHOT = 'plugin:dsh-persona/prompt';
export const STYLE_SNAPSHOT = 'plugin:oh-my-dsh/prompt-style';

// Native records follow the exact fork prefix, cold resume and history edits.
// They never enter the model-visible message surface.
export function readPromptSnapshot(session, type, before = session?.seq) {
  const direct = typeof session?.eventAt === 'function' && Number.isSafeInteger(session.seq);
  const events = direct ? null : session?.snapshotEvents?.() ?? [], length = direct ? session.seq : events.length;
  for (let index = Math.min(before ?? length, length) - 1; index >= 0; index--) {
    const event = direct ? session.eventAt(index) : events[index];
    if (event?.type !== type || event.ignorable !== true || event.data?.version !== 1) continue;
    const value = event.data.value;
    if (type === PERSONA_SNAPSHOT && (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.entries(value).some(([key, text]) => !['identity', 'style', 'communication', 'presentation'].includes(key) || typeof text !== 'string'))) continue;
    if (type === STYLE_SNAPSHOT && typeof value !== 'string') continue;
    return value;
  }
}

export function writePromptSnapshot(session, type, value) {
  if (typeof session?.snapshotEvents !== 'function' || typeof session.append !== 'function') return false;
  if (JSON.stringify(readPromptSnapshot(session, type)) !== JSON.stringify(value)) {
    appendPluginRecord(session, type, { version: 1, value });
  }
  return true;
}
