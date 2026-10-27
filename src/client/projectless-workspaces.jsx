import { Icon } from './native-icons.jsx';
import { Button } from './native-controls.jsx';
import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ProjectlessDrafts } from './projectless-state.mjs';
import { decorateSlotComponent } from './slot-decoration.mjs';
import css from './projectless-workspaces.css';

export function applyProjectlessWorkspaces(ctx, { onError = error => console.error('新会话创建失败', error) } = {}) {
  const drafts = new ProjectlessDrafts(ctx);
  let initialPreset;
  ctx.effect(() => decorateSlotComponent(ctx.slots, 'conversation.hero.agentPreset', () => true, entry => {
    const Original = entry.component;
    return function Preset(props) {
      const id = props.useAgentPresetSeat(state => state.current);
      useLayoutEffect(() => {
        if (props.sessionId !== undefined) return;
        const selection = { id }; initialPreset = selection;
        return () => { if (initialPreset === selection) initialPreset = undefined; };
      }, [id, props.sessionId]);
      return <Original {...props}/>;
    };
  }));
  const useDrafts = () => useSyncExternalStore(drafts.subscribe, drafts.getSnapshot);
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.plugin = 'omd-projectless'; style.textContent = css; document.head.append(style);
    const workspace = ctx.uiWorkspace, original = workspace.startSession, originalOpen = workspace.openWorkspace, originalRestore = workspace.restoreSelection;
    let initialCreations = 0;
    // A failed initial restore retries on every Session-list update. During an
    // explicit first creation, that retry would cancel the user's navigation
    // and try the broken default again. Native Session creation still owns
    // admission and validates whether the requested blank can be reused.
    function restore(...args) {
      if (initialCreations) return Promise.resolve();
      return originalRestore.apply(this, args);
    }
    workspace.restoreSelection = restore;
    drafts.openInitialWorkspace = async (workspaceId, agentPreset) => {
      if (drafts.lifetime.signal.aborted) return;
      initialCreations++;
      try { await drafts.startDraft(undefined, { agentPreset }, workspaceId); }
      finally { initialCreations--; }
    };
    function start(workspaceId, options) {
      return drafts.startDraft(drafts.current(), options, workspaceId).catch(onError);
    }
    workspace.startSession = start;
    const openWorkspace = (id, beforeOpen, options) => drafts.startDraft(drafts.current(), options, id, beforeOpen);
    workspace.openWorkspace = openWorkspace;
    // The native Ungrouped row renders a create button but its onCreate skips
    // groups without a Workspace. Keep that row and route only its button to
    // the existing projectless draft flow, without inheriting a Workspace.
    const onUngroupedCreate = event => {
      if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
      const button = event.target.closest('button');
      if (!button || button.disabled || !button.closest('[class*="_rowActions"]')
        || button.closest('[role="treeitem"]')?.dataset.rowKey !== 'workspace:') return;
      event.preventDefault(); event.stopPropagation();
      void start();
    };
    document.addEventListener('click', onUngroupedCreate, true);
    return () => {
      document.removeEventListener('click', onUngroupedCreate, true);
      if (workspace.startSession === start) workspace.startSession = original;
      if (workspace.openWorkspace === openWorkspace) workspace.openWorkspace = originalOpen;
      if (workspace.restoreSelection === restore) workspace.restoreSelection = originalRestore;
      drafts.dispose(); style.remove();
    };
  });
  // Install before the owned Conversation provider. Transform its registration
  // once, retaining the original child-slot declarations and their authority.
  // Shadow registrations cannot redeclare these children.
  const components = new Map();
  const decorate = (name, render) => components.set(name, render);
  decorate('conversation.composer.bar', Original => function Composer(props) {
    useDrafts();
    const id = props.sessionId, active = drafts.isManaged(id);
    useEffect(() => { void drafts.inspect(id).catch(() => {}); }, [id]);
    if (drafts.lifetime.signal.aborted) return <Original {...props}/>;
    const next = { ...props };
    if (active && next.onRequestWorkspace) {
      delete next.disabled; delete next.onRequestWorkspace; delete next.workspacePickerOpen; delete next.placeholder;
    }
    return <Original {...next}/>;
  });
  decorate('conversation.hero.workspace', Original => function Picker(props) {
    useDrafts();
    const id = drafts.current(), managed = drafts.isManaged(id);
    const [open, setOpen] = useState(false), anchor = useRef(null);
    useEffect(() => { setOpen(false); void drafts.inspect(id).catch(() => {}); }, [id]);
    if (drafts.lifetime.signal.aborted) return <Original {...props}/>;
    const pick = workspaceId => {
      // The native unbound seat applies its staged preset only after a Session
      // exists. Forward the actual selection to first creation so an invalid
      // deployment default cannot block a different, healthy preset.
      if (id === undefined && initialPreset?.id) {
        props.onClose();
        void drafts.openInitialWorkspace(workspaceId, initialPreset.id).catch(error => {
          if (!drafts.lifetime.signal.aborted) onError(error);
        });
        return;
      }
      setOpen(false); props.onClose();
      void drafts.startDraft(id, undefined, workspaceId).catch(onError);
    };
    if (managed) return <>
      <span className="omd-projectless-picker"/>
      <Button size="sm" variant="ghost" ref={anchor} type="button" className="omd-projectless-trigger" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(value => !value)} title="未选择工作区；使用此聊天的独立文件夹">
        <Icon name="folder" size={16}/>
        选择工作区
      </Button>
      <Original {...props} open={open} anchorRef={anchor} selectedId={undefined} onPick={pick} onClose={() => setOpen(false)}/>
    </>;
    return <>
      <Button size="sm" variant="ghost" type="button" className="omd-workspace-clear" aria-label="取消工作区" title="不在工作区中工作"
        disabled={!id || !props.selectedId} onClick={() => { props.onClose(); void drafts.startDraft(id).catch(onError); }}>
        <Icon name="close" size={14}/>
      </Button>
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
