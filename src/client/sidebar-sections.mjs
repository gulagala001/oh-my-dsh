export const SECTION_STORAGE_KEY = 'omd.sidebar.sections.v1';
export function readSectionExpansion() {
  try {
    const value = JSON.parse(localStorage.getItem(SECTION_STORAGE_KEY) || '{}');
    return Object.fromEntries(['pinned','workspaces','recent'].map(key=>[key,value?.[key]!==false]));
  } catch { return {pinned:true,workspaces:true,recent:true}; }
}
/** Derive section membership without changing native workspace ownership. */
export function sidebarSections(state, visibleSessionIds) {
  const visible = new Set(visibleSessionIds(state.list,state.rowState.archivedSessionIds,state.rowState.archivedFilter));
  const archived = new Set(state.rowState.archivedSessionIds);
  const pinned = new Set(state.rowState.pinnedSessionIds.filter(id=>!archived.has(id)));
  return {pinned:state.orderedFlatSessionIds.filter(id=>visible.has(id)&&pinned.has(id)),
    recent:state.recentSessionIds.filter(id=>visible.has(id)&&!pinned.has(id))};
}
/** Native drag orders a subset; preserve hidden and non-pinned account members. */
export function mergeVisibleOrder(complete, ordered) {
  const members = new Set(complete), unique = [...new Set(ordered)].filter(id=>members.has(id));
  const selected = new Set(unique); let index=0;
  return complete.map(id=>selected.has(id)?unique[index++]:id);
}
