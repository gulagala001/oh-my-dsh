import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { decorateSlot } from '#opencu/src/client/slot-decoration.mjs';
import { effortChoices } from '../model-efforts.mjs';
import css from './model-panel.css';

const emptyStore = { subscribe: () => () => {}, getSnapshot: () => undefined };
const useStore = store => useSyncExternalStore(fn => store.subscribe(fn), () => store.getSnapshot());
const seeded = (index, salt) => { const value = Math.sin((index+1)*12.9898+salt*78.233)*43758.5453; return value-Math.floor(value); };
const particles = Array.from({ length: 14 }, (_, i) => ({
  left: `${4+seeded(i,14)*92}%`, top: `${12+seeded(i,23)*76}%`,
  '--particle-opacity':.4+seeded(i,11)*.6, '--particle-scale':.5+seeded(i,12)*.45,
  animationDelay: `${-(i*.14+seeded(i,17)*1.2)}s`, animationDuration: `${1.9/(.8+seeded(i,21)*.4)}s`,
}));
const sameRoute = (a, b) => a?.provider === b?.provider && a?.model === b?.model;
async function modeApi(sessionId, body, signal) {
  const response = await fetch(`trisoul-x/api/model-mode?session=${encodeURIComponent(sessionId)}`, {
    signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}
function Chevron({ back = false }) { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={back ? 'm12 5-5 5 5 5' : 'm7 5 5 5-5 5'}/></svg>; }
function Reset() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4m0 5h5M4.7 8a8 8 0 1 1-.5 6"/></svg>; }

function ModelPanel({ ctx, sessionId, locked, available, directory, load }) {
  const state = useStore(directory);
  const faces = useMemo(() => {
    const projections = ctx.sessions.binding(sessionId)?.session.projections;
    return { mode: projections?.faceOf('omdUltracode') ?? emptyStore, preset: projections?.faceOf('agentPreset') ?? emptyStore };
  }, [ctx, sessionId]);
  const projected = useStore(faces.mode), preset = useStore(faces.preset);
  const [mode, setMode] = useState(null), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false), [pane, setPane] = useState('effort'), [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null), [dragging, setDragging] = useState(false), [notice, setNotice] = useState(false);
  const [position, setPosition] = useState({ visibility: 'hidden' });
  const trigger = useRef(null), panel = useRef(null), slider = useRef(null), search = useRef(null), modelButton = useRef(null);
  const live = useRef(true), ticket = useRef(0), writing = useRef(false), draggingRef = useRef(false), draftRef = useRef(null), noticeTimer = useRef(), commitTimer = useRef();
  const gestureRevision = useRef(null);
  const id = useId();
  useEffect(() => { live.current = true; return () => { live.current = false; clearTimeout(noticeTimer.current); clearTimeout(commitTimer.current); }; }, []);
  const refresh = useCallback(async () => {
    if (!available || writing.current) return;
    const revision = ++ticket.current;
    try { const next = await modeApi(sessionId); if (live.current && revision === ticket.current) { setMode(next); setError(''); } }
    catch (e) { if (live.current && revision === ticket.current) setError(e.message); }
  }, [sessionId, available]);
  useEffect(() => { void refresh(); }, [refresh, projected, preset]);
  useEffect(() => { if (!available || locked) setOpen(false); }, [available, locked]);

  const selected = mode?.selected ?? state.current;
  const group = state.groups.find(item => item.id === selected?.provider);
  const model = group?.models.find(item => item.id === selected?.model);
  const choices = useMemo(() => [...effortChoices(model), ...mode?.eligible ? [{ id: 'omd:ultracode', label: 'Ultracode', ultracode: true }] : []], [model, mode?.eligible]);
  const effective = selected?.reasoningEffort ?? model?.reasoning?.defaultEffort;
  const selectedIndex = mode?.enabled ? choices.findIndex(item => item.ultracode) : choices.findIndex(item => !item.ultracode && item.id === effective);
  const value = draft ?? Math.max(0, selectedIndex), level = choices[value] ?? choices[0];
  const modelName = model?.name ?? selected?.model ?? '选择模型';
  const label = selectedIndex < 0 && draft === null ? effective ?? '默认' : level.label;
  const savedLabel = selectedIndex < 0 ? effective ?? '默认' : choices[selectedIndex]?.label ?? '默认';
  const busy = saving || state.pending !== null, sliderDisabled = busy || !mode || !model || choices.length < 2;

  const close = (focus = false) => { clearTimeout(commitTimer.current); gestureRevision.current = null; setOpen(false); setDraft(null); draftRef.current = null; setDragging(false); draggingRef.current = false; if (focus) trigger.current?.focus(); };
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
    (pane === 'model' ? search.current : slider.current?.disabled ? modelButton.current : slider.current)?.focus();
  }, [open, pane]);

  const save = async (route, ultracode, reasoningEffort) => {
    if (!mode || writing.current || locked) return false;
    writing.current = true; ++ticket.current; setSaving(true); setError('');
    try {
      const next = await modeApi(sessionId, { ...route, reasoningEffort, ultracode, expectedRevision: mode.revision });
      if (!live.current) return false;
      setMode(next);
      if (ultracode && !mode.enabled) { clearTimeout(noticeTimer.current); setNotice(true); noticeTimer.current = setTimeout(() => setNotice(false), 2000); }
      return true;
    } catch (e) { if (live.current) setError(e.message); return false; }
    finally { writing.current = false; if (live.current) { setSaving(false); setDraft(null); draftRef.current = null; } }
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
    void save({ provider: selected.provider, model: selected.model }, Boolean(choice.ultracode), choice.ultracode ? undefined : choice.id);
  };
  const change = index => { gestureRevision.current ??= mode?.revision; draftRef.current = index; setDraft(index); };
  const chooseModel = async (provider, next) => {
    const effort = sameRoute(selected, {provider, model:next.id}) ? selected.reasoningEffort : next.reasoning?.defaultEffort;
    if (await save({provider,model:next.id}, Boolean(mode?.enabled), effort)) setPane('effort');
  };
  const keyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (pane === 'model') { setPane('effort'); queueMicrotask(() => modelButton.current?.focus()); } else close(true);
    } else if (event.key === 'Tab') {
      const focusable = [...panel.current.querySelectorAll('button:not([disabled]),input:not([disabled])')];
      if (event.shiftKey && document.activeElement === focusable[0] || !event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); close(true); }
    } else if (pane === 'model' && ['ArrowDown','ArrowUp'].includes(event.key)) {
      const items = [...panel.current.querySelectorAll('[role="option"]:not([disabled])')];
      if (!items.length) return;
      event.preventDefault(); const index = items.indexOf(document.activeElement), delta = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + delta + items.length) % items.length]?.focus();
    }
  };
  if (!available) return null;
  return <>
    <button ref={trigger} type="button" className="omd-model-trigger" disabled={locked} aria-label="模型与思考强度" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) close(); else { setPane(selected ? 'effort' : 'model'); setQuery(''); setOpen(true); load(); void refresh(); } }}>
      <span>{modelName}</span><span className="omd-model-caption">{savedLabel}</span><span aria-hidden="true">⌃</span>
    </button>
    {open && createPortal(<section ref={panel} id={id} className="omd-model-panel" style={position} role="dialog" aria-label="模型与思考强度" aria-busy={busy} onKeyDown={keyDown}>
      {pane === 'effort' ? <>
        <header className="omd-effort-heading">
          <h2 key={label} className={level.ultracode ? 'omd-effort-ultra' : ''}>{label}</h2>
          <button type="button" className="omd-model-reset" aria-label="恢复默认思考强度" title="恢复默认思考强度" disabled={busy || !model || !mode}
            onClick={() => void save({provider:selected.provider,model:selected.model}, false, model.reasoning?.defaultEffort)}><Reset/></button>
          <button ref={modelButton} type="button" className="omd-model-current" onClick={() => { setPane('model'); setQuery(''); }}><span>{modelName}</span><Chevron/></button>
        </header>
        <div className="omd-effort-control" data-ultra={level.ultracode || undefined} data-dragging={dragging || undefined} style={{'--effort-progress':`${choices.length > 1 ? value / (choices.length - 1) * 100 : 0}%`,'--effort-ratio':choices.length > 1 ? value / (choices.length - 1) : 0}}>
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
        <div className="omd-effort-notice" data-visible={notice || undefined} role="status">更深入地实现与验证，可能需要更多时间。</div>
        {state.routable === false && <p className="omd-model-error">当前模型不可用，请选择其他模型。</p>}
      </> : <>
        <div className="omd-model-search"><button type="button" aria-label="返回思考强度" onClick={() => setPane('effort')}><Chevron back/></button><input ref={search} type="search" aria-label="搜索模型" placeholder="搜索模型" value={query} onChange={e=>setQuery(e.target.value)}/></div>
        <div className="omd-model-options" role="listbox" aria-label="模型">
          {state.groups.map(group => { const models = group.models.filter(item => `${group.name} ${item.name} ${item.id}`.toLowerCase().includes(query.toLowerCase())); return !models.length ? null : <div role="group" aria-label={group.name} key={group.id}><div className="omd-model-provider">{group.name}</div>{models.map(item => <button type="button" role="option" aria-selected={sameRoute(selected,{provider:group.id,model:item.id})} key={item.id} disabled={busy || !mode} onClick={() => void chooseModel(group.id,item)}><span>{item.name}</span>{sameRoute(selected,{provider:group.id,model:item.id}) && <span aria-hidden="true">✓</span>}</button>)}</div>; })}
          {state.status === 'loading' && <p className="omd-model-status">正在加载模型…</p>}
          {state.status !== 'loading' && !state.groups.some(group => group.models.some(item => `${group.name} ${item.name} ${item.id}`.toLowerCase().includes(query.toLowerCase()))) && <p className="omd-model-status">没有匹配的模型</p>}
        </div>
      </>}
      {(error || state.error || state.failures.length > 0) && <div className="omd-model-error" role="alert"><span>{error || state.error || state.failures.map(f=>`${f.name}：${f.message}`).join('；')}</span><button type="button" disabled={busy} onClick={() => { load(); void refresh(); }}>重试</button></div>}
    </section>, document.body)}
  </>;
}

export function applyModelPanel(ctx) {
  ctx.effect(() => { const style = document.createElement('style'); style.dataset.plugin = 'omd-model-panel'; style.textContent = css; document.head.append(style); return () => style.remove(); });
  const name = 'conversation.input.model';
  ctx.slots.inject(name, () => decorateSlot(ctx.slots, name, () => true, original => {
    function Panel(props) { return <ModelPanel key={props.sessionId} ctx={ctx} {...props}/>; }
    return { options: { ...original.options, name, store: original.store, locale: original.locale,
      inject: original.inject, children: original.children, priority: (original.options.priority ?? 0)-1 }, component: Panel };
  }));
}
