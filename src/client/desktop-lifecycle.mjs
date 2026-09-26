const installed = Symbol.for('omd.desktop-restart-notice');

// rc.2 Desktop caches its boot graph. Changing the Conversation provider needs
// an application restart; page reloads can request already retired bundles.
export function installDesktopLifecycle(ctx) {
  if (window.location.protocol !== 'dsh-app:' || ctx.root[installed]) return;
  const root = ctx.root, modules = ctx.modules;
  const bootRevision = window.__DSH_BOOT__?.entries?.find(row => row.id === 'trisoul_x')?.rev;
  root.effect(() => {
    root[installed] = true;
    let notice;
    const sync = () => {
      if (modules.entries.state.getSnapshot().syncing) return;
      const revision = modules.manifest.modules.find(row => row.id === 'trisoul_x')?.rev;
      if (revision === bootRevision) return;
      if (notice) return;
      notice = document.createElement('div');
      notice.dataset.omdDesktopRestart = '';
      notice.setAttribute('role', 'status');
      notice.textContent = 'Oh My DSH 的安装、更新或启停已保存。请等待任务结束，使用「重启应用与 Host」，或完整退出应用后重新打开；仅刷新页面不能生效。';
      Object.assign(notice.style, { position: 'fixed', bottom: '16px', left: '16px', right: '16px', zIndex: '2147483647', padding: '14px 18px', borderRadius: '12px', background: '#eaf1ff', border: '1px solid #91b3f2', color: '#173b72', font: '14px/1.6 system-ui', boxShadow: '0 4px 20px #0002' });
      document.body.append(notice);
    };
    const stop = modules.entries.state.subscribe(sync);
    sync();
    return () => { stop(); notice?.remove(); delete root[installed]; };
  }, 'OMD Desktop provider restart notice');
}
