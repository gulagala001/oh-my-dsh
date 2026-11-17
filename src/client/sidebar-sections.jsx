import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconSearchOutlineRegular, IconNewChatOutlineRegular, IconPinOutlineRegular, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { createSidebarNative } from '../../lib/host/sidebar-native.factory.mjs';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { Collapse } from './motion.mjs';
import css from './sidebar-sections.css';
import { sidebarSections, mergeVisibleOrder, readSectionExpansion, SECTION_STORAGE_KEY } from './sidebar-sections.mjs';

const native = createSidebarNative(require);
const labels = { zh: { pinned:'置顶',recent:'最近',pinCurrent:'置顶当前会话',emptyPinned:'暂无置顶会话',emptyWorkspaces:'暂无工作区',emptyRecent:'暂无最近会话',deleteDesc:'将把“{name}”从工作区列表中移除。文件夹与会话记录保留，会话仍可在“最近”中打开。' },
  en: { pinned:'Pinned',recent:'Recent',pinCurrent:'Pin current chat',emptyPinned:'No pinned chats',emptyWorkspaces:'No workspaces',emptyRecent:'No recent chats',deleteDesc:'Remove “{name}” from Workspaces. Its folder and chats remain; find the chats in Recent.' } };
const cx = (...parts) => parts.filter(Boolean).join(' ');

function PinCurrent({ sessionId, useSessionAccess, onPin, label }) {
  const allowed = useSessionAccess(sessionId, 'workspace/pinSession');
  return <button className={native.styles.iconButton} type="button" aria-label={label} title={label} disabled={!allowed} onClick={onPin}><IconPinOutlineRegular size={16}/></button>;
}

function Sections({ element, state, props, t, pin }) {
  const [expansion, setExpansion] = useState(readSectionExpansion), [searchOwner, setSearchOwner] = useState('workspaces');
  const [limit, setLimit] = useState(10), [error, setError] = useState('');
  const focusFrame = useRef(), id = useId();
  useEffect(() => () => cancelAnimationFrame(focusFrame.current), []);
  const children = React.Children.toArray(element.props.children);
  const header = children.find(child => child.props?.['data-sidebar-workspace-header'] !== undefined);
  const area = children.find(child => child.props?.['data-sidebar-list-area'] !== undefined);
  const headerChildren = React.Children.toArray(header.props.children);
  const search = headerChildren.find(child => child.props?.className?.split(' ').includes(native.styles.searchSlot));
  const actions = headerChildren.find(child => child.props?.className?.split(' ').includes(native.styles.headerActions));
  const actionChildren = React.Children.toArray(actions.props.children);
  const options = actionChildren.find(child => child.type === native.ViewOptionsMenu);
  const addWorkspace = actionChildren.find(child => child !== options);
  const flow = headerChildren.find(child => child !== search && child !== actions && child.type !== 'span');
  const sections = sidebarSections(state, native.visibleSessionIds);
  const expanded = key => expansion[key] !== false;
  const setExpanded = (key, value) => setExpansion(previous => {
    const next = { ...previous, [key]: value };
    try { localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(next)); } catch {}
    return next;
  });
  const revealSection = state.revealSessionId && (sections.pinned.includes(state.revealSessionId) ? 'pinned' : 'recent');
  useLayoutEffect(() => {
    if (!revealSection) return;
    setExpanded(revealSection, true);
    if (revealSection === 'recent') setLimit(value => Math.max(value, sections.recent.indexOf(state.revealSessionId) + 1));
  }, [state.revealSessionId, revealSection]);
  const openSearch = key => {
    setSearchOwner(key); setExpanded(key, true); state.requestSearch();
    cancelAnimationFrame(focusFrame.current); focusFrame.current = requestAnimationFrame(state.focusSearch);
  };
  const filtered = Boolean(state.normalizedQuery), current = state.list.byId[state.currentSessionId];
  const canPin = current && !current.blank && !state.rowState.archivedSessionIds.includes(current.id) && !state.rowState.pinnedSessionIds.includes(current.id);
  const canCreate = props.useRemoteAccess?.('session/create') ?? false;
  const names = { pinned:t('pinned'),workspaces:props.t('section.workspaces'),recent:t('recent') };
  const empty = { pinned:t('emptyPinned'),workspaces:t('emptyWorkspaces'),recent:t('emptyRecent') };
  const renderSection = key => {
    const isSearch = state.searchExpanded && searchOwner === key;
    const open = isSearch || expanded(key), bodyId = `${id}-${key}`;
    const bodyOpen = open && (!filtered || searchOwner === key) && (key !== 'pinned' || sections.pinned.length > 0 || filtered);
    const heading = <button type="button" className="omd-sidebar-section-toggle" aria-expanded={bodyOpen} aria-controls={bodyId}
      onClick={() => setExpanded(key, !expanded(key))}>
      <span>{names[key]}</span><IconChevronDownOutlineRegular size={14}/>
    </button>;
    const searchControl = searchOwner === key ? search : <button type="button" className={native.styles.iconButton} aria-label={props.t('search.sessions.aria')} title={props.t('search')} onClick={() => openSearch(key)}><IconSearchOutlineRegular size={14}/></button>;
    const add = key === 'workspaces' ? addWorkspace : key === 'recent'
      ? <button className={native.styles.iconButton} type="button" disabled={!canCreate} aria-label={props.t('session.new')} title={props.t('session.new')} onClick={() => state.startSession(undefined, {clearPreviousDraft:true})}><IconNewChatOutlineRegular size={16}/></button>
      : canPin ? <PinCurrent sessionId={current.id} useSessionAccess={props.useSessionAccess} label={t('pinCurrent')} onPin={() => { setError(''); void pin(current.id).catch(reason => setError(reason.message || String(reason))); }}/>
        : <button className={native.styles.iconButton} type="button" disabled aria-label={t('pinCurrent')} title={t('pinCurrent')}><IconPinOutlineRegular size={16}/></button>;
    const toolbar = React.cloneElement(header, { className:cx(native.styles.sectionHeader,'omd-sidebar-section-header'), 'data-search-open':isSearch || undefined },
      !isSearch && heading,
      <div className="omd-sidebar-section-actions">{searchControl}{!isSearch && <>{options && React.cloneElement(options,{omdSection:key,groupBy:state.groupBy==='workspace-tree'?'workspace-tree':'workspace'})}{add}</>}</div>,
      key === 'workspaces' && flow);
    let content;
    if (filtered) content = searchOwner === key ? area.props.children : null;
    else if (key === 'workspaces') content = state.renderTree({revealSessionId:undefined, t:(name,...args)=>name==='empty.none'?empty.workspaces:props.t(name,...args)});
    else {
      const ids = key === 'pinned' ? sections.pinned : sections.recent.slice(0,limit);
      content = state.renderFlat({sessionIds:ids,omdAllowReorder:key==='pinned',revealSessionId:revealSection===key?state.revealSessionId:undefined,
        setSessionOrder:(account,order)=>state.saveSessionOrder(account,mergeVisibleOrder(state.orderedFlatSessionIds,order)),
        t:(name,...args)=>name==='section.sessions'?names[key]:name==='empty.none'?empty[key]:props.t(name,...args)});
    }
    return <section key={key} data-omd-sidebar-section={key}>
      {toolbar}
      {key === 'pinned' && error && <p className="omd-sidebar-section-error" role="alert">{error}</p>}
      <Collapse open={bodyOpen} id={bodyId}>
        {content}
        {!filtered && key==='recent' && sections.recent.length>10 && <button type="button" className="omd-sidebar-section-more" onClick={()=>setLimit(limit>=sections.recent.length?10:limit+20)}>
          {limit>=sections.recent.length?props.t('sessions.collapse'):props.t('sessions.expand',{n:sections.recent.length-limit})}
        </button>}
      </Collapse>
    </section>;
  };
  return React.cloneElement(element, {'data-omd-sidebar-sections':'',className:cx(element.props.className,'omd-sidebar-sections')},
    React.cloneElement(area, {className:cx(area.props.className,'omd-sidebar-sections-scroll')}, ['pinned','workspaces','recent'].map(renderSection)),
    children.filter(child=>child!==header && child!==area));
}

export function installSidebarSections(ctx) {
  ctx.effect(() => ctx.locale.register('omdSidebarSections', labels));
  const t = ctx.locale.bind('omdSidebarSections');
  ctx.effect(() => {const style=document.createElement('style');style.textContent=css;document.head.append(style);return()=>style.remove();});
  ctx.slots.inject('sidebar.workspaces', () => decorateSlotComponent(ctx.slots,'sidebar.workspaces',(_key,entry)=>entry.locale==='workspace' && entry.children?.['sidebar.workspaces.session.row.action']?.kind==='list', () => {
    return function WorkspaceBrowser(props) {
      const translate = useCallback((key, values) => key === 'group.ungrouped' ? t('recent') : key === 'delete.desc' ? t('deleteDesc', values) : props.t(key, values), [props.t]);
      const render = useCallback((element,state)=>state.wide?<Sections element={element} state={state} props={{...props,t:translate}} t={t} pin={id=>ctx.uiWorkspace.pinSession(id)}/>:element,[props,translate]);
      return <native.WorkspaceBrowser {...props} t={translate} omdRender={render}/>;
    };
  }));
}
