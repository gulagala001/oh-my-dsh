// No UI contributions or substitutions. Read the real public registry faces.
window.__ModuleLoader__.load({ id: 'omd-desktop-host-boot-observer', factory: require => {
  // These three identities are in the fixed official shell seed table.
  const cordis = require('@deepseek-ai/cordis');
  const seeds = {
    '@deepseek-ai/dsh-client-ui-slots': require('@deepseek-ai/dsh-client-ui-slots'),
    '@deepseek-ai/dsh-client-ui-primitives': require('@deepseek-ai/dsh-client-ui-primitives'),
  };
  return {
    inject: ['slots', 'loader', 'modules', 'uiWorkspace', 'uiSession', 'sessions'],
    apply(ctx) {
      ctx.inject(['uiConversation'], scope => {
        const observe = async () => {
          const modules = scope.modules, rows = modules.manifest.modules;
          const current = scope.uiSession.adapter.current.getSnapshot();
          const sessionId = current.props.sessionId;
          const binding = sessionId === undefined ? undefined : scope.sessions.binding(sessionId);
          const session = binding?.session.getSnapshot();
          const summary = sessionId === undefined ? undefined : scope.sessions.list.getSnapshot().byId[sessionId];
          const renderer = await modules.import('@deepseek-ai/dsh-client-ui-renderer', '', {});
          const originalConversation = scope.uiConversation[cordis.symbols.original] || scope.uiConversation;
          const ancestry = [], seen = new Set();
          let fiber = originalConversation.ctx.fiber;
          while (fiber && !seen.has(fiber)) {
            seen.add(fiber); ancestry.push(fiber); fiber = fiber.parent?.fiber;
          }
          const conversationOwners = {};
          for (const id of ['@deepseek-ai/dsh-client-ui-conversation', 'trisoul_x']) {
            const callback = modules.loadCache.get(id)?.exports?.apply;
            conversationOwners[id] = typeof callback === 'function'
              && ancestry.some(owner => owner.state === 2 && owner.runtime?.callback === callback);
          }
          const seedIdentity = {};
          for (const [name, exports] of Object.entries(seeds)) {
            seedIdentity[name] = { sameAsFactory: await modules.import(name, '', {}) === exports,
              validExports: name === '@deepseek-ai/dsh-client-ui-slots'
                ? typeof exports.SlotCore === 'function' && typeof exports.standardHookPropName === 'function'
                : typeof exports.Menu === 'function',
              dynamicRow: rows.some(row => row.id === name) };
          }
          return {
            navigation: { sessionId, bindingKey: current.key, boundSessionId: session?.sessionId,
              agentPreset: binding?.session.projections.faceOf('agentPreset').getSnapshot(), cwd: summary?.cwd,
              blank: session?.blank, listedBlank: summary?.blank, openState: session?.openState, running: session?.running,
              promptAttempted: session?.promptAttempted, pendingSubmissions: session?.pendingSubmissions.length,
              mainViewReferences: sessionId === undefined ? 0 : scope.sessions.retainInfo(sessionId).getSnapshot().retainedBy.mainView,
              eventTypes: binding?.eventSource.getSnapshot().entries.filter(row => row.type === 'event').map(row => row.event.type) },
            identity: { shellProtocol: window.dshDesktop?.protocolVersion, moduleSystem: modules.version,
              release: modules.manifest.release, rev: modules.manifest.rev,
              bootRelease: window.__DSH_BOOT__?.release, bootRev: window.__DSH_BOOT__?.rev,
              seeds: seedIdentity,
              conversationOwners,
              services: { moduleTableIsLoader: modules === scope.loader.internal,
                rootUsesShellCordis: scope.root instanceof cordis.Context, slotsUsesShellCordis: scope.slots instanceof cordis.Service,
                slotsUsesDynamicRenderer: scope.slots instanceof renderer.SlotRegistry },
              dynamic: rows.map(row => ({ id: row.id, url: row.url, rev: row.rev,
                cachedId: modules.loadCache.get(row.id)?.id, materialized: modules.loadCache.has(row.id) })) },
            events: scope.uiConversation.events.entries().map(row => ({ kind: row.kind, target: row.target })),
            views: scope.uiConversation.views.entries().map(row => row.target),
            slots: scope.slots.snapshot(),
            entries: [...scope.loader.entries()].map(row => ({ name: row.options.name, state: row.fiber?.state })),
          };
        };
        // Public navigation only. Its return value is not acceptance evidence:
        // the runner checks actual current scope, binding and rendered controls.
        const openSession = id => scope.uiWorkspace.openSession(id);
        scope.effect(() => {
          window.__OMD_DESKTOP_HOST_BOOT__ = observe;
          window.__OMD_DESKTOP_OPEN_SESSION__ = openSession;
          return () => {
            if (window.__OMD_DESKTOP_HOST_BOOT__ === observe) delete window.__OMD_DESKTOP_HOST_BOOT__;
            if (window.__OMD_DESKTOP_OPEN_SESSION__ === openSession) delete window.__OMD_DESKTOP_OPEN_SESSION__;
          };
        });
      });
    },
  };
} });
