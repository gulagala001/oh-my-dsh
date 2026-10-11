import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button as DshButton, Tooltip as DshTooltip, SHIELD_OUTLINE_PATH, ICON_REGULAR_STROKE } from '@deepseek-ai/dsh-client-ui-primitives';
import { CodexCuScope } from '#opencu/src/client/codex-cu-scope.jsx';
import { CodexCuButton, CodexCuSpinner, CodexCuTooltip } from '#opencu/src/client/codex-cu-primitives.jsx';
import { CodexCuIcon } from '#opencu/src/client/codex-cu-icons.jsx';
import { CodexBrowserAddressInput } from '#opencu/src/client/codex-browser-address.jsx';
import { formatCodexTargetUrl } from '#opencu/src/client/codex-target-adapter.mjs';
import css from './codex-dsh-browser.css';

export const codexDshBrowserStyles = css;
export const CODEX_DSH_BROWSER_CONTRACT_ID = 'native-browser-body-v1';
export const CODEX_DSH_BROWSER_PROVIDER_ID = '@deepseek-ai/dsh-client-ui-sidebar-browser';
const seat = 'sidebar.right.pane.tab';
const adapter = Symbol('omd.codex-dsh-browser');
// The published rc.2 and alpha.2 BrowserBody and injected face are identical.
// Source identity and live public capabilities gate this presentation together.
const sourceIdentity = Object.freeze({
  body: '00a48bf94d9015596da972280fc00d9d7ccc221bda8c5e003cf949626f558844',
  inject: 'caa0e52ee9684805fe73041f47216451213c4d156c59bce20a748d3ec3a30ff1',
});
const EMPTY_FRAME = Object.freeze({ target: undefined, address: 'empty', loading: false, canGoBack: false, canGoForward: false, error: undefined, sandboxEnabled: undefined });

function savedTarget(state) { return state === undefined || state.index < 0 ? undefined : state.entries[state.index]; }
function useBrowserDraft(url, revision) {
  const [edit, setEdit] = useState();
  return [edit?.revision === revision ? edit.value : url ?? '', value => setEdit({ revision, value })];
}

function useToolbarWidths(toolbar, leading, trailing) {
  useLayoutEffect(() => {
    const observe = (element, property) => {
      if (!element || !toolbar.current) return () => {};
      const parent = toolbar.current;
      const write = width => {
        const value = `${Math.round(width)}px`;
        if (parent.style.getPropertyValue(property) !== value) parent.style.setProperty(property, value);
      };
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
        for (const entry of entries) write(entry.borderBoxSize?.[0]?.inlineSize ?? entry.target.getBoundingClientRect().width);
      });
      observer?.observe(element, { box: 'border-box' });
      write(element.offsetWidth);
      return () => { observer?.disconnect(); parent.style.removeProperty(property); };
    };
    const stopLeading = observe(leading.current, '--browser-leading-width');
    const stopTrailing = observe(trailing.current, '--browser-trailing-width');
    return () => { stopLeading(); stopTrailing(); };
  }, [toolbar, leading, trailing]);
}

// This is DSH's optional iframe policy, separate from browser site permissions.
function DshSandboxPolicyIcon({ sandboxed }) {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d={SHIELD_OUTLINE_PATH} stroke="currentColor" strokeWidth={ICON_REGULAR_STROKE} strokeLinejoin="round" />
    {sandboxed ? <path d="M12.1654 5.7552L8.9447 9.41475C8.73044 9.65816 8.53628 9.8804 8.35774 10.0423C8.1713 10.2114 7.94235 10.3717 7.64016 10.4254C7.48207 10.4535 7.32 10.4552 7.16151 10.4294C6.85843 10.3801 6.62728 10.2223 6.43836 10.0559C6.25752 9.89653 6.06037 9.67732 5.84264 9.43705L4.72925 8.20897L5.63557 7.38707L6.74897 8.61594C6.98603 8.87755 7.12974 9.03533 7.24673 9.13839C7.31033 9.19443 7.34485 9.21476 7.35823 9.22122C7.38068 9.22484 7.40352 9.22515 7.42593 9.22122C7.40522 9.22502 7.42893 9.23294 7.53583 9.136C7.65132 9.03126 7.79316 8.87139 8.02643 8.60638L11.2479 4.94763L12.1654 5.7552Z" fill="currentColor" />
      : <path d="M10.6074 4.40278L8.00975 6.99973L10.6074 9.59739L9.59736 10.6074L6.9997 8.00978L4.40274 10.6074L3.3927 9.59739L5.98966 6.99973L3.3927 4.40278L4.40274 3.39273L6.9997 5.98969L9.59736 3.39273L10.6074 4.40278Z" fill="currentColor" transform="translate(1.2 0.8)" />}
  </svg>;
}

/** DSH owns the page, persistence, navigation and docking. OpenCU supplies
 * presentation primitives only; its owned browser has a different slot key. */
export function CodexDshBrowserBody(props) {
  const { mount, loadUrl, restore, goBack, goForward, reload, setSandbox, useBrowserState, useStore, useTabInfo, t } = props;
  const { tab } = useTabInfo();
  useEffect(() => tab.actions.bindCommands({ refresh: () => reload(tab.id) }), [tab.actions, tab.id, reload]);
  const initial = useRef(useStore(state => state.byTab[tab.id]));
  const initialUrl = useRef(tab.navigation.params?.url);
  const viewportId = useId();
  const [mountEpoch, setMountEpoch] = useState(0);
  const state = useBrowserState(tab.id);
  const frame = state?.frame ?? EMPTY_FRAME;
  const restoreTarget = state === undefined ? savedTarget(initial.current) : state.restoreTarget;
  const target = frame.target ?? restoreTarget;
  const [draft, setDraft] = useBrowserDraft(target?.url ?? initialUrl.current, state?.addressRevision ?? 0);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(editing), selectFrame = useRef(); editingRef.current = editing;
  const toolbar = useRef(null), leading = useRef(null), trailing = useRef(null), addressBar = useRef(null), addressInput = useRef(null);
  useToolbarWidths(toolbar, leading, trailing);

  // Keep the host attachment lifetime, including session rebinding and docking.
  useLayoutEffect(() => {
    const hide = mount({ tabId: tab.id, signal: tab.signal, viewportId, applicationOrigin: window.location.origin,
      initial: initial.current, initialUrl: initialUrl.current,
      openTab: url => tab.actions.openTab('browser', { params: { url }, revealIfOpened: false }),
    });
    setMountEpoch(value => value + 1);
    return hide;
  }, [mount, tab.id, tab.signal, tab.actions, viewportId, props.actions]);

  const unknown = frame.address === 'unknown';
  const externalUrl = unknown ? undefined : target?.url;
  const sandboxed = frame.sandboxEnabled;
  const failure = state?.addressFailure, error = frame.error;
  const displayAddress = editing || failure !== undefined ? draft : formatCodexTargetUrl(target?.url ?? draft, { stripHttp: false, stripQueryAndHash: false });
  const submit = value => loadUrl(tab.id, value);
  const startEditing = () => {
    editingRef.current = true;
    setEditing(true);
    addressInput.current?.focus();
    cancelAnimationFrame(selectFrame.current);
    selectFrame.current = requestAnimationFrame(() => {
      const input = addressInput.current;
      if (editingRef.current && input?.ownerDocument.activeElement === input) input.select();
    });
  };
  useEffect(() => () => cancelAnimationFrame(selectFrame.current), []);
  const cancelEditing = () => { setDraft(target?.url ?? initialUrl.current ?? ''); editingRef.current = false; setEditing(false); };
  const navigationButton = (name, label, disabled, onClick) => <CodexCuTooltip tooltipContent={label} side="bottom">
    <CodexCuButton color={disabled ? 'ghost' : 'ghostActive'} size="toolbar" radius="full" uniform disabled={disabled}
      aria-label={label} onClick={onClick}><CodexCuIcon name="shared:uht" size={16} style={name === 'forward' ? { transform: 'scaleX(-1)' } : undefined} /></CodexCuButton>
  </CodexCuTooltip>;

  return <CodexCuScope className="omd-dsh-browser" data-omd-dsh-browser={CODEX_DSH_BROWSER_CONTRACT_ID} data-dsh-browser-tab={tab.id}>
    <div className="tx-cu-browser-controls omd-dsh-browser__chrome" data-chrome-variant="floating">
      <form ref={toolbar} className="tx-cu-browser-navigation" data-viewer-density="compact" data-browser-sidebar-toolbar="true"
        onSubmit={event => { event.preventDefault(); submit(draft); }}>
        <div ref={leading} className="tx-cu-browser-leading">
          <div className="tx-cu-browser-capsule tx-cu-browser-joined" role="group" aria-label={t('type.label')}>
            {navigationButton('back', t('back'), !frame.canGoBack, () => goBack(tab.id))}
            {navigationButton('forward', t('forward'), !frame.canGoForward, () => goForward(tab.id))}
            <span className="tx-cu-browser-divider" aria-hidden="true" />
            <DshTooltip label={t('reload')} shortcutKeys={tab.refreshShortcut?.keys} side="bottom" delayMs={500}>
              <CodexCuButton color={target === undefined || mountEpoch === 0 ? 'ghost' : 'ghostActive'} size="toolbar" radius="full" uniform
                aria-label={t('reload')} aria-keyshortcuts={tab.refreshShortcut?.aria} aria-busy={frame.loading}
                disabled={target === undefined || mountEpoch === 0} onClick={() => reload(tab.id)}>
                {frame.loading ? <CodexCuSpinner className="omd-dsh-browser__spinner" /> : <CodexCuIcon name="shared:Emt" size={16} />}
              </CodexCuButton>
            </DshTooltip>
          </div>
        </div>
        <div className="tx-cu-address" onKeyDownCapture={event => {
          // Preserve the default Find action; DSH does not expose a Find model.
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') event.stopPropagation();
        }}>
          <div className="tx-cu-browser-address-width">
            <div ref={addressBar} className={`tx-cu-location tx-cu-browser-capsule tx-cu-browser-input-surface${editing ? ' is-editing' : ''}${unknown ? ' omd-dsh-browser__unknown' : ''}`}
              data-codex-cu-address-bar="true" data-state={editing ? 'active' : undefined}>
              <div className="tx-cu-browser-address-text"><div className="tx-cu-browser-address-input">
                <CodexBrowserAddressInput id={tab.id} query={displayAddress} currentAddress={target?.url ?? initialUrl.current ?? ''}
                  isAddressEditing={editing} isVisible={tab.visible} addressBarRef={addressBar} inputRef={addressInput}
                  placeholder={t('address.placeholder')} className="tx-cu-browser-source-address is-floating"
                  onValueChange={setDraft} onStartEditing={startEditing} onEnsureEditing={() => { if (!editingRef.current) startEditing(); }}
                  onAccept={() => { editingRef.current = false; setEditing(false); addressInput.current?.blur(); }} onCancel={cancelEditing} onFinishEditing={() => { editingRef.current = false; setEditing(false); }}
                  onStopEditing={() => { cancelEditing(); addressInput.current?.blur(); }} onNavigate={submit} />
                {unknown && <span className="omd-dsh-browser__address-changed">{t('address.changed')}</span>}
              </div></div>
              <button type="button" className="tx-cu-open-external" data-browser-sidebar-open-external="true" data-dsh-browser-action="external"
                aria-label={t('external')} title={t('external')} disabled={externalUrl === undefined}
                onPointerDown={event => event.preventDefault()} onClick={externalUrl === undefined ? undefined : () => window.open(externalUrl, '_blank', 'noopener,noreferrer')}>
                <CodexCuIcon name="shared:$lt" size={16} />
              </button>
            </div>
          </div>
        </div>
        <div ref={trailing} className="tx-cu-browser-trailing">
          {sandboxed !== undefined && <div className="tx-cu-browser-capsule tx-cu-browser-joined tx-cu-browser-action-group" data-dsh-browser-control="iframe-sandbox">
            <button type="button" className={`omd-dsh-browser__host-tool${sandboxed ? '' : ' omd-dsh-browser__sandbox-off'}`}
              aria-label={t(sandboxed ? 'sandbox.disable' : 'sandbox.enable')} title={t(sandboxed ? 'sandbox.disable' : 'sandbox.enable')}
              aria-pressed={!sandboxed} onClick={() => setSandbox(tab.id, !sandboxed)}><DshSandboxPolicyIcon sandboxed={sandboxed} /></button>
          </div>}
        </div>
      </form>
      <div className={`tx-cu-browser-loading${frame.loading ? ' is-loading' : ''}`} aria-hidden="true"><div /></div>
    </div>
    {sandboxed === false && <div className="omd-dsh-browser__sandbox-warning" role="status">{t('sandbox.warning')}</div>}
    {error !== undefined && <div className="omd-dsh-browser__failure" role="status">{error.code !== undefined && error.description !== undefined
      ? t('load.failed.detail', { code: String(error.code), description: error.description }) : t('load.failed')}</div>}
    {failure !== undefined && <div className="omd-dsh-browser__failure" role="alert">{t(`error.${failure}`)}</div>}
    <div className="omd-dsh-browser__content" aria-busy={frame.loading}>
      <div id={viewportId} className="omd-dsh-browser__viewport" aria-label={t('type.label')} />
      {restoreTarget !== undefined && <section className="omd-dsh-browser__restore" aria-label={t('restore.previous')}>
        <p className="omd-dsh-browser__restore-label">{t('restore.previous')}</p>
        <p className="omd-dsh-browser__restore-title">{restoreTarget.title}</p>
        <p className="omd-dsh-browser__restore-url">{restoreTarget.url}</p>
        <DshButton variant="primary" size="sm" disabled={mountEpoch === 0} onClick={() => restore(tab.id)}>{t('restore.action')}</DshButton>
      </section>}
      {restoreTarget === undefined && (target === undefined || frame.loading) && error === undefined && <div className="omd-dsh-browser__placeholder">
        <div className="omd-dsh-browser__start">{t(target === undefined ? 'start' : 'loading')}</div>
      </div>}
    </div>
    {unknown && <p className="omd-dsh-browser__limit">{t('address.unknown')}</p>}
  </CodexCuScope>;
}

function hasBrowserFace(props) {
  return ['mount', 'loadUrl', 'restore', 'goBack', 'goForward', 'reload', 'setSandbox', 'useBrowserState', 'useStore', 'useTabInfo', 't']
    .every(key => typeof props[key] === 'function') && props.actions != null;
}
async function hashFunction(fn) {
  if (typeof fn !== 'function' || !globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') return undefined;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(Function.prototype.toString.call(fn)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Public slot capabilities and the exact native renderer contract gate the
 * adapter. A build dependency is not evidence of the running host's version. */
export function applyCodexDshBrowser(ctx, { onStatus } = {}) {
  const report = (status, reason) => { try { onStatus?.({ status, reason, contractId: CODEX_DSH_BROWSER_CONTRACT_ID, providerId: CODEX_DSH_BROWSER_PROVIDER_ID }); } catch { /* Diagnostics must not affect the native browser. */ } };
  const slots = ctx.slots, types = ctx.sidebarRightTabs;
  if (!slots || !types || !['register', 'entries', 'entriesOfSlot', 'subscribe', 'spec', 'inject'].every(key => typeof slots[key] === 'function')
    || typeof types.get !== 'function' || typeof types.subscribe !== 'function') {
    report('inactive', 'public-interface-unavailable'); return () => {};
  }
  return slots.inject(seat, () => {
    const contract = slots.spec(seat);
    if (contract?.kind !== 'keyed' || contract.scope !== 'session') { report('inactive', 'unknown-seat-contract'); return () => {}; }
    let stopped = false, installed, generation = 0, checking;
    const verified = new WeakMap(), declined = new WeakSet();
    const remove = () => { if (installed) { const current = installed; installed = undefined; current.dispose(); } };
    const nativeEntry = () => {
      const definition = types.get('browser');
      if (definition?.id !== CODEX_DSH_BROWSER_PROVIDER_ID || definition.kind !== 'browser' || definition.priority !== 'builtin' || definition.multiple !== true) return undefined;
      const winner = slots.entriesOfSlot(seat).find(entry => entry.options.key === CODEX_DSH_BROWSER_PROVIDER_ID);
      let first = winner;
      if (installed) {
        if (winner !== installed.entry) {
          // The host can abdicate a crashing renderer to its original fallback.
          if (winner === installed.original) declined.add(installed.original);
          return undefined;
        }
        first = installed.original;
        if (!slots.entries(seat).includes(first)) return undefined;
      }
      if (!first || declined.has(first) || first.component?.[adapter] || Object.keys(first.options).some(key => key !== 'key')
        || typeof first.component !== 'function' || first.component.name !== 'BrowserBody' || first.children !== undefined
        || first.locale !== 'sidebarBrowser' || first.store == null || typeof first.inject !== 'function' || first.select !== undefined) return undefined;
      return first;
    };
    const reconcile = () => {
      if (stopped) return;
      const original = nativeEntry();
      if (!original) { generation++; checking = undefined; remove(); report('inactive', 'native-provider-or-renderer-unverified'); return; }
      if (installed?.original === original && installed.component === original.component && installed.inject === original.inject && installed.store === original.store) return;
      if (checking?.original === original && checking.component === original.component && checking.inject === original.inject && checking.store === original.store) return;
      const component = original.component, inject = original.inject, store = original.store;
      generation++; const stamp = generation; checking = { original, component, inject, store }; remove();
      let cached = verified.get(original);
      if (!cached || cached.component !== component || cached.inject !== inject) {
        const verification = Promise.all([hashFunction(component), hashFunction(inject)])
          .then(([body, inject]) => body === sourceIdentity.body && inject === sourceIdentity.inject, () => false);
        cached = { component, inject, verification };
        verified.set(original, cached);
      }
      void cached.verification.then(matches => {
        if (stopped || generation !== stamp || nativeEntry() !== original || original.component !== component || original.inject !== inject || original.store !== store) return;
        checking = undefined;
        if (!matches) { report('inactive', 'native-source-fingerprint-mismatch'); return; }
        const Original = component;
        function NativeBrowserSeat(props) { return hasBrowserFace(props) ? <CodexDshBrowserBody {...props} /> : <Original {...props} />; }
        NativeBrowserSeat[adapter] = true;
        const priority = (original.options.priority ?? 0) - 1;
        if (!Number.isFinite(priority) || slots.entries(seat).some(entry => entry.options.key === CODEX_DSH_BROWSER_PROVIDER_ID && (entry.options.priority ?? 0) === priority)) {
          report('inactive', 'renderer-priority-unavailable'); return;
        }
        const dispose = slots.register({ name: seat, ...original.options, priority, store: original.store,
          inject: original.inject, locale: original.locale, children: original.children, select: original.select,
          registrant: 'trisoul_x/native-browser-presentation',
        }, NativeBrowserSeat);
        const entry = slots.entries(seat).find(entry => entry.component === NativeBrowserSeat);
        if (!entry) { dispose(); report('inactive', 'native-presentation-registration-unavailable'); return; }
        installed = { original, component, inject, store, entry, dispose };
        report('active', 'verified-native-browser-presentation');
      }).catch(() => {
        if (stopped || generation !== stamp) return;
        checking = undefined; remove(); report('inactive', 'native-presentation-registration-unavailable');
      });
    };
    const stopSlots = slots.subscribe(seat, reconcile), stopTypes = types.subscribe(reconcile);
    reconcile();
    return () => { stopped = true; generation++; stopSlots(); stopTypes(); remove(); report('inactive', 'disposed'); };
  });
}
