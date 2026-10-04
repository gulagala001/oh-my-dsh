// Keep side questions at session level so an active turn's process drawer
// cannot hide their status or answer. Both views read the same command ledger.
export const btwRecordDefinition = {
  kind: 'omd-btw', target: 'chat',
  match: event => event.type === 'command/run' && event.data.name === 'btw'
    ? { id: String(event.data.commandId), role: 'start' }
    : event.type === 'command/done' ? { id: String(event.data.commandId), role: 'update' } : null,
  start: (_context, match) => ({ seq: match.event.seq, question: match.event.data.args ?? '', outcome: null }),
  update: (context, match) => context.state ? { ...context.state, outcome: match.event.data } : undefined,
  buildViewNode: context => context.state ? {
    key: context.key, id: context.id, kind: 'omd-btw', target: 'chat',
    anchorSeq: context.state.seq, location: { kind: 'session' }, visibility: 'visible', data: context.state,
  } : null,
};
