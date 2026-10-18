// No UI contributions or substitutions. Read the real public registry faces.
window.__ModuleLoader__.load({ id: 'omd-desktop-host-boot-observer', factory: require => {
  // These three identities are in the fixed official shell seed table.
  const cordis = require('@deepseek-ai/cordis');
  const seeds = {
    '@deepseek-ai/dsh-client-ui-slots': require('@deepseek-ai/dsh-client-ui-slots'),
    '@deepseek-ai/dsh-client-ui-primitives': require('@deepseek-ai/dsh-client-ui-primitives'),
  };
  return {
    inject: ['slots', 'loader', 'modules'],
    apply(ctx) {
      ctx.inject(['uiConversation'], scope => {
        const observe = async () => {
          const modules = scope.modules, rows = modules.manifest.modules;
          const renderer = await modules.import('@deepseek-ai/dsh-client-ui-renderer', '', {});
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
              bootRelease: window.__DSH_BOOT__?.release, bootRev: window.__DSH_BOOT__?.rev,
              seeds: seedIdentity,
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
        scope.effect(() => {
          window.__OMD_DESKTOP_HOST_BOOT__ = observe;
          return () => { if (window.__OMD_DESKTOP_HOST_BOOT__ === observe) delete window.__OMD_DESKTOP_HOST_BOOT__; };
        });
      });
    },
  };
} });
