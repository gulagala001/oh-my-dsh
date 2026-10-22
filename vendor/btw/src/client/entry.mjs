/** Native trigger claims submit independently of the main conversation. */
export function installEntry(ctx, store) {
  const timers = new Set();
  const later = id => {
    const timer = setTimeout(() => { timers.delete(timer); store.open(id); }, 0);
    timers.add(timer);
  };
  const claim = id => ({
    name: 'btw', token: '/btw ', hint: '旁聊问题',
    attachments: false,
    async submit(args, _scope, attachments) {
      if (attachments?.length) return { kind: 'error', text: '旁聊只接收文字，附件已保留在主输入框' };
      try {
        if (args.trim()) await store.ask(id, args);
        later(id);
        return { kind: 'success' };
      } catch (error) { return { kind: 'error', text: error.message }; }
    },
  });
  ctx.effect(() => ctx.inputTriggers.registerSource({
    trigger: '/', name: 'btw-side-chat', order: -10, showGroupTitle: false,
    async candidates(_session, request) {
      if (request.position !== 'leading' || !'btw'.startsWith(request.query.toLowerCase())) return [];
      return [{ name: 'btw', label: '旁聊', description: '独立提问' }];
    },
    onPick({ session, span }) {
      const scope = ctx.sessions.scope(session.sessionId);
      if (scope.bail(scope, 'slash/input-consume-token', { guard: { kind: 'span', span } })) later(session.sessionId);
      return 'handled';
    },
    matchSpace: (session, token) => token === '/btw' ? { claim: claim(session.sessionId) } : undefined,
    matchClaim: async (session, token) => token === '/btw' ? claim(session.sessionId) : undefined,
    async matchEnter(session, line, signal, envelope) {
      if (!/^\/btw(?:\s|$)/.test(line)) return;
      signal.throwIfAborted();
      if (envelope.attachments) throw Error('旁聊只接收文字，附件已保留在主输入框');
      return { claim: claim(session.sessionId) };
    },
    lexicon: () => ['btw'],
  }));
  ctx.effect(() => () => { for (const timer of timers) clearTimeout(timer); });
}
