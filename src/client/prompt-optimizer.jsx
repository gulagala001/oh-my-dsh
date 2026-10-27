import { Icon } from './native-icons.jsx';
import { Button, Input, Select, SegmentedControl, isSelectMenuTarget } from './native-controls.jsx';
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createOptimizerPreferences, DraftOptimizer, OPTIMIZER_MODES, optimizerRequirements } from './prompt-optimizer-state.mjs';
import css from './prompt-optimizer.css';
import { isSubagentSession, useMainConversation } from './main-conversation.mjs';

const descriptions = { basic: '只润色表达，保留原意和限制。', structured: '整理已有目标、约束与交付要求。', planning: '将现有任务组织为可执行的步骤。' };
function Sparkle() { return <Icon name="spark" size={16}/>; }

export function applyPromptOptimizer(ctx) {
  const preferences = createOptimizerPreferences(), controllers = new Map(), drafts = new Map();
  let closed = false;
  const controllerFor = sessionId => {
    if (ctx.sessions.subagentAddress(sessionId) !== undefined || isSubagentSession(ctx.sessions.list.getSnapshot(), sessionId)) return null;
    const binding = ctx.sessions.binding(sessionId);
    if (!binding) return null;
    const saved = controllers.get(binding);
    if (saved) return saved;
    const shell = ctx.get('conversation').input.for(binding.ctx);
    const controller = new DraftOptimizer({ sessionId, shell, preferences }); controllers.set(binding, controller);
    controller.restoreNavigation(drafts.get(sessionId)); drafts.delete(sessionId);
    binding.ctx.effect(() => () => {
      if (!closed && !binding.session.getSnapshot().removed) {
        const saved = controller.navigationState();
        if (saved) drafts.set(sessionId, saved);
      }
      controller.dispose(); controllers.delete(binding);
    });
    return controller;
  };
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.plugin = 'omd-prompt-optimizer'; tag.textContent = css; document.head.append(tag);
    const off = ctx.remote.$on('api-session/removed', id => {
      if (ctx.sessions.subagentAddress(id) !== undefined || ctx.sessions.list.getSnapshot().byId[id]?.origin === 'subagent') return;
      drafts.delete(id);
    });
    return () => { closed = true; off(); for (const controller of controllers.values()) controller.dispose(); controllers.clear(); drafts.clear(); preferences.dispose(); tag.remove(); };
  });
  function Optimizer(props) {
    const main = useMainConversation(props);
    return main ? <MainOptimizer {...props}/> : null;
  }
  function MainOptimizer({ sessionId, useInput }) {
    const controller = useMemo(() => controllerFor(sessionId), [sessionId]);
    return controller ? <Entry key={sessionId} controller={controller} useInput={useInput}/> : null;
  }
  function Entry({ controller, useInput }) {
    const prefs = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot), state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const input = useInput(s => s), [open, setOpen] = useState(false), [localError, setLocalError] = useState('');
    const [presetName, setPresetName] = useState('');
    const requirements = optimizerRequirements(prefs), selectedPreset = prefs.requirementPresets.find(p => p.id === prefs.requirementPreset);
    useLayoutEffect(() => { setPresetName(selectedPreset?.name ?? ''); }, [prefs.requirementPreset, selectedPreset?.name]);
    const instruction = state.instruction, setInstruction = instruction => controller.publish({ instruction });
    const id = useId(), anchor = useRef(null), panel = useRef(null), closeTimer = useRef(null);
    const [position, setPosition] = useState({ left: 8, bottom: 60, width: 370, maxHeight: 500 });
    useEffect(() => { controller.activate(); return () => controller.deactivate(); }, [controller]);
    useEffect(() => { if (!prefs.enabled) setOpen(false); }, [prefs.enabled]);
    useEffect(() => { if (state.candidate || state.error) setOpen(true); }, [state.candidate, state.error]);
    const cancelClose = () => { clearTimeout(closeTimer.current); closeTimer.current = null; };
    const reveal = () => { cancelClose(); setOpen(true); };
    const close = () => { cancelClose(); setOpen(false); };
    const leave = () => {
      cancelClose();
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        if (!panel.current?.contains(document.activeElement) && !isSelectMenuTarget(document.activeElement)) setOpen(false);
      }, 150);
    };
    const blur = event => {
      if (!anchor.current?.contains(event.relatedTarget) && !panel.current?.contains(event.relatedTarget) && !isSelectMenuTarget(event.relatedTarget)) close();
    };
    useEffect(() => cancelClose, []);
    useLayoutEffect(() => {
      if (!open || !prefs.enabled) return;
      const place = () => { const rect = anchor.current?.getBoundingClientRect(); if (!rect) return; const width = Math.min(380, window.innerWidth - 16); setPosition({ width, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), bottom: Math.max(8, window.innerHeight - rect.top + 8), maxHeight: Math.max(100, rect.top - 16) }); };
      place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
      const outside = event => { if (!anchor.current?.contains(event.target) && !panel.current?.contains(event.target) && !isSelectMenuTarget(event.target)) close(); };
      const escape = event => { const active = document.activeElement; if (event.key === 'Escape' && !event.defaultPrevented && !isSelectMenuTarget(event.target) && (active === document.body || anchor.current?.contains(active) || panel.current?.contains(active))) { event.preventDefault(); close(); anchor.current?.querySelector('button')?.focus(); } };
      document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
      return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
    }, [open, prefs.enabled]);
    const set = patch => { try { preferences.set(patch); setLocalError(''); } catch { setLocalError('设置保存失败，原设置保持不变。'); setOpen(true); } };
    const changeRequirements = action => { try { action(); setLocalError(''); } catch (error) { setLocalError(error.message || '设置保存失败，原设置保持不变。'); } };
    const refine = () => { if (!instruction.trim()) { setLocalError('请先填写继续优化的要求'); return; } setLocalError(''); void controller.run({ instruction }); };
    if (!prefs.enabled) return null;
    const editingBlocked = !!state.busy;
    const canOptimize = Boolean(input?.draft.trim()) && input.phase === 'plain' && !/^\s*\//.test(input.draft);
    return <div className="omd-opt-entry omd-opt-theme" ref={anchor} onPointerEnter={event => { if (event.pointerType !== 'touch') reveal(); }} onPointerLeave={leave} onBlur={blur}>
      <Button size="sm" variant="outline" type="button" className="omd-opt-star" aria-label={prefs.automatic ? '提示词优化：每次都优化已开启，点击关闭' : '提示词优化：点击开启每次都优化'} aria-pressed={prefs.automatic} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" title={prefs.automatic ? '每次都优化已开启 · 点击关闭 · 悬停展开' : '点击开启每次都优化 · 悬停展开'} onFocus={event => { if (!panel.current?.contains(event.relatedTarget)) reveal(); }} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); reveal(); requestAnimationFrame(() => panel.current?.querySelector('button')?.focus()); } }} onClick={() => { reveal(); set({ automatic: !prefs.automatic }); }} data-busy={state.busy || undefined}><Sparkle/></Button>
      {open && createPortal(<section id={id} ref={panel} className="omd-opt-drawer omd-opt-theme" style={position} role="dialog" aria-label="提示词优化" onPointerEnter={cancelClose} onPointerLeave={leave} onBlur={blur}>
        <header><strong><Sparkle/>提示词优化</strong><span>跟随当前模型</span><Button size="sm" variant="outline" type="button" aria-label="关闭提示词优化浮层" onClick={close}>×</Button></header>
        <p className="omd-opt-hint" role="status">每次都优化：{prefs.automatic ? '已开启' : '已关闭'}。点击输入框的 ✨ 切换，发送前自动轻润色。</p>
        <SegmentedControl id={id+"-mode"} label="优化模式" value={prefs.mode} disabled={!!state.busy} options={OPTIMIZER_MODES.map(([value, label]) => ({ value, label }))} onChange={mode => set({ mode })}/>
        <p className="omd-opt-hint" role="tabpanel" id={id+"-mode-"+prefs.mode+"-panel"} aria-labelledby={id+"-mode-"+prefs.mode}>{descriptions[prefs.mode]}</p>
        <div className="omd-opt-requirements">
          <label className="omd-opt-actions">额外要求 <Select aria-label="额外要求预设" value={prefs.requirementPreset} disabled={!!state.busy} onChange={event => changeRequirements(() => preferences.selectRequirementPreset(event.target.value))}><option value="">自定义</option>{prefs.requirementPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
          <textarea aria-label="额外优化要求" rows={3} maxLength={64000} disabled={!!state.busy} placeholder="可选，例如：保留技术细节，使用简体中文" value={requirements} onChange={event => changeRequirements(() => preferences.setRequirements(event.target.value))}/>
          <div className="omd-opt-preset-save"><Input aria-label="要求预设名称" maxLength={80} disabled={!!state.busy} placeholder="预设名称" value={presetName} onChange={event => setPresetName(event.target.value)}/><Button size="sm" variant="outline" type="button" disabled={!!state.busy} onClick={() => changeRequirements(() => preferences.saveRequirementPreset(presetName))}>{selectedPreset ? '保存修改' : '保存预设'}</Button></div>
          {selectedPreset && <div className="omd-opt-actions"><span>{Object.hasOwn(prefs.requirementDrafts, selectedPreset.id) ? '要求已暂存，保存修改可更新预设' : '已选择保存的预设'}</span><div><Button size="sm" variant="outline" type="button" disabled={!!state.busy} onClick={() => changeRequirements(() => preferences.saveRequirementPreset(presetName, true))}>另存为预设</Button><Button size="sm" variant="outline" type="button" disabled={!!state.busy} onClick={() => changeRequirements(() => preferences.removeRequirementPreset())}>删除预设</Button></div></div>}
          <p className="omd-opt-hint">用于首次和后续优化；留空沿用原行为。切换保留已编辑要求，刷新后仍可使用。</p>
        </div>
        <div className="omd-opt-actions"><span>范围：当前草稿</span><Button size="sm" variant="primary" type="button" className="omd-opt-primary" disabled={!state.busy && !canOptimize} onClick={() => state.busy ? controller.cancel() : void controller.run()}>{state.busy ? '停止优化' : '开始优化'}</Button></div>
        {state.versions.length > 0 && <div className="omd-opt-history"><div className="omd-opt-actions"><label>版本 <Select aria-label="提示词版本" value={state.cursor} disabled={editingBlocked} onChange={event => controller.selectVersion(Number(event.target.value))}>{state.versions.map((version, i) => <option key={i} value={i}>{version}</option>)}</Select></label><div><Button size="sm" variant="outline" type="button" disabled={editingBlocked || state.cursor <= 0} onClick={() => controller.selectVersion(state.cursor - 1)}>撤销</Button><Button size="sm" variant="outline" type="button" disabled={editingBlocked || state.cursor >= state.versions.length - 1} onClick={() => controller.selectVersion(state.cursor + 1)}>重做</Button><Button size="sm" variant="outline" type="button" disabled={editingBlocked || state.cursor === 0} onClick={() => controller.selectVersion(0)}>恢复原稿</Button></div></div>
          <div className="omd-opt-refine"><Input aria-label="继续优化要求" placeholder="例如：更短一点，保留限制" value={instruction} onChange={event => setInstruction(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); refine(); } }}/><Button size="sm" variant="outline" type="button" disabled={!!state.busy || !canOptimize} onClick={refine}>继续优化</Button></div>
        </div>}
        {state.candidate && <div className="omd-opt-candidate"><strong>优化结果待应用</strong><pre>{state.candidate.draft}</pre><Button size="sm" variant="outline" type="button" disabled={editingBlocked} onClick={() => controller.applyCandidate()}>应用此结果</Button></div>}
        {state.recoveries.map(({ id, draft }) => <div className="omd-opt-candidate" key={id}><strong>保留的草稿版本</strong><pre>{draft}</pre><Button size="sm" variant="outline" type="button" disabled={editingBlocked} onClick={() => controller.inspectRecovery(id)}>查看这份原稿与版本</Button></div>)}
        {(localError || state.error) && <p className="omd-opt-error" role="alert">{localError || state.error}</p>}
        {state.message && <p className="omd-opt-hint" role="status">{state.message}</p>}
        <p className="omd-opt-hint">悬停 ✨ 展开此浮层；键盘聚焦后按 ↓ 进入。优化模板源自 <a href="https://github.com/linshenkx/prompt-optimizer/tree/93c37090846dd7ba9619a0ebc152f205624df9f1" target="_blank" rel="noreferrer">Prompt Optimizer（MIT 版本）</a>。</p>
      </section>, document.body)}
    </div>;
  }
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'omd-prompt-optimizer', order: 90 }, Optimizer));
  return { preferences };
}
