import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ProjectlessDrafts } from './projectless-state.mjs';
import css from './projectless-workspaces.css';

export function applyProjectlessWorkspaces(ctx) {
  const drafts = new ProjectlessDrafts(ctx);
  const useDrafts = () => useSyncExternalStore(drafts.subscribe, drafts.getSnapshot);
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.plugin = 'omd-projectless'; style.textContent = css; document.head.append(style);
    const workspace = ctx.uiWorkspace, original = workspace.startSession;
    function start(workspaceId, options) {
      const id = drafts.current();
      if (workspaceId !== undefined || !id) return original.call(workspace, workspaceId, options);
      if (drafts.isDraft(id) || drafts.isManaged(id)) { void drafts.startDraft(id, options); return; }
      // Discovery normally completes when the composer mounts. This read also
      // covers a New Session click immediately after a restored chat opens.
      void drafts.inspect(id).then(managed => {
        if (drafts.current() !== id || drafts.lifetime.signal.aborted) return;
        if (managed) return drafts.startDraft(id, options);
        original.call(workspace, workspaceId, options);
      }).catch(error => drafts.shell(id).notify('error', error.message));
    }
    workspace.startSession = start;
    return () => { if (workspace.startSession === start) workspace.startSession = original; drafts.dispose(); style.remove(); };
  });
  // Install before the owned Conversation provider. Transform its registration
  // once, retaining the original child-slot declarations and their authority.
  // Shadow registrations cannot redeclare these children.
  const components = new Map();
  const decorate = (name, render) => components.set(name, render);
  decorate('conversation.composer.bar', Original => function Composer(props) {
    useDrafts();
    const id = props.sessionId, active = drafts.isDraft(id) || drafts.isManaged(id);
    useEffect(() => { void drafts.inspect(id).catch(() => {}); }, [id]);
    useLayoutEffect(() => id ? drafts.installSubmit(id) : undefined, [id]);
    const next = { ...props };
    if (active && next.onRequestWorkspace) {
      delete next.disabled; delete next.onRequestWorkspace; delete next.workspacePickerOpen; delete next.placeholder;
    }
    if (drafts.isBusy(id)) next.blocked = { reason: '正在创建独立工作区…' };
    return <Original {...next}/>;
  });
  decorate('conversation.hero.workspace', Original => function Picker(props) {
    useDrafts();
    const sessions = props.useSessions(s => s);
    const id = drafts.current(), pending = drafts.isDraft(id), managed = drafts.isManaged(id);
    const [open, setOpen] = useState(false), anchor = useRef(null);
    useEffect(() => { setOpen(false); void drafts.inspect(id).catch(() => {}); }, [id]);
    const pick = workspaceId => {
      if (drafts.isBusy(id)) return;
      // A refused navigation must leave the cancelled source projectless.
      // Choosing its original Workspace explicitly restores that selection.
      if (workspaceId === props.selectedId) drafts.clear(id);
      setOpen(false); props.onPick(workspaceId);
    };
    if (pending || managed) return <>
      <span className="omd-projectless-picker"/>
      <button ref={anchor} type="button" className="omd-projectless-trigger" aria-haspopup="menu" aria-expanded={open}
        disabled={drafts.isBusy(id)} onClick={() => setOpen(value => !value)} title="未选择工作区；发送后使用此聊天的独立文件夹">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M2.5 6V4.5h5L9 6h8.5v9.5h-15Z"/></svg>
        选择工作区
      </button>
      <Original {...props} open={open} anchorRef={anchor} selectedId={undefined} onPick={pick} onClose={() => setOpen(false)}/>
    </>;
    return <>
      <button type="button" className="omd-workspace-clear" aria-label="取消工作区" title="不在工作区中工作"
        disabled={!id || !props.selectedId} onClick={() => { props.onClose(); try { drafts.mark(id); } catch { drafts.shell(id).notify('error', '浏览器无法保存草稿，请检查存储空间后重试'); } }}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8M4 12l8-8"/></svg>
      </button>
      <Original {...props} onPick={pick}/>
    </>;
  });
  ctx.effect(() => {
    const registry = ctx.slots, original = registry.register;
    function register(options, component) {
      const render = components.get(options.name);
      return original.call(this, options, render ? render(component) : component);
    }
    registry.register = register;
    return () => { if (registry.register === register) registry.register = original; };
  });
  return drafts;
}
