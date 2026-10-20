import { Button, Input } from './native-controls.jsx';
import { Icon } from './native-icons.jsx';
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { effortChoices } from '../model-efforts.mjs';
import css from './model-panel.css';
import { useMainConversation } from './main-conversation.mjs';
import { decorateSlotComponent } from './slot-decoration.mjs';

const emptyStore = { subscribe: () => () => {}, getSnapshot: () => undefined };
const useStore = store => useSyncExternalStore(fn => store.subscribe(fn), () => store.getSnapshot());
const seeded = (index, salt) => { const value = Math.sin((index+1)*12.9898+salt*78.233)*43758.5453; return value-Math.floor(value); };
const particles = Array.from({ length: 14 }, (_, i) => ({
  left: `${4+seeded(i,14)*92}%`, top: `${12+seeded(i,23)*76}%`,
  '--particle-opacity':.4+seeded(i,11)*.6, '--particle-scale':.5+seeded(i,12)*.45,
  animationDelay: `${-(i*.14+seeded(i,17)*1.2)}s`, '--particle-duration': `${1.9/(.8+seeded(i,21)*.4)}s`,
}));
const ultraSubmodes = [
  { id: 'workflow', label: 'Workflow', description: '按工作流编排任务与子代理。' },
  { id: 'team', label: 'Agent Team', description: '通过成员沟通与共享任务板协作。' },
  { id: 'free', label: '自由', description: '由模型自行组织多 AI 协作，专注完成任务。' },
];
const sameRoute = (a, b) => a?.provider === b?.provider && a?.model === b?.model;
async function modeApi(sessionId, body, signal) {
  const response = await fetch(`trisoul-x/api/model-mode?session=${encodeURIComponent(sessionId)}`, {
    signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}
function Chevron({ back = false }) { return <Icon name="chevron" size={14} className={back ? 'omd-model-back' : undefined}/>; }
function Reset() { return <Icon name="refresh" size={16}/>; }

function ModelPanel({ ctx, sessionId, locked, available, directory, load, renderSlot, additive = false }) {
  const state = useStore(directory);
  const faces = useMemo(() => {
    const projections = ctx.sessions.binding(sessionId)?.session.projections;
    return { mode: projections?.faceOf('omdUltracode') ?? emptyStore, preset: projections?.faceOf('agentPreset') ?? emptyStore };
  }, [ctx, sessionId]);
  const projected = useStore(faces.mode), preset = useStore(faces.preset);
  const [mode, setMode] = useState(null), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false), [pane, setPane] = useState('effort'), [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null), [dragging, setDragging] = useState(false);
  const [submodeDraft, setSubmodeDraft] = useState(null);
  const [position, setPosition] = useState({ visibility: 'hidden' });
  const trigger = useRef(null), panel = useRef(null), slider = useRef(null), search = useRef(null), modelButton = useRef(null);
  const live = useRef(true), ticket = useRef(0), writing = useRef(false), draggingRef = useRef(false), draftRef = useRef(null), commitTimer = useRef();
  const gestureRevision = useRef(null), focusAfterSave = useRef(null);
  const pendingSubmode = useRef(null);
  const id = useId();
  useEffect(() => { live.current = true; return () => { live.current = false; clearTimeout(commitTimer.current); }; }, []);
  const refresh = useCallback(async () => {
    if (!available || writing.current) return;
    const revision = ++ticket.current;
    try { const next = await modeApi(sessionId); if (live.current && revision === ticket.current) { setMode(next); setError(''); } }
    catch (e) { if (live.current && revision === ticket.current) setError(e.message); }
  }, [sessionId, available]);
  useEffect(() => { void refresh(); }, [refresh, projected, preset]);
  useEffect(() => ctx.modules?.entries.state.subscribe(() => { void refresh(); }), [ctx, refresh]);
  useEffect(() => { if (!available || locked) setOpen(false); }, [available, locked]);

  const selected = mode?.selected ?? state.current;
  const group = state.groups.find(item => item.id === selected?.provider);
  const model = group?.models.find(item => item.id === selected?.model);
  const choices = useMemo(() => [
    ...effortChoices(model).map(choice => /^ultra$/i.test(choice.label) ? { ...choice, label: `${choice.label} 推理` } : choice),
    ...mode?.eligible ? [{ id: 'omd:ultra', label: 'Ultra', mode: 'ultra' }] : [],
  ], [model, mode?.eligible]);
  const effective = selected?.reasoningEffort ?? model?.reasoning?.defaultEffort;
  const activeMode = mode?.mode ?? 'off';
  const submodes = ultraSubmodes.filter(item => item.id !== 'team' || mode?.teamAvailable === true);
  const submode = submodes.find(item => item.id === (submodeDraft ?? mode?.submode)) ?? ultraSubmodes[2];
  const selectedIndex = activeMode !== 'off' ? choices.findIndex(item => item.mode === activeMode) : choices.findIndex(item => !item.mode && item.id === effective);
  const value = draft ?? Math.max(0, selectedIndex), level = choices[value] ?? choices[0];
  const modelName = model?.name ?? selected?.model ?? '选择模型';
  const renderModelLabel = (providerGroup, catalogModel, placement) => {
    if (!providerGroup || !catalogModel) return modelName;
    const provider = providerGroup.provider ?? { id: providerGroup.id, name: providerGroup.name };
    return <span data-provider-id={provider.id} data-model-id={catalogModel.id}>{renderSlot
      ? renderSlot('conversation.input.model.label', { provider, model: catalogModel, placement,
        selected: sameRoute(selected, { provider: providerGroup.id, model: catalogModel.id }) }, { fallback: catalogModel.name })
      : catalogModel.name}</span>;
  };
  const label = selectedIndex < 0 && draft === null ? effective ?? '默认' : level?.label ?? '默认';
  const savedLabel = selectedIndex < 0 ? effective ?? '默认' : choices[selectedIndex]?.label ?? '默认';
  const busy = saving || state.pending !== null, sliderDisabled = busy || !mode || !model || choices.length < 2;

  const close = (focus = false) => { clearTimeout(commitTimer.current); gestureRevision.current = null; focusAfterSave.current = null; setOpen(false); setDraft(null); draftRef.current = null; setDragging(false); draggingRef.current = false; if (focus) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect(), menu = panel.current;
      if (!rect || !menu) return;
      const margin = 10, width = menu.offsetWidth, height = menu.offsetHeight;
      setPosition({ left: Math.max(margin, Math.min(rect.right - width, innerWidth - width - margin)), top: Math.max(margin, Math.min(rect.top - height - 8, innerHeight - height - margin)) });
    };
    place(); const observer = new ResizeObserver(place); observer.observe(panel.current);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    const outside = event => { if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== trigger.current && !panel.current?.contains(active)) return;
    (pane === 'model' ? search.current : slider.current?.disabled ? modelButton.current : slider.current)?.focus();
  }, [open, pane]);
  useLayoutEffect(() => {
    const previous = focusAfterSave.current;
    if (!previous || busy) return;
    focusAfterSave.current = null;
    if (!open || document.activeElement !== panel.current) return;
    const target = previous.isConnected && !previous.disabled ? previous
      : pane === 'model' ? search.current : sliderDisabled ? modelButton.current : slider.current;
    target?.focus({ preventScroll: true });
  }, [busy, open, pane, sliderDisabled]);

  const save = async (route, nextMode, reasoningEffort, nextSubmode = nextMode === 'off' ? mode?.savedSubmode ?? submode.id : submode.id) => {
    if (!mode || writing.current || locked) return false;
    writing.current = true; ++ticket.current;
    // Native disabled controls lose focus. Keep Escape/Tab available while
    // saving, then restore only if the user has not moved to another control.
    draftRef.current = null;
    if (panel.current?.contains(document.activeElement)) {
      focusAfterSave.current = document.activeElement; panel.current.focus({ preventScroll: true });
    }
    setSaving(true); setError('');
    try {
      let revision = mode.revision;
      while (true) {
        const next = await modeApi(sessionId, { ...route, reasoningEffort, mode: nextMode, submode: nextSubmode, expectedRevision: revision });
        if (!live.current) return false;
        setMode(next);
        const queued = pendingSubmode.current; pendingSubmode.current = null;
        if (queued === null || next.mode === 'ultra' && queued === next.submode) break;
        // A submode click made while Ultra is saving follows that write, using
        // its returned revision instead of racing it with the stale selection.
        nextMode = 'ultra'; reasoningEffort = undefined; nextSubmode = queued; revision = next.revision;
      }
      return true;
    } catch (e) { if (live.current) setError(e.message); return false; }
    finally { writing.current = false; pendingSubmode.current = null; if (live.current) { setSaving(false); setSubmodeDraft(null); setDraft(null); draftRef.current = null; } }
  };
  const chooseSubmode = next => {
    clearTimeout(commitTimer.current); gestureRevision.current = null;
    draggingRef.current = false; setDragging(false);
    setSubmodeDraft(next);
    if (writing.current) { pendingSubmode.current = next; return; }
    void save({ provider: selected.provider, model: selected.model }, 'ultra', undefined, next);
  };
  const commit = index => {
    clearTimeout(commitTimer.current);
    const revision = gestureRevision.current; gestureRevision.current = null;
    if (revision !== null && revision !== mode?.revision) {
      setDraft(null); draftRef.current = null; setError('模型设置已在另一处更新，请重新选择'); return;
    }
    const choice = choices[index];
    if (!choice || !selected || sliderDisabled) return;
    if (index === selectedIndex) { setDraft(null); draftRef.current = null; return; }
    void save({ provider: selected.provider, model: selected.model }, choice.mode ?? 'off', choice.mode ? undefined : choice.id);
  };
  const change = index => { gestureRevision.current ??= mode?.revision; draftRef.current = index; setDraft(index); };
  const chooseModel = async (provider, next) => {
    const effort = sameRoute(selected, {provider, model:next.id}) ? selected.reasoningEffort : next.reasoning?.defaultEffort;
    const origin = document.activeElement;
    if (await save({provider,model:next.id}, activeMode, effort)
      && panel.current && (document.activeElement === panel.current || document.activeElement === origin)) setPane('effort');
  };
  const keyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (pane === 'model') { setPane('effort'); queueMicrotask(() => modelButton.current?.focus()); } else close(true);
    } else if (event.key === 'Tab') {
      const focusable = [...panel.current.querySelectorAll('button:not([disabled]),input:not([disabled]):not([tabindex="-1"])')];
      if (event.shiftKey && (document.activeElement === panel.current || document.activeElement === focusable[0]) || !event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); close(true); }
    } else if (pane === 'model' && ['ArrowDown','ArrowUp'].includes(event.key)) {
      const items = [...panel.current.querySelectorAll('[role="option"]:not([disabled])')];
      if (!items.length) return;
      event.preventDefault(); const index = items.indexOf(document.activeElement), delta = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + delta + items.length) % items.length]?.focus();
    }
  };
  if (!available) return null;
  return <>
    <Button size="sm" variant="ghost" ref={trigger} type="button" className="omd-model-trigger" data-mode={activeMode} disabled={locked} aria-label={`${additive ? 'OMD 模式与思考强度' : '模型与思考强度'}：${modelName} · ${savedLabel}${activeMode === 'ultra' ? ` · ${submode.label}` : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) close(); else { setPane(selected ? 'effort' : 'model'); setQuery(''); setOpen(true); load(); void refresh(); } }}>
      <span>{additive && activeMode !== 'ultra' ? 'OMD' : renderModelLabel(group, model, 'trigger')}</span><span className="omd-model-caption">· {savedLabel}{activeMode === 'ultra' ? ` · ${submode.label}` : ''}</span><span aria-hidden="true">⌃</span>
    </Button>
    {open && createPortal(<section ref={panel} id={id} className="omd-model-panel" data-pane={pane} style={position} role="dialog" aria-label="模型与思考强度" aria-busy={busy} tabIndex={-1} onKeyDown={keyDown}>
      {pane === 'effort' ? <>
        <header className="omd-effort-heading">
          <h2 key={label} className={level?.mode === 'ultra' ? 'omd-effort-ultra' : ''}>{label}</h2>
          <Button size="sm" variant="ghost" type="button" className="omd-model-reset" aria-label="恢复默认思考强度" title="恢复默认思考强度" disabled={busy || !model || !mode}
            onClick={() => void save({provider:selected.provider,model:selected.model}, 'off', model.reasoning?.defaultEffort)}><Reset/></Button>
          <Button size="sm" variant="ghost" ref={modelButton} type="button" className="omd-model-current" onClick={() => { setPane('model'); setQuery(''); }}><span>{renderModelLabel(group, model, 'menu')}</span><Chevron/></Button>
        </header>
        <div className="omd-effort-control" data-effort-value={value} data-effort-max={choices.length - 1} data-ultra={level?.mode === 'ultra' || undefined} data-dragging={dragging || undefined} style={{'--effort-progress':`${choices.length > 1 ? value / (choices.length - 1) * 100 : 0}%`,'--effort-ratio':choices.length > 1 ? value / (choices.length - 1) : 0}}>
          <div className="omd-effort-track" aria-hidden="true"><div className="omd-effort-fill"><i className="omd-effort-glow"/>{particles.map((style,i) => <i key={i} className="omd-effort-particle" style={style}/>)}</div>
            <div className="omd-effort-ticks">{choices.map((_,i) => <i key={i} data-selected={i<=value||undefined} style={{left:`${choices.length > 1 ? i/(choices.length-1)*100 : 0}%`}}/>)}</div>
          </div><div className="omd-effort-thumb" aria-hidden="true"/>
          <input ref={slider} type="range" min="0" max={choices.length-1} step="1" value={value} disabled={sliderDisabled} aria-label="思考强度" aria-valuetext={label}
            onChange={event => { const index = Number(event.target.value); change(index); clearTimeout(commitTimer.current); if (!draggingRef.current) commitTimer.current = setTimeout(() => commit(index), 250); }}
            onPointerDown={event => { if (sliderDisabled) return; gestureRevision.current = mode.revision; draggingRef.current = true; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerUp={() => { draggingRef.current = false; setDragging(false); commit(draftRef.current ?? value); }}
            onPointerCancel={() => { gestureRevision.current = null; draggingRef.current = false; setDragging(false); setDraft(null); draftRef.current = null; }}
            onKeyUp={event => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) commit(draftRef.current ?? value); }}
            onBlur={() => { if (!draggingRef.current && draftRef.current !== null) commit(draftRef.current); }}/>
        </div>
        {level?.mode === 'ultra' && <div className="omd-ultra-options">
          <div className="omd-ultra-submodes" role="radiogroup" aria-label="Ultra 协作方式">
            {submodes.map(item => <label key={item.id} data-selected={submode.id === item.id || undefined}>
              <input type="radio" name={`${id}-submode`} value={item.id} checked={(activeMode === 'ultra' || submodeDraft !== null) && submode.id === item.id} tabIndex={submode.id === item.id ? 0 : -1} disabled={locked || !mode || !selected || state.pending !== null}
                onChange={() => chooseSubmode(item.id)}/>
              <span>{item.label}</span>
            </label>)}
          </div>
          <p className="omd-ultra-description">{submode.description}</p>
        </div>}
        <div className="omd-effort-notice" data-visible={mode?.pending || undefined} role="status">{mode?.pending ? '已保存，下一轮生效。' : ''}</div>
        {state.routable === false && <p className="omd-model-error">当前模型不可用，请选择其他模型。</p>}
      </> : <>
        <div className="omd-model-search"><Button size="sm" variant="ghost" type="button" aria-label="返回思考强度" onClick={() => setPane('effort')}><Chevron back/></Button><Input ref={search} type="search" aria-label="搜索模型" placeholder="搜索模型" value={query} onChange={e=>setQuery(e.target.value)}/></div>
        <div className="omd-model-options" role="listbox" aria-label="模型">
          {state.groups.map(group => { const models = group.models.filter(item => `${group.name} ${item.name} ${item.id}`.toLowerCase().includes(query.toLowerCase())); return !models.length ? null : <div role="group" aria-label={group.name} key={group.id}><div className="omd-model-provider">{group.name}</div>{models.map(item => <Button size="sm" variant="ghost" type="button" role="option" aria-selected={sameRoute(selected,{provider:group.id,model:item.id})} key={item.id} disabled={busy || !mode} onClick={() => void chooseModel(group.id,item)}><span>{renderModelLabel(group, item, 'option')}</span>{sameRoute(selected,{provider:group.id,model:item.id}) && <span aria-hidden="true">✓</span>}</Button>)}</div>; })}
          {state.status === 'loading' && <p className="omd-model-status">正在加载模型…</p>}
          {state.status !== 'loading' && !state.groups.some(group => group.models.some(item => `${group.name} ${item.name} ${item.id}`.toLowerCase().includes(query.toLowerCase()))) && <p className="omd-model-status">没有匹配的模型</p>}
        </div>
      </>}
      {(error || state.error || state.failures.length > 0) && <div className="omd-model-error" role="alert"><span>{error || state.error || state.failures.map(f=>`${f.name}：${f.message}`).join('；')}</span><Button size="sm" variant="ghost" type="button" disabled={busy} onClick={() => { load(); void refresh(); }}>重试</Button></div>}
    </section>, document.body)}
  </>;
}

export function applyModelPanel(ctx) {
  ctx.effect(() => { const style = document.createElement('style'); style.dataset.plugin = 'omd-model-panel'; style.textContent = css; document.head.append(style); return () => style.remove(); });
  const name = 'conversation.input.model';
  const listeners = new Set();
  let additive = false;
  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  ctx.slots.inject(name, () => {
    let stopped = false;
    const nativeEntries = new WeakSet();
    const isNative = entry => {
      const children = entry?.children, label = children?.[`${name}.label`];
      const nativeChildren = !children || (Object.keys(children).length === 1
        && label?.kind === 'single' && label.scope === 'session' && label.inline === true);
      return entry?.component.name === 'ModelSelect' && entry.locale === 'model'
        && typeof entry.inject === 'function' && nativeChildren;
    };
    // Keep the native entry identity: its renderSlot binding authorizes the
    // label child and cannot be transferred to a shadow registration.
    const dispose = decorateSlotComponent(ctx.slots, name, (_key, entry) => isNative(entry), original => {
      nativeEntries.add(original);
      return function Panel(props) {
        const main = useMainConversation(props);
        return main ? <ModelPanel key={props.sessionId} ctx={ctx} {...props}/> : null;
      };
    });
    const reconcile = () => {
      if (stopped || ctx.fiber?.uid === null) return;
      const winner = ctx.slots.entriesOfSlot(name)[0];
      const next = Boolean(winner && !nativeEntries.has(winner));
      if (next !== additive) { additive = next; for (const fn of listeners) fn(); }
    };
    const off = ctx.slots.subscribe(name, reconcile); reconcile();
    return () => { stopped = true; off(); dispose(); additive = false; for (const fn of listeners) fn(); };
  });
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: 'omd-model-mode', order: 120,
    inject: sessionId => {
      const directory = ctx.get('modelDirectories')?.directoryFor(sessionId);
      const available = Boolean(directory) && ctx.sessions.subagentAddress(sessionId) === undefined;
      return { directory: directory?.store ?? emptyStore, available,
        load: () => { if (available) directory.load().catch(() => {}); } };
    },
  }, function ModeEntry(props) {
    const main = useMainConversation(props);
    const shown = useSyncExternalStore(subscribe, () => additive);
    const removed = props.useSession(s => s.removed) ?? false;
    return main && shown && props.available ? <ModelPanel key={props.sessionId} ctx={ctx} {...props} locked={removed} additive/> : null;
  }));
}
