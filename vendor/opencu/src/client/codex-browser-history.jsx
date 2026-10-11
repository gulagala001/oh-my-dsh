import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuButton, CodexCuMenuItem, CodexCuMenuSurface, CodexCuSpinner } from './codex-cu-primitives.jsx';
import './codex-cu-tokens.css';
import './codex-cu-typography.css';
import './codex-browser-history.css';
import { CodexCuScope } from './codex-cu-scope.jsx';

// Presentation adapter for Gr/Kr/qr/Br from the shipped browser settings bundle.
// Entries are the host's already searched/paged result. This component never reads
// browsing data or invokes a browser service; all actions go through supplied callbacks.
export const codexHistoryEntryKey = entry => `${entry.url}\0${entry.visitTime}\0${entry.isActorVisit === true}`;
const removalKey = entry => `${entry.url}\0${new Date(entry.visitTime).toDateString()}`;

export function groupCodexHistory(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = new Date(entry.visitTime).toDateString();
    if (!groups.has(key)) groups.set(key, { key, visitTime: entry.visitTime, entries: [] });
    groups.get(key).entries.push(entry);
  }
  return Array.from(groups.values());
}

function HistoryMenu({ trigger, label, children, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const anchor = useRef(null);
  const surface = useRef(null);
  const scope = anchor.current?.closest('[data-codex-cu-scope]');
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const target = anchor.current?.getBoundingClientRect(), menu = surface.current?.getBoundingClientRect();
      if (!target || !menu) return;
      // yji: align=end, sideOffset=1, collisionPadding=6.
      const topSide = target.bottom + 1 + menu.height > window.innerHeight - 6 && target.top - 1 - menu.height >= 6;
      setPosition({ left: Math.max(6, Math.min(target.right - menu.width, window.innerWidth - menu.width - 6)),
        top: topSide ? target.top - 1 - menu.height : target.bottom + 1, side: topSide ? 'top' : 'bottom' });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!anchor.current?.contains(event.target) && !surface.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); anchor.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return <div className="codex-history-menu-anchor" ref={anchor}>
    {React.cloneElement(trigger, { disabled, 'aria-haspopup': 'menu', 'aria-expanded': open,
      onClick: event => { event.stopPropagation(); if (!disabled) setOpen(value => !value); } })}
    {open && !disabled && scope && createPortal(<CodexCuScope forceScope>
    <CodexCuMenuSurface ref={surface} open align="end" side={position?.side ?? 'bottom'} contentWidth="menu" aria-label={label}
      style={{ position: 'fixed', left: position?.left, top: position?.top, visibility: position ? undefined : 'hidden',
        '--radix-dropdown-menu-content-available-width': `${window.innerWidth - 12}px`,
        '--radix-dropdown-menu-content-available-height': `${window.innerHeight - 12}px` }}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
        const items = Array.from(event.currentTarget.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])'));
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement);
        if (event.key === 'Enter' || event.key === ' ') { document.activeElement?.click(); return; }
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ?
          (event.key === 'ArrowUp' ? items.length - 1 : 0) : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next].focus();
      }}>
      {React.Children.map(children, child => React.isValidElement(child) ? React.cloneElement(child, {
        onSelect: event => { child.props.onSelect?.(event); setOpen(false); },
      }) : child)}
    </CodexCuMenuSurface></CodexCuScope>, document.body)}
  </div>;
}

function HistoryRow({ entry, checked, disabled, canRemove, selectionAvailable, locale, onOpen, onRemove, onSelect }) {
  // This is the source contract: URL must be absolute; favicon must be image data.
  const hostname = new URL(entry.url).hostname || entry.url;
  const title = entry.title || hostname;
  const favicon = entry.faviconDataURL?.startsWith('data:image/') ? entry.faviconDataURL : null;
  const checkboxId = `browser-browsing-history-entry-${entry.id}-${entry.visitTime}-${entry.isActorVisit === true}`;
  return <div className="codex-history-row codex-history-row-compact">
    <div className="codex-history-row-left">
      <div className="codex-history-actions" style={{ gap: 'calc(var(--spacing) * 3)' }}>
        {selectionAvailable && <button id={checkboxId} type="button" role="checkbox" aria-checked={checked} aria-label={`Select ${title}`}
          className="codex-history-checkbox" disabled={disabled || !canRemove} onClick={() => onSelect(!checked)}>
          {checked && <CodexCuIcon name="shared:checkbox-check" size={12} aria-hidden="true" />}
        </button>}
        {favicon ? <img className="codex-history-icon codex-history-favicon" alt="" src={favicon} /> :
          <CodexCuIcon name="shared:OD" className="codex-history-icon" aria-hidden="true" />}
      </div>
      <div className="codex-history-row-label">
        <a href={entry.url} aria-disabled={disabled} aria-label={`Open ${title}`} tabIndex={disabled ? -1 : undefined}
          className="codex-history-page-link" onClick={event => { event.preventDefault(); if (!disabled) onOpen?.(entry, event); }}>
          <span className="codex-history-truncate">{title}</span>
          <span className="codex-history-truncate codex-history-secondary">{hostname}</span>
        </a>
      </div>
    </div>
    <div className="codex-history-row-control">
      <div className="codex-history-actions">
        {entry.isActorVisit === true && <span className="codex-history-agent">Agent</span>}
        <span className="codex-history-time">{new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: 'numeric' }).format(entry.visitTime)}</span>
        <HistoryMenu label={`Actions for ${title}`} disabled={disabled}
          trigger={<button type="button" className="codex-history-more" data-color="secondary" data-variant="ghost" data-size="md" data-icon-size="sm" data-uniform="" data-disabled={disabled ? '' : undefined} aria-disabled={disabled} tabIndex={disabled ? -1 : undefined} aria-label={`Actions for ${title}`}>
            <span className="codex-history-more-inner"><CodexCuIcon name="shared:Iet" aria-hidden="true" /></span>
          </button>}>
          <CodexCuMenuItem leftIcon={<CodexCuIcon name="shared:$lt" />} onSelect={() => onOpen?.(entry)}>Open page</CodexCuMenuItem>
          <CodexCuMenuItem leftIcon={<CodexCuIcon name="shared:$ot" />} disabled={disabled || !canRemove}
            onSelect={() => onRemove?.([{ url: entry.url, visitTime: entry.visitTime }])}>Remove from history</CodexCuMenuItem>
        </HistoryMenu>
      </div>
    </div>
  </div>;
}

function EmptyHistory({ query, source }) {
  const title = query.length > 0 ? 'No matching pages' : source === 'agent' ? 'No agent visits' : source === 'other' ? 'No other visits' : 'No browsing history yet';
  const description = query.length > 0 ? 'Try searching for a different page or address' :
    source === 'all' ? 'Pages visited in the built-in browser will appear here' : 'Choose a different visit source to see more history';
  return <div className="codex-history-group"><div className="codex-history-empty"><div className="codex-history-empty-content">
    <div className="codex-history-empty-icon"><CodexCuIcon name="history:t" aria-hidden="true" /></div>
    <div className="codex-history-empty-copy"><div className="codex-history-empty-title">{title}</div>
      <div className="codex-history-empty-description">{description}</div></div>
  </div></div></div>;
}

function Pagination({ hasNextPage, isFetchingNextPage, onLoadNextPage }) {
  const sentinel = useRef(null);
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !sentinel.current) return;
    if (typeof IntersectionObserver === 'undefined') { onLoadNextPage?.(); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); onLoadNextPage?.(); }
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadNextPage]);
  if (!hasNextPage && !isFetchingNextPage) return null;
  return isFetchingNextPage ? <div className="codex-history-pagination-loading"><CodexCuSpinner className="codex-history-secondary" Icon={props => <CodexCuIcon name="shared:Dk" size={16} {...props} />} /></div> :
    <div className="codex-history-sentinel" ref={sentinel} />;
}

export function CodexBrowserHistory({ entries, searchQuery = '', resultSearchQuery = searchQuery, visitSource = 'all', isPending = false,
  error = null, isRemoving = false, dataRemovalPermitted = false, browsingDataSettingsAvailable = false,
  hasNextPage = false, isFetching = false, isFetchingNextPage = false, isFetchNextPageError = false,
  locale, backSlot, visitSourceControlAvailable = true, entriesSelectionAvailable = true,
  onSearchQueryChange, onVisitSourceChange, onOpenEntry, onRemoveEntries,
  onClearBrowsingData, onRetry, onLoadNextPage, className = '' }) {
  const groups = useMemo(() => groupCodexHistory(entries ?? []), [entries]);
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const searchInput = useRef(null);
  useEffect(() => { setExpanded(null); setSelected(new Set()); }, [visitSource]);
  const removeSelected = () => {
    const seen = new Set();
    const removals = (entries ?? []).filter(entry => selected.has(codexHistoryEntryKey(entry))).filter(entry => {
      const key = removalKey(entry); if (seen.has(key)) return false; seen.add(key); return true;
    }).map(({ url, visitTime }) => ({ url, visitTime }));
    if (removals.length && !isRemoving && dataRemovalPermitted) onRemoveEntries?.(removals);
  };
  const selectedCount = (entries ?? []).filter(entry => selected.has(codexHistoryEntryKey(entry))).length;
  const sourceName = visitSource === 'agent' ? 'Agent' : visitSource === 'other' ? 'Other' : null;
  let body;
  if (isPending) body = <div className="codex-history-loading" role="status"><CodexCuSpinner Icon={props => <CodexCuIcon name="shared:Dk" size={16} {...props} />} /><span>Loading browsing history</span></div>;
  else if (error != null && entries == null) body = <div className="codex-history-group"><div className="codex-history-row">
    <div className="codex-history-row-label">Unable to load browsing history</div>
    <div className="codex-history-row-control"><CodexCuButton color="secondary" size="toolbar" onClick={onRetry}>Try again</CodexCuButton></div>
  </div></div>;
  else if (!groups.length) body = <EmptyHistory query={resultSearchQuery} source={visitSource} />;
  else body = <div className="codex-history-groups">{groups.map((group, index) => {
    const isExpanded = expanded?.has(group.key) ?? index === 0;
    const contentId = `browser-browsing-history-${group.visitTime}`;
    return <div className="codex-history-group" key={group.key}><div className="codex-history-divider">
      <button type="button" className="codex-history-date" aria-controls={contentId} aria-expanded={isExpanded}
        onClick={() => setExpanded(previous => {
          const next = new Set(previous ?? (groups[0] ? [groups[0].key] : []));
          if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next;
        })}>
        <div className="codex-history-row"><div className="codex-history-row-label">
          {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(group.visitTime)}
        </div><div className="codex-history-row-control"><CodexCuIcon name="shared:_T" className="codex-history-chevron" data-expanded={isExpanded} aria-hidden="true" /></div></div>
      </button>
      {isExpanded && <div id={contentId} className="codex-history-divider">{group.entries.map(entry => <HistoryRow key={codexHistoryEntryKey(entry)}
        entry={entry} checked={selected.has(codexHistoryEntryKey(entry))} disabled={isRemoving} canRemove={dataRemovalPermitted}
        selectionAvailable={entriesSelectionAvailable} locale={locale} onOpen={onOpenEntry} onRemove={onRemoveEntries} onSelect={checked => setSelected(previous => {
          const next = new Set(previous), key = codexHistoryEntryKey(entry); if (checked) next.add(key); else next.delete(key); return next;
        })} />)}</div>}
    </div></div>;
  })}</div>;
  return <div className={`codex-history ${className}`}>
    {backSlot != null && <div className="codex-history-toolbar">{backSlot}</div>}
    <div className="codex-history-scroll"><div className="codex-history-content">
      <header className="codex-history-heading"><h1>Browsing history</h1></header>
      <div className="codex-history-sticky"><div className="codex-history-search">
        <CodexCuIcon name="shared:gE" className="codex-history-icon" aria-hidden="true" />
        <input id="browser-browsing-history-search" ref={searchInput} type="text" autoComplete="off"
          aria-label="Search browsing history" placeholder="Search browsing history" value={searchQuery}
          onChange={event => onSearchQueryChange?.(event.target.value)} />
        {searchQuery.length > 0 && <button type="button" className="codex-history-clear-search" aria-label="Clear search"
          onClick={() => { searchInput.current?.focus(); onSearchQueryChange?.(''); }}><CodexCuIcon name="shared:bot" /></button>}
        {visitSourceControlAvailable && <HistoryMenu label="Filter history" disabled={isRemoving} trigger={<CodexCuButton color="ghost" size="toolbar" uniform={visitSource === 'all'}
          aria-label={sourceName ? `Filter history: ${sourceName}` : 'Filter history'}>
          <CodexCuIcon name="shared:Xet" />{sourceName}
        </CodexCuButton>}>
          {['all', 'agent', 'other'].map(source => <CodexCuMenuItem key={source} role="menuitemradio" aria-checked={visitSource === source}
            className="codex-history-filter-item" rightIcon={<span className="codex-history-filter-indicator">{visitSource === source && <CodexCuIcon name="shared:checkbox-check" size={18} />}</span>}
            onSelect={() => { if (source !== visitSource) onVisitSourceChange?.(source); }}>
            {source === 'all' ? 'All' : source === 'agent' ? 'Agent' : 'Other'}
          </CodexCuMenuItem>)}
        </HistoryMenu>}
      </div></div>
      <section className="codex-history-section"><div className="codex-history-section-header">
        <div className="codex-history-section-title">All-time history</div><div className="codex-history-actions">
          {entriesSelectionAvailable && selectedCount > 0 && <CodexCuButton color="secondary" size="toolbar" disabled={!dataRemovalPermitted}
            loading={isRemoving} onClick={removeSelected}>Remove selected</CodexCuButton>}
          <CodexCuButton color="secondary" size="toolbar" disabled={entries == null || isRemoving || !browsingDataSettingsAvailable}
            onClick={onClearBrowsingData}>Clear browsing data</CodexCuButton>
        </div>
      </div>{body}
        {entries != null && <Pagination hasNextPage={hasNextPage && !isFetchNextPageError && !isFetching}
          isFetchingNextPage={isFetchingNextPage} onLoadNextPage={onLoadNextPage} />}
        {entries != null && isFetchNextPageError && <div className="codex-history-group"><div className="codex-history-row">
          <div className="codex-history-row-label">Unable to load more browsing history</div>
          <div className="codex-history-row-control"><CodexCuButton color="secondary" size="toolbar" loading={isFetchingNextPage}
            onClick={onLoadNextPage}>Try again</CodexCuButton></div>
        </div></div>}
      </section>
    </div></div>
  </div>;
}

export default CodexBrowserHistory;
