// No UI contributions or substitutions. Read the real public registry faces.
window.__ModuleLoader__.load({ id: 'omd-desktop-rc1-slot-observer', factory: require => {
  // These three identities are in the fixed official shell seed table.
  const cordis = require('@deepseek-ai/cordis');
  const seeds = {
    '@deepseek-ai/dsh-client-ui-slots': require('@deepseek-ai/dsh-client-ui-slots'),
    '@deepseek-ai/dsh-client-ui-primitives': require('@deepseek-ai/dsh-client-ui-primitives'),
  };
  return {
    inject: ['slots', 'loader', 'modules'],
    apply(ctx) {
      // Synchronous public supervision: no substitution, error clearing or retry.
      const timeline = [], crashes = [], registrationIds = new WeakMap();
      let nextRegistrationId = 0, sequence = 0, dropped = 0;
      const original = value => value?.[cordis.symbols.original] || value;
      const fiberInfo = fiber => {
        const ancestry = [], seen = new Set();
        while (fiber && !seen.has(fiber)) {
          seen.add(fiber);
          ancestry.push({ uid: fiber.uid, state: fiber.state,
            name: fiber.runtime?.name ?? fiber.runtime?.callback?.name });
          fiber = fiber.parent?.fiber;
        }
        return ancestry;
      };
      const serviceInfo = context => {
        try {
          const active = context?.get('conversation'), raw = context?.get('conversation', false);
          return { activePresent: active !== undefined, rawPresent: raw !== undefined,
            provider: fiberInfo(original(raw)?.ctx?.fiber) };
        } catch (error) { return { readError: String(error) }; }
      };
      const state = () => {
        try {
          const ui = original(ctx.get('uiConversation', false));
          return { manifestRev: ctx.modules.manifest.rev,
            rootConversation: serviceInfo(ctx),
            uiConversation: { present: ui !== undefined, owner: fiberInfo(ui?.ctx?.fiber),
              conversation: serviceInfo(ui?.ctx) },
            entries: [...ctx.loader.entries()].map(row => ({ name: row.options.name, owner: fiberInfo(row.fiber) })),
            slots: ctx.slots.snapshot() };
        } catch (error) { return { readError: String(error) }; }
      };
      const record = (kind, detail) => {
        const row = { sequence: ++sequence, at: Date.now(), kind, ...detail };
        if (timeline.length === 1000) { timeline.shift(); dropped++; }
        timeline.push(row); return row;
      };
      const diagnostics = () => ({ ...state(), crashes: [...crashes], timeline: [...timeline], dropped });
      ctx.effect(() => {
        window.__OMD_RC1_DIAGNOSTICS__ = diagnostics;
        const off = ctx.slots.onEntryError((key, entry, error, info) => {
          try {
            if (!registrationIds.has(entry)) registrationIds.set(entry, ++nextRegistrationId);
            // Options contain callbacks: retain only serializable identifying fields.
            const options = Object.fromEntries(Object.entries(entry.options ?? {}).filter(([, value]) =>
              value === null || ['string', 'number', 'boolean'].includes(typeof value)));
            crashes.push(record('slot-entry-error', { key, registrationId: registrationIds.get(entry),
              registrant: entry.registrant, options, abdicated: info.abdicated,
              error: String(error?.stack ?? error), state: state() }));
          } catch (readError) { record('diagnostic-read-error', { error: String(readError) }); }
        });
        return () => { off(); if (window.__OMD_RC1_DIAGNOSTICS__ === diagnostics) delete window.__OMD_RC1_DIAGNOSTICS__; };
      });
      for (const event of ['internal/plugin', 'internal/status']) {
        ctx.on(event, (fiber, oldState) => {
          try { record(event, { fiber: fiberInfo(fiber), oldState,
            conversation: serviceInfo(original(ctx.get('uiConversation', false))?.ctx ?? ctx),
            manifestRev: ctx.modules.manifest.rev }); }
          catch (error) { record('diagnostic-read-error', { error: String(error) }); }
        });
      }
      ctx.on('internal/service', name => {
        if (name === 'conversation' || name === 'uiConversation') record('internal/service', { name, state: state() });
      });
      ctx.inject(['uiConversation', 'uiWorkspace', 'uiSession', 'sessions'], scope => {
        const observe = async ({ sessionId, openSessionId } = {}) => {
          if (openSessionId) {
            await scope.sessions.refresh();
            if (!scope.sessions.list.getSnapshot().byId[openSessionId]) throw Error('Session missing from refreshed public catalog');
            scope.uiWorkspace.openSession(openSessionId);
          }
          const session = sessionId && scope.sessions.binding(sessionId)?.session.getSnapshot();
          const modules = scope.modules, rows = modules.manifest.modules;
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
            identity: { shellProtocol: window.dshDesktop?.protocolVersion, moduleSystem: modules.version,
              release: modules.manifest.release, rev: modules.manifest.rev,
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
            session: { id: sessionId, currentSessionId: scope.uiSession.adapter.current.getSnapshot().props.sessionId,
              retainedMainView: sessionId ? scope.sessions.retainInfo(sessionId).getSnapshot().retainedBy.mainView ?? 0 : 0,
              blank: session?.blank, promptAttempted: session?.promptAttempted },
            entries: [...scope.loader.entries()].map(row => ({ name: row.options.name, state: row.fiber?.state })),
          };
        };
        scope.effect(() => {
          window.__OMD_RC1_SLOTS__ = observe;
          return () => { if (window.__OMD_RC1_SLOTS__ === observe) delete window.__OMD_RC1_SLOTS__; };
        });
      });
    },
  };
} });
