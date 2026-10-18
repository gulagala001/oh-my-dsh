// No UI contributions or substitutions. Read the real public registry faces.
window.__ModuleLoader__.load({ id: 'omd-desktop-host-boot-observer', factory: () => ({
  inject: ['slots', 'loader'],
  apply(ctx) {
    ctx.inject(['uiConversation'], scope => {
      const observe = () => ({
        events: scope.uiConversation.events.entries().map(row => ({ kind: row.kind, target: row.target })),
        views: scope.uiConversation.views.entries().map(row => row.target),
        slots: scope.slots.snapshot(),
        entries: [...scope.loader.entries()].map(row => ({ name: row.options.name, state: row.fiber?.state })),
      });
      scope.effect(() => {
        window.__OMD_DESKTOP_HOST_BOOT__ = observe;
        return () => { if (window.__OMD_DESKTOP_HOST_BOOT__ === observe) delete window.__OMD_DESKTOP_HOST_BOOT__; };
      });
    });
  },
}) });
