// Finite compatibility for the retired TriSoul writer. The original V0 file
// remains the read-only archive, including raw reasoning and task-ledger extras.
// Never recursively strip fields from user text, tool arguments or attachments.
export function normalizeLegacyV0Row(input) {
  const row = structuredClone(input), data = row.data;
  if (!data || typeof data !== 'object') return row;
  if (row.type === 'permission/preset' && ['default', 'inferred'].includes(data.origin)) delete data.origin;
  if (row.type === 'subagent/descriptor' && data.version === 2 && ['one-shot', 'continuable'].includes(data.mode)
    && Object.keys(data).every(key => ['version', 'mode', 'provider', 'label', 'agentProvider', 'agentModel', 'agentReasoningEffort', 'persona', 'toolFilter'].includes(key))) data.version = 3;
  if (row.type === 'todo/write' && Array.isArray(data.excerpts) && Array.isArray(data.tasks)
    && ['nextE', 'nextT', 'nextL'].every(key => Number.isSafeInteger(data[key]) && data[key] >= 0)) {
    for (const key of ['excerpts', 'tasks', 'nextE', 'nextT', 'nextL']) delete data[key];
    if (typeof data.quiet === 'boolean') delete data.quiet;
  }
  const block = value => {
    if (value?.type !== 'reasoning' || !['distilled', 'note'].includes(value.trisoul)) return;
    delete value.trisoul;
    for (const key of ['raw', 'note']) if (typeof value[key] === 'string') delete value[key];
  };
  const message = value => { if (Array.isArray(value?.content)) value.content.forEach(block); };
  // The retired pi-ai v1 blob is not the current {response, blocks} replay
  // envelope. Do not feed it back to today's provider as valid replay state.
  const replay = value => { if (value?.replayState?.kind === 'pi-ai' && value.replayState.version === 1) delete value.replayState; };
  if (row.type === 'assistant/message') { message(data.message); replay(data.message?.source); }
  if (row.type === 'assistant/chunk') { block(data.chunk?.block); if (data.chunk?.type === 'finish') replay(data.chunk); }
  return row;
}
