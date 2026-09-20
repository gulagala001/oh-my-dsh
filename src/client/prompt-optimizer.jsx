import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createOptimizerPreferences, DraftOptimizer, OPTIMIZER_MODES } from './prompt-optimizer-state.mjs';
import css from './prompt-optimizer.css';

const descriptions = { basic: '只润色表达，保留原意和限制。', structured: '整理已有目标、约束与交付要求。', planning: '将现有任务组织为可执行的步骤。' };
function Sparkle() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m10 3 2.1 6.9L19 12l-6.9 2.1L10 21l-2.1-6.9L1 12l6.9-2.1L10 3ZM20 2v6M17 5h6"/></svg>; }
function Toggle({ children, checked, onChange, disabled }) { return <label className="omd-opt-toggle"><span>{children}</span><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}/></label>; }

export function applyPromptOptimizer(ctx) {
  const preferences = createOptimizerPreferences(), controllers = new Map();
  const controllerFor = sessionId => {
    const binding = ctx.sessions.binding(sessionId);
    if (!binding) return null;
    const saved = controllers.get(binding);
    if (saved) return saved;
    const shell = ctx.get('conversation').input.for(binding.ctx);
    const controller = new DraftOptimizer({ sessionId, shell, preferences }); controllers.set(binding, controller);
    binding.ctx.effect(() => () => { controller.dispose(); controllers.delete(binding); });
    return controller;
  };
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.plugin = 'omd-prompt-optimizer'; tag.textContent = css; document.head.append(tag);
    return () => { for (const controller of controllers.values()) controller.dispose(); controllers.clear(); preferences.dispose(); tag.remove(); };
  });
  function Settings() {
    const prefs = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot), [error, setError] = useState('');
    const set = patch => { try { preferences.set(patch); setError(''); } catch { setError('浏览器无法保存设置，原设置保持不变。'); } };
    return <section className="omd-opt-settings omd-opt-theme">
      <h2>提示词优化</h2><p>使用当前会话的模型，优化发送前的草稿。</p>
      <Toggle checked={prefs.enabled} onChange={enabled => set({ enabled })}>显示提示词优化入口</Toggle>
      <p>默认显示输入框星星。悬浮或展开抽屉可选择模式、回退版本并继续修改。</p>
      <Toggle checked={prefs.automatic} disabled={!prefs.enabled} onChange={automatic => set({ automatic })}>每次发送前自动润色</Toggle>
      <p>星星点亮时，每次发送先使用最低档“轻润色”，成功后自动发送。可随时点击星星关闭。润色会额外调用一次当前模型。</p>
      <p>偏好保存在当前浏览器。版本按会话隔离，发送后开始新的草稿；刷新页面后版本记录清空，当前草稿由宿主保存。</p>
      {error && <p role="alert">{error}</p>}
      <small>优化模板源自 <a href="https://github.com/linshenkx/prompt-optimizer/tree/93c37090846dd7ba9619a0ebc152f205624df9f1" target="_blank" rel="noreferrer">Prompt Optimizer（MIT 版本）</a>。</small>
    </section>;
  }
  function Optimizer({ sessionId, useInput }) {
    const controller = useMemo(() => controllerFor(sessionId), [sessionId]);
    return controller ? <Entry key={sessionId} controller={controller} useInput={useInput}/> : null;
  }
  function Entry({ controller, useInput }) {
    const prefs = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot), state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const input = useInput(s => s), [open, setOpen] = useState(false), [instruction, setInstruction] = useState(''), [localError, setLocalError] = useState('');
    const id = useId(), anchor = useRef(null), panel = useRef(null), timer = useRef(null), pinned = useRef(false);
    const [position, setPosition] = useState({ left: 8, bottom: 60, width: 370, maxHeight: 500 });
    useEffect(() => { controller.activate(); return () => { clearTimeout(timer.current); controller.deactivate(); }; }, [controller]);
    useEffect(() => { if (!prefs.enabled) { setOpen(false); clearTimeout(timer.current); } }, [prefs.enabled]);
    useEffect(() => { if (state.candidate || state.error) { pinned.current = true; setOpen(true); } }, [state.candidate, state.error]);
    const close = () => { clearTimeout(timer.current); pinned.current = false; setOpen(false); };
    const enter = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 220); };
    const leave = () => { clearTimeout(timer.current); if (!pinned.current && !state.busy && !panel.current?.contains(document.activeElement)) timer.current = setTimeout(() => setOpen(false), 300); };
    useLayoutEffect(() => {
      if (!open || !prefs.enabled) return;
      const place = () => { const rect = anchor.current?.getBoundingClientRect(); if (!rect) return; const width = Math.min(380, window.innerWidth - 16); setPosition({ width, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), bottom: Math.max(8, window.innerHeight - rect.top + 8), maxHeight: Math.max(100, rect.top - 16) }); };
      place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
      const outside = event => { if (!anchor.current?.contains(event.target) && !panel.current?.contains(event.target)) close(); };
      const escape = event => { if (event.key === 'Escape') { close(); anchor.current?.querySelector('button')?.focus(); } };
      document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
      return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
    }, [open, prefs.enabled]);
    const set = patch => { try { preferences.set(patch); setLocalError(''); } catch { setLocalError('设置保存失败，原设置保持不变。'); setOpen(true); } };
    const refine = () => { if (!instruction.trim()) { setLocalError('请先填写继续优化的要求'); return; } setLocalError(''); void controller.run({ instruction }); };
    if (!prefs.enabled) return null;
    const canOptimize = Boolean(input?.draft.trim()) && input.phase === 'plain' && !/^\s*\//.test(input.draft);
    return <div className="omd-opt-entry omd-opt-theme" ref={anchor} onPointerEnter={enter} onPointerLeave={leave}>
      <button type="button" className="omd-opt-star" aria-label={prefs.automatic ? '关闭自动润色' : '启用自动润色'} aria-pressed={prefs.automatic} title={prefs.automatic ? '自动轻润色已开启 · 点击关闭' : '提示词优化 · 点击开启自动轻润色'} onClick={() => set({ automatic: !prefs.automatic })} data-busy={state.busy || undefined}><Sparkle/></button>
      <button type="button" className="omd-opt-expand" aria-label="展开提示词优化" aria-expanded={open} aria-controls={id} onClick={() => { clearTimeout(timer.current); pinned.current = !open; setOpen(!open); }}>⌃</button>
      {state.busy && <button type="button" className="omd-opt-stop" aria-label="停止提示词优化" onClick={() => controller.cancel()}>停止</button>}
      {open && createPortal(<section id={id} ref={panel} className="omd-opt-drawer omd-opt-theme" style={position} role="dialog" aria-label="提示词优化" onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={leave} onFocus={() => { pinned.current = true; }}>
        <header><strong><Sparkle/>提示词优化</strong><span>跟随当前模型</span><button type="button" aria-label="关闭提示词优化抽屉" onClick={close}>×</button></header>
        <div className="omd-opt-modes" role="group" aria-label="优化模式">{OPTIMIZER_MODES.map(([mode, label]) => <button type="button" key={mode} disabled={!!state.busy} aria-pressed={mode === prefs.mode} onClick={() => set({ mode })}>{label}</button>)}</div>
        <p className="omd-opt-hint">{descriptions[prefs.mode]}</p>
        <Toggle checked={prefs.automatic} onChange={automatic => set({ automatic })}>每次发送前自动润色</Toggle><p className="omd-opt-hint">固定轻润色 · 成功后自动发送</p>
        <div className="omd-opt-actions"><span>范围：当前草稿</span><button type="button" className="omd-opt-primary" disabled={!state.busy && !canOptimize} onClick={() => state.busy ? controller.cancel() : void controller.run()}>{state.busy ? '停止优化' : '开始优化'}</button></div>
        {state.versions.length > 0 && <div className="omd-opt-history"><div className="omd-opt-actions"><label>版本 <select aria-label="提示词版本" value={state.cursor} disabled={!!state.busy} onChange={event => controller.selectVersion(Number(event.target.value))}>{state.versions.map((version, i) => <option key={i} value={i}>{version}</option>)}</select></label><div><button type="button" disabled={!!state.busy || state.cursor <= 0} onClick={() => controller.selectVersion(state.cursor - 1)}>撤销</button><button type="button" disabled={!!state.busy || state.cursor >= state.versions.length - 1} onClick={() => controller.selectVersion(state.cursor + 1)}>重做</button><button type="button" disabled={!!state.busy || state.cursor === 0} onClick={() => controller.selectVersion(0)}>恢复原稿</button></div></div>
          <div className="omd-opt-refine"><input aria-label="继续优化要求" placeholder="例如：更短一点，保留限制" value={instruction} onChange={event => setInstruction(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); refine(); } }}/><button type="button" disabled={!!state.busy || !canOptimize} onClick={refine}>继续优化</button></div>
        </div>}
        {state.candidate && <div className="omd-opt-candidate"><strong>优化结果待应用</strong><pre>{state.candidate.draft}</pre><button type="button" disabled={!!state.busy} onClick={() => controller.applyCandidate()}>应用此结果</button></div>}
        {(localError || state.error) && <p className="omd-opt-error" role="alert">{localError || state.error}</p>}
        {state.message && <p className="omd-opt-hint" role="status">{state.message}</p>}
      </section>, document.body)}
    </div>;
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'omd-prompt-optimizer', order: 18, label: () => '提示词优化' }, Settings));
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'omd-prompt-optimizer', order: 90 }, Optimizer));
}
