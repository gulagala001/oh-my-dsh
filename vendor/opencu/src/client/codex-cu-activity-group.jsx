import React, { useEffect, useId, useRef, useState } from 'react';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuButton } from './codex-cu-primitives.jsx';
import './codex-cu-tokens.css';
import './codex-cu-activity-group.css';

const join = (...values) => values.filter(Boolean).join(' ');
const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cua-${value}`).join(' ');

// Shipped component references and source offsets are in activity-group/manifest.json.
// Item renderers, summary labels and account/platform gates stay with their owner.
export const codexCuActivityMotion = Object.freeze({
  disclosure: { duration: .3, ease: [.19, 1, .22, 1] },
  turnExit: { duration: .15, ease: [.23, 1, .32, 1] },
  shimmer: { initialDelayMs: 600, intervalMs: 4000, sweepMs: 1000 },
  summaryMinimumMs: 1000,
});

export function CodexCuActivityShimmer({ active = true, enabled = true, className, children, ...props }) {
  if (!active || !enabled) return <span className={className} {...props}>{children}</span>;
  return <CadencedShimmer className={className} {...props}>{children}</CadencedShimmer>;
}

function CadencedShimmer({ className, children, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const element = ref.current;
    if (!element) return;
    let clearSweep, interval;
    const activeClass = 'cua-_cadencedShimmerActive_wne66_71';
    const sweep = () => {
      if (clearSweep != null) window.clearTimeout(clearSweep);
      element.classList.remove(activeClass);
      element.classList.add(activeClass);
      clearSweep = window.setTimeout(() => { element.classList.remove(activeClass); clearSweep = undefined; }, 1000);
    };
    const delay = window.setTimeout(() => { sweep(); interval = window.setInterval(sweep, 4000); }, 600);
    return () => {
      if (clearSweep != null) window.clearTimeout(clearSweep);
      window.clearTimeout(delay);
      if (interval != null) window.clearInterval(interval);
      element.classList.remove(activeClass);
    };
  }, []);
  return <span ref={ref} className={join(p('relative inline-block align-top', '_cadencedShimmer_wne66_2'), className)} {...props}>
    {children}
    <span aria-hidden="true" className={p('_cadencedShimmerSweep_wne66_35')}><span className={p('_cadencedShimmerHighlight_wne66_30')}>{children}</span></span>
  </span>;
}

export function CodexCuConversationGap({ variant = 'item' }) {
  return <div aria-hidden="true" className={p('w-full group-data-[spacing=grouped]/agent-activity:shrink-0')}
    style={{ height: variant === 'grouped' ? 'var(--conversation-grouped-item-gap, 4px)' : 'var(--conversation-item-gap, 16px)' }} />;
}

export const CodexCuTimelineActivityBody = React.forwardRef(function CodexCuTimelineActivityBody({
  className, indent = false, variant = 'default', ...props
}, ref) {
  return <div ref={ref} className={join(p('flex flex-col', variant === 'default' && 'gap-2 pt-2 pb-1',
    variant === 'grouped' && 'gap-[var(--conversation-grouped-item-gap,4px)] pt-1', indent && 'ps-6'), className)} {...props} />;
});

export function CodexCuActivityChevron({ expanded, className, ...props }) {
  return <CodexCuIcon name="shared:wE" aria-hidden="true" className={join(p('icon-2xs shrink-0 text-text/60 opacity-0 group-focus-visible/activity-header:opacity-100 group-focus-visible/activity-header:text-default group-has-[:focus-visible]/activity-header:opacity-100 group-has-[:focus-visible]/activity-header:text-default transition-transform duration-relaxed [@media(hover:hover)]:group-[:hover:not(:has([data-agent-activity-file-link]:hover))]/activity-header:opacity-100', expanded && 'rotate-90 opacity-100'), className)} {...props} />;
}

// qJe/UJe/BJe/FI: the common tool/activity row, without item-specific state UI.
export function CodexCuActivityRow({ icon, summary, disclosure, accessory, body, className, headerClassName, ...props }) {
  const summaryId = useId(), headerId = useId();
  const summaryContent = <>
    <span className={p('contents text-text/60')}>{icon}</span>
    <span id={disclosure ? summaryId : undefined} className={p('min-w-0 flex-1 truncate text-(--agent-activity-summary-color) [&_*:not(button)]:!text-(--agent-activity-summary-color)',
      '_summary_1qt3f_2', disclosure && '[@media(hover:hover)]:group-[:hover:not(:has([data-agent-activity-file-link]:hover))]/activity-header:[--agent-activity-summary-color:var(--color-text)]')}>{summary}</span>
  </>;
  return <div className={p('min-w-0 text-size-chat relative overflow-visible py-0')}>
    <div className={join(p('flex min-w-0 flex-col'), className)} {...props}>
      <div className={join(p('group/activity-header relative inline-flex min-w-0 max-w-full self-start items-center gap-1 p-0 text-start max-w-full'), headerClassName)}>
        {disclosure && <button type="button" className={p('absolute inset-0 cursor-interaction rounded-md bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:ring-inset')}
          aria-label={disclosure.accessibleLabel} aria-labelledby={disclosure.accessibleLabel == null ? summaryId : undefined}
          aria-expanded={disclosure.expanded} onClick={disclosure.onToggle} />}
        <span className={p('inline-flex min-w-0 gap-1.5 group-data-[spacing=grouped]/agent-activity:align-top items-center shrink truncate text-size-chat',
          disclosure && 'pointer-events-none relative [&_a]:pointer-events-auto [&_button]:pointer-events-auto')} id={disclosure ? headerId : undefined}>{summaryContent}</span>
        {accessory}
        {disclosure && <span className={p('pointer-events-none relative flex', disclosure.alignEnd && 'ms-auto')}><CodexCuActivityChevron expanded={disclosure.expanded} /></span>}
      </div>
      {body}
    </div>
  </div>;
}

function SummaryTransition({ summary, summaryKey, transition }) {
  const [stored, setStored] = useState(() => ({ key: summaryKey, node: summary }));
  const lastChange = useRef(null);
  useEffect(() => {
    const now = Date.now();
    lastChange.current ??= now;
    if (stored.key === summaryKey) return;
    const update = () => { lastChange.current = Date.now(); setStored({ key: summaryKey, node: summary }); };
    if (transition === 'immediate') { update(); return; }
    const remaining = 1000 - (now - lastChange.current);
    if (remaining <= 0) { update(); return; }
    const timer = setTimeout(update, remaining);
    return () => clearTimeout(timer);
  }, [summary, summaryKey, transition, stored.key]);
  return <span className={p('flex min-h-4 max-w-full min-w-0 items-center truncate')}>
    {transition === 'immediate' || stored.key === summaryKey ? summary : stored.node}
  </span>;
}

// MotionDiv can be the host's motion.div. Without it, this renders the exact
// static endpoints; the source's animation engine is not emulated with new CSS.
function DisclosureBody({ expanded, children, MotionDiv, animateInitialCollapse = false, className }) {
  const [phase, setPhase] = useState(() => expanded ? 'expanded' : animateInitialCollapse ? 'closing' : 'collapsed');
  const previous = useRef(expanded);
  useEffect(() => {
    if (previous.current === expanded) return;
    previous.current = expanded;
    if (!expanded) { setPhase('closing'); return; }
    setPhase('opening');
    const frame = requestAnimationFrame(() => setPhase('expanded'));
    return () => cancelAnimationFrame(frame);
  }, [expanded]);
  if (!MotionDiv) return expanded ? <div className={join(p('-ms-2 ps-2'), className)}>{typeof children === 'function' ? children() : children}</div> : null;
  if (phase === 'collapsed') return null;
  const visible = phase === 'expanded';
  return <MotionDiv className={join(p('-ms-2 ps-2'), className)} initial={false}
    animate={visible ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }} transition={codexCuActivityMotion.disclosure}
    style={{ overflow: 'hidden', pointerEvents: visible ? 'auto' : 'none' }}
    onAnimationComplete={() => setPhase(current => current === 'closing' ? 'collapsed' : current)}>
    {typeof children === 'function' ? children() : children}
  </MotionDiv>;
}

export function CodexCuActivityGroup({ summary, icon, headerState = 'summary', canExpand = true,
  defaultExpanded = false, expanded: controlledExpanded, onExpandedChange, onExpand, children,
  summaryKey, summaryTransition = 'static', shouldAnimateInitialCollapse = false, MotionDiv, className,
  shimmerEnabled = true, ariaLabel, ...props }) {
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const expanded = canExpand && (controlledExpanded ?? localExpanded);
  const labelId = useId();
  if (!['active', 'thinking', 'summary'].includes(headerState)) return null;
  const content = headerState === 'summary' ? summary : <CodexCuActivityShimmer enabled={shimmerEnabled}>{summary}</CodexCuActivityShimmer>;
  const label = <span className={p('block min-w-0 max-w-full flex-1 truncate text-text/60 [&_*:not(button)]:!text-text/60',
    canExpand && 'group-hover/activity-header:!text-default group-hover/activity-header:[&_*:not(button)]:!text-default')}>{content}</span>;
  const headerContent = icon == null ? label : <span className={p('inline-flex min-w-0 gap-1.5 items-center max-w-full overflow-hidden')}>
    <span className={p('contents text-text/60')}>{icon}</span><span className={p('min-w-0 flex-1 truncate')}>{label}</span>
  </span>;
  const summaryContent = <span className={p('text-text/60 flex min-w-0 max-w-full items-center truncate', canExpand && 'shrink group-hover/activity-header:text-default')}>
    {summaryKey == null || summaryTransition === 'static' ? headerContent : <SummaryTransition summary={headerContent} summaryKey={summaryKey} transition={summaryTransition} />}
  </span>;
  const toggle = () => {
    if (!expanded) onExpand?.();
    (onExpandedChange ?? setLocalExpanded)(!expanded);
  };
  return <div className={join(p('min-w-0 text-size-chat relative overflow-visible py-0'), className)} {...props}>
    <div className={p('flex min-w-0 flex-col')}>
      <div className={p('group/activity-header relative inline-flex min-w-0 max-w-full self-start items-center gap-1 p-0 text-start')}>
        {canExpand && <button type="button" className={p('absolute inset-0 cursor-interaction rounded-md bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:ring-inset')}
          aria-label={ariaLabel} aria-labelledby={ariaLabel == null ? labelId : undefined} aria-expanded={expanded} onClick={toggle} />}
        <span id={canExpand ? labelId : undefined} className={p('inline-flex min-w-0 gap-1.5 group-data-[spacing=grouped]/agent-activity:align-top items-center shrink truncate text-size-chat', canExpand && 'pointer-events-none relative [&_a]:pointer-events-auto [&_button]:pointer-events-auto')}>
          {summaryContent}
        </span>
        {canExpand && <span className={p('pointer-events-none relative flex')}><CodexCuIcon name="shared:wE" aria-hidden="true" className={p('icon-2xs shrink-0 text-text/60 opacity-0 group-focus-visible/activity-header:opacity-100 group-focus-visible/activity-header:text-default group-has-[:focus-visible]/activity-header:opacity-100 group-has-[:focus-visible]/activity-header:text-default transition-transform duration-relaxed [@media(hover:hover)]:group-[:hover:not(:has([data-agent-activity-file-link]:hover))]/activity-header:opacity-100', expanded && 'rotate-90 opacity-100')} /></span>}
      </div>
      {canExpand && <DisclosureBody expanded={expanded} MotionDiv={MotionDiv} animateInitialCollapse={shouldAnimateInitialCollapse && typeof children !== 'function'}>{children}</DisclosureBody>}
    </div>
  </div>;
}

export function CodexCuActivityDetails({ children }) {
  return <div className={p('vertical-scroll-fade-mask -ms-2 flex max-h-56 flex-col overflow-x-hidden overflow-y-auto ps-2 [--edge-fade-distance:1.5rem]')}
    style={{ '--conversation-patch-file-gap': 'var(--conversation-grouped-item-gap, 4px)' }}>{children}</div>;
}

export function codexCuActivityHeaderState({ unit, isLatestVisibleUnit, isTurnInProgress, isActivitySliceClosed,
  isExploring, getExplorationItem, getOtherItemInProgress }) {
  if (!(isLatestVisibleUnit && isTurnInProgress && !isActivitySliceClosed)) return { kind: 'summary' };
  if (isExploring) { const exploration = getExplorationItem?.(unit); if (exploration != null) return { kind: 'active', item: exploration }; }
  for (let index = unit.items.length - 1; index >= 0; index--) {
    const activity = unit.items[index];
    if (activity == null) continue;
    const item = activity.item;
    let active;
    if (item.type === 'exec') active = item.executionStatus !== 'interrupted' && !item.parsedCmd.isFinished;
    else if (item.type === 'automatic-approval-review') active = item.status === 'inProgress';
    else if (['dynamic-tool-call', 'mcp-tool-call', 'web-search'].includes(item.type)) active = !item.completed;
    else if (item.type === 'patch') active = item.success == null;
    else active = getOtherItemInProgress?.(item);
    if (active) return item.type === 'automatic-approval-review' ? { kind: 'thinking' } : { kind: 'active', item: activity };
  }
  return { kind: 'thinking' };
}

export function codexCuTurnCollapseState({ hasFinalAssistantStarted, isTurnCancelled, hasRenderableAgentItems,
  allowCollapseBeforeFinal = false, forceExpanded = false, preventAutoCollapse, persistedCollapsed }) {
  return (allowCollapseBeforeFinal || hasFinalAssistantStarted && !isTurnCancelled) && hasRenderableAgentItems
    ? { shouldAllowCollapse: true, isCollapsed: !forceExpanded && (persistedCollapsed ?? !preventAutoCollapse) }
    : { shouldAllowCollapse: false, isCollapsed: false };
}

const numberFormats = new Map();
function formatDurationUnit(value, unit, locale) {
  const key = `${locale}:${unit}`;
  let formatter = numberFormats.get(key);
  if (!formatter) { formatter = new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }); numberFormats.set(key, formatter); }
  return locale.toLowerCase().split('-')[0] === 'hu'
    ? formatter.formatToParts(value).filter(part => part.type !== 'literal').map(part => part.value).join('') : formatter.format(value);
}
export function formatCodexCuActivityDuration(durationMs, locale = 'en') {
  const seconds = Math.floor(Math.max(durationMs, 0) / 1000);
  if (seconds < 60) return formatDurationUnit(seconds, 'second', locale);
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds / 3600) % 24,
    minutes = Math.floor(seconds % 3600 / 60), remainingSeconds = seconds % 60;
  if (days > 0 || hours > 0) return [[days, 'day'], [hours, 'hour'], [minutes, 'minute'], [remainingSeconds, 'second']]
    .filter(([value]) => value > 0).map(([value, unit]) => formatDurationUnit(value, unit, locale)).join(' ');
  return [[minutes, 'minute'], [remainingSeconds, 'second']].filter(([value]) => value > 0)
    .map(([value, unit]) => formatDurationUnit(value, unit, locale)).join(' ');
}

function translated(formatMessage, id, defaultMessage, values) {
  return formatMessage ? formatMessage({ id, defaultMessage }, values) : defaultMessage.replace('{time}', values?.time ?? '');
}

export function CodexCuWorkedForLabel({ status, startedAtMs, completedAtMs, locale = 'en', formatMessage, renderLoading, className }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (status !== 'working' || completedAtMs != null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status, completedAtMs]);
  if (status === 'loading') return renderLoading?.({ label: translated(formatMessage, 'localConversation.loadingWorkStatus', 'Loading activity status') }) ?? null;
  if (!['unknown', 'paused', 'working', 'worked', 'stopped'].includes(status)) return null;
  const elapsedMs = Math.max((completedAtMs ?? now) - startedAtMs, 0);
  const time = formatCodexCuActivityDuration(elapsedMs, locale);
  const messages = {
    unknown: ['localConversation.workActivity', 'Activity'], paused: ['localConversation.paused', 'Paused'],
    working: elapsedMs >= 1000 ? ['localConversation.workingFor', 'Working for {time}'] : ['localConversation.working', 'Working'],
    worked: ['localConversation.workedFor.v2', 'Worked for {time}'], stopped: ['localConversation.userStoppedAfter', 'You stopped after {time}'],
  };
  const [id, fallback] = messages[status];
  return <span className={join(p('tabular-nums', className == null && 'text-tertiary'), className)}>{translated(formatMessage, id, fallback, { time })}</span>;
}

export function CodexCuTurnActivityDisclosure({ children, persistentContent, preToggleContent, label,
  collapsedMessageCount = 0, deniedActionCount = 0, deniedActionContent, workedDurationMs = null, workedForItem = null,
  locale = 'en', formatMessage, renderLoading, hasFinalAssistantStarted, isTurnCancelled = false,
  allowCollapseBeforeFinal = false, forceExpanded = false, disableCollapse = false, preventAutoCollapse = false,
  persistedCollapsed, onSetCollapsed, hasRenderableAgentItems = children != null, MotionDiv,
  shouldUseReducedMotion = false, preloadOnInteraction = false, containsOnlyContextCompaction = false }) {
  const [localCollapsed, setLocalCollapsed] = useState();
  const [pointerInside, setPointerInside] = useState(false), [focusInside, setFocusInside] = useState(false);
  const [animateExpansion, setAnimateExpansion] = useState(false), [isCollapsing, setIsCollapsing] = useState(false);
  const state = codexCuTurnCollapseState({ hasFinalAssistantStarted, isTurnCancelled, hasRenderableAgentItems,
    allowCollapseBeforeFinal, forceExpanded: forceExpanded || disableCollapse, preventAutoCollapse,
    persistedCollapsed: persistedCollapsed ?? localCollapsed });
  const canCollapse = !disableCollapse && state.shouldAllowCollapse && collapsedMessageCount > 0 && !containsOnlyContextCompaction;
  const collapsed = canCollapse && state.isCollapsed;
  const countLabel = formatMessage
    ? formatMessage({ id: 'localConversation.previousMessagesSummary', defaultMessage: '{count, plural, one {# previous message} other {# previous messages}}' }, { count: collapsedMessageCount })
    : `${collapsedMessageCount} previous ${collapsedMessageCount === 1 ? 'message' : 'messages'}`;
  const defaultLabel = workedForItem != null ? <CodexCuWorkedForLabel {...workedForItem} locale={locale} formatMessage={formatMessage} renderLoading={renderLoading} className={p('text-inherit')} />
    : workedDurationMs != null ? translated(formatMessage, 'localConversation.workedFor', 'Worked for {time}', { time: formatCodexCuActivityDuration(workedDurationMs, locale) }) : countLabel;
  return <>
    {preToggleContent}
    {preToggleContent != null && canCollapse && <CodexCuConversationGap />}
    {canCollapse && <>
      <div className={p('text-size-chat text-secondary')}>
        <CodexCuButton color="ghostTertiary" radius="small" size="inline" className={p('inline-flex max-w-full flex-wrap text-size-chat', deniedActionCount > 0 && 'w-full')}
          onFocus={() => setFocusInside(true)} onBlur={() => setFocusInside(false)} onPointerEnter={() => setPointerInside(true)} onPointerLeave={() => setPointerInside(false)}
          aria-expanded={!collapsed} onClick={event => {
            const fromDeniedCount = collapsed && deniedActionCount > 0 && event.target instanceof Element && event.target.closest('[data-denied-action-count]') != null;
            setIsCollapsing(!collapsed); setAnimateExpansion(collapsed);
            (onSetCollapsed ?? setLocalCollapsed)(!collapsed, { fromDeniedCount });
          }}>
          <span>{label ?? defaultLabel}</span>
          <CodexCuIcon name="shared:wE" className={p('icon-2xs transition-transform duration-basic', collapsed ? 'rotate-0' : 'rotate-90')} />
          {deniedActionCount > 0 && deniedActionContent}
        </CodexCuButton>
      </div>
      <div className={p('pt-1 text-size-chat text-secondary')}><div className={p('w-full border-t border-default')} /></div>
    </>}
    {persistentContent != null && canCollapse && <CodexCuConversationGap />}
    {persistentContent}
    <TurnActivityBody collapsed={collapsed} isCollapsing={isCollapsing} animateExpansion={animateExpansion}
      preload={(pointerInside || focusInside) && preloadOnInteraction} MotionDiv={MotionDiv} reducedMotion={shouldUseReducedMotion}
      onAnimationComplete={() => { setIsCollapsing(false); if (!collapsed) setAnimateExpansion(false); }}>
      {canCollapse && <CodexCuConversationGap />}
      {children}
    </TurnActivityBody>
  </>;
}

function TurnActivityBody({ collapsed, isCollapsing, animateExpansion, preload, MotionDiv, reducedMotion, onAnimationComplete, children }) {
  if (!MotionDiv) return collapsed ? null : <div className={p('-ms-2 ps-2')}>{children}</div>;
  if (collapsed && !preload && !isCollapsing) return null;
  const target = collapsed ? 'preloaded' : 'expanded';
  const closed = { height: reducedMotion && isCollapsing ? 'auto' : 0, opacity: 0, transform: reducedMotion ? 'translateY(0)' : 'translateY(-8px)' };
  const open = { height: 'auto', opacity: 1, transform: 'translateY(0)' };
  const duration = isCollapsing || reducedMotion ? .15 : .3;
  return <MotionDiv className={p('-ms-2 ps-2', collapsed && !isCollapsing && 'invisible')}
    inert={collapsed ? '' : undefined} style={{ overflow: collapsed || animateExpansion ? 'hidden' : 'visible' }}
    initial={animateExpansion ? { height: reducedMotion ? 'auto' : 0, opacity: 0, transform: reducedMotion ? 'translateY(0)' : 'translateY(-8px)' } : false}
    animate={target} variants={{ preloaded: closed, expanded: open }}
    exit={{ height: reducedMotion ? 'auto' : 0, opacity: 0, overflow: 'hidden', transform: reducedMotion ? 'translateY(0)' : 'translateY(-8px)', transition: codexCuActivityMotion.turnExit }}
    transition={{ ...codexCuActivityMotion.disclosure, duration: isCollapsing || animateExpansion && !collapsed ? duration : 0,
      ease: isCollapsing ? codexCuActivityMotion.turnExit.ease : codexCuActivityMotion.disclosure.ease }} onAnimationComplete={onAnimationComplete}>
    {children}
  </MotionDiv>;
}

export function CodexCuActivitySequence({ children, grouped = false, className }) {
  return <div className={join(p('group/agent-activity flex flex-col', grouped ? 'gap-[var(--conversation-grouped-item-gap,4px)]' : 'gap-[var(--conversation-item-gap,16px)]'), className)}
    data-spacing={grouped ? 'grouped' : 'item'}>{children}</div>;
}

function sourceItemKey(item, fallback) {
  let id;
  if ('searchItemId' in item && item.searchItemId != null) id = item.searchItemId;
  else if ('sourceItemId' in item && item.sourceItemId != null) id = item.sourceItemId;
  else if ('id' in item) id = item.id;
  else if ('callId' in item) id = item.callId;
  else if ('requestId' in item) id = item.requestId;
  else if ('handoffId' in item) id = item.handoffId;
  return id == null ? fallback : `${item.type}:${typeof id}:${id}`;
}

// This is the generated-image-output-visibility N/F boundary algorithm.
// getActivityItem must be the caller's source-backed per-item classifier.
// Unrecognised items are preserved as activity-item blocks for their native slot.
export function buildCodexCuTranscriptBlocks(items, { collapseActivityBeforeAssistant = true, getActivityItem,
  standaloneItems, hasPreviousBlock } = {}) {
  const slices = [], blocks = [];
  let activity = [];
  const flush = collapseWhenPossible => {
    if (activity.length) { slices.push({ type: 'activity', items: activity, collapseWhenPossible }); activity = []; }
  };
  for (const item of items) {
    if (item.type === 'user-message') { flush(false); slices.push({ type: 'user-message', item }); }
    else if (item.type === 'generated-image') {
      flush(false);
      const previous = slices.at(-1);
      if (previous?.type === 'generated-images') previous.items.push(item);
      else slices.push({ type: 'generated-images', items: [item] });
    } else if (item.type === 'assistant-message') { flush(collapseActivityBeforeAssistant); slices.push({ type: 'assistant-message', item }); }
    else activity.push(item);
  }
  flush(false);
  const lastUser = slices.findLastIndex(slice => slice.type === 'user-message');
  let userCount = 0;
  const groupKey = (prefix, group, fallback) => {
    const initial = `${prefix}-${sourceItemKey(group[0], fallback)}`;
    if (!hasPreviousBlock || hasPreviousBlock(initial)) return initial;
    for (const item of group.slice(1)) { const key = `${prefix}-${sourceItemKey(item, fallback)}`; if (hasPreviousBlock(key)) return key; }
    return initial;
  };
  for (const [sliceIndex, slice] of slices.entries()) {
    if (slice.type === 'activity') {
      let group = [], part = 0;
      const flushGroup = () => { if (group.length) { blocks.push({ type: 'agent-activity', key: groupKey('transcript-activity', group, `${sliceIndex}-${part}`), items: group, collapseWhenPossible: slice.collapseWhenPossible }); group = []; part++; } };
      for (const [index, item] of slice.items.entries()) {
        const previous = slice.items[index - 1];
        if (item.type === 'subagent-activity' && !item.isMessage && previous?.type === 'subagent-activity' && !previous.isMessage) continue;
        const descriptor = ['reasoning', 'automatic-approval-review', 'subagent-activity'].includes(item.type) ? null : getActivityItem?.(item);
        if (descriptor?.grouping === 'standalone' || standaloneItems?.has(item) === true) {
          flushGroup(); blocks.push({ type: 'activity-item', key: `transcript-activity-item-${sourceItemKey(item, `${sliceIndex}-${index}`)}`, item });
        } else if (item.type === 'reasoning' || item.type === 'automatic-approval-review' || descriptor != null) group.push(item);
        else { flushGroup(); if (item.type !== 'turn-diff') blocks.push({ type: 'activity-item', key: `transcript-activity-item-${sourceItemKey(item, `${sliceIndex}-${index}`)}`, item }); }
      }
      flushGroup();
    } else if (slice.type === 'generated-images') blocks.push({ type: slice.type, key: groupKey('transcript-generated-images', slice.items, String(sliceIndex)), items: slice.items });
    else if (slice.type === 'assistant-message') blocks.push({ type: slice.type, key: `transcript-assistant-${sourceItemKey(slice.item, String(sliceIndex))}`, item: slice.item });
    else { blocks.push({ type: 'user-message', key: `transcript-user-${sourceItemKey(slice.item, String(sliceIndex))}`, item: slice.item, isFirstUserMessage: userCount === 0, isLastUserMessage: sliceIndex === lastUser }); userCount++; }
  }
  return blocks;
}

// No cloud/Office/native mode is selected here. The host must supply already
// gated renderers; absent or unknown branches remain with the native slot.
export function CodexCuTranscriptSequence({ blocks, renderActivityGroup, renderActivityItem, renderAssistantMessage,
  renderUserMessage, renderGeneratedImages, renderUnresolved }) {
  const renderers = { 'agent-activity': renderActivityGroup, 'activity-item': renderActivityItem,
    'assistant-message': renderAssistantMessage, 'user-message': renderUserMessage, 'generated-images': renderGeneratedImages };
  return <>{blocks.map(block => <React.Fragment key={block.key}>{(renderers[block.type] ?? renderUnresolved)?.(block) ?? null}</React.Fragment>)}</>;
}

export function getCodexCuJsActivityTitle({ toolKey, arguments: toolArguments }) {
  if (toolKey !== 'js' || toolArguments == null || typeof toolArguments.title !== 'string') return null;
  const title = toolArguments.title.trim().replace(/\s+/g, ' ');
  return title.length === 0 ? null : title.length <= 80 ? title : `${title.slice(0, 79).trimEnd()}…`;
}

// appName/detail are the already validated values from lbr/mbr/_br. Platform
// identity resolution remains with the host; this helper does not guess an app.
export function formatCodexCuNativeActivityLabel({ toolName, completed, appName = null, detail = null, formatMessage }) {
  const registry = nativeActivityRegistry[toolName];
  if (!registry) return null;
  let key;
  if (detail != null && appName != null) key = completed ? registry.completedWithDetailAndApp : registry.activeWithDetailAndApp;
  if (key == null && detail != null) key = completed ? registry.completedWithDetail : registry.activeWithDetail;
  key ??= appName == null ? completed ? registry.completed : registry.active : completed ? registry.completedWithApp : registry.activeWithApp;
  const descriptor = nativeActivityMessages[key];
  const values = { appName, detail };
  return formatMessage ? formatMessage(descriptor, values) : descriptor.defaultMessage.replace(/\{(appName|detail)\}/g, (_, name) => values[name] ?? '');
}

// Verbatim inert descriptors from app-shared jbr; no bundle code is executed.
const nativeActivityMessages = {
  "listMacApps": {
    "id": "codex.mcpTool.computerUse.listMacApps",
    "defaultMessage": "List Mac apps",
    "description": "Label for the Computer Use list apps MCP tool."
  },
  "unknownApp": {
    "id": "codex.mcpTool.computerUse.unknownApp",
    "defaultMessage": "App",
    "description": "Fallback app name used when a Computer Use MCP tool targets an app bundle identifier that cannot be resolved."
  },
  "clickActive": {
    "id": "codex.mcpTool.computerUse.click.active",
    "defaultMessage": "Clicking",
    "description": "Active label for the Computer Use click MCP tool."
  },
  "clickActiveWithApp": {
    "id": "codex.mcpTool.computerUse.click.activeWithApp",
    "defaultMessage": "Clicking in {appName}",
    "description": "Active label for the Computer Use click MCP tool with a target app."
  },
  "clickCompleted": {
    "id": "codex.mcpTool.computerUse.click.completed",
    "defaultMessage": "Clicked",
    "description": "Completed label for the Computer Use click MCP tool."
  },
  "clickCompletedWithApp": {
    "id": "codex.mcpTool.computerUse.click.completedWithApp",
    "defaultMessage": "Clicked in {appName}",
    "description": "Completed label for the Computer Use click MCP tool with a target app."
  },
  "dragActive": {
    "id": "codex.mcpTool.computerUse.drag.active",
    "defaultMessage": "Dragging",
    "description": "Active label for the Computer Use drag MCP tool."
  },
  "dragActiveWithApp": {
    "id": "codex.mcpTool.computerUse.drag.activeWithApp",
    "defaultMessage": "Dragging in {appName}",
    "description": "Active label for the Computer Use drag MCP tool with a target app."
  },
  "dragCompleted": {
    "id": "codex.mcpTool.computerUse.drag.completed",
    "defaultMessage": "Dragged",
    "description": "Completed label for the Computer Use drag MCP tool."
  },
  "dragCompletedWithApp": {
    "id": "codex.mcpTool.computerUse.drag.completedWithApp",
    "defaultMessage": "Dragged in {appName}",
    "description": "Completed label for the Computer Use drag MCP tool with a target app."
  },
  "getAppStateActive": {
    "id": "codex.mcpTool.computerUse.getAppState.active",
    "defaultMessage": "Looking",
    "description": "Active label for the Computer Use get_app_state MCP tool."
  },
  "getAppStateActiveWithApp": {
    "id": "codex.mcpTool.computerUse.getAppState.activeWithApp",
    "defaultMessage": "Looking at {appName}",
    "description": "Active label for the Computer Use get_app_state MCP tool with a target app."
  },
  "getAppStateCompleted": {
    "id": "codex.mcpTool.computerUse.getAppState.completed",
    "defaultMessage": "Looked",
    "description": "Completed label for the Computer Use get_app_state MCP tool."
  },
  "getAppStateCompletedWithApp": {
    "id": "codex.mcpTool.computerUse.getAppState.completedWithApp",
    "defaultMessage": "Looked at {appName}",
    "description": "Completed label for the Computer Use get_app_state MCP tool with a target app."
  },
  "performAccessibilityActionActive": {
    "id": "codex.mcpTool.computerUse.performAccessibilityAction.active",
    "defaultMessage": "Performing accessibility action",
    "description": "Active label for the Computer Use perform accessibility action MCP tool."
  },
  "performAccessibilityActionActiveWithApp": {
    "id": "codex.mcpTool.computerUse.performAccessibilityAction.activeWithApp",
    "defaultMessage": "Performing accessibility action in {appName}",
    "description": "Active label for the Computer Use perform accessibility action MCP tool with a target app."
  },
  "performAccessibilityActionCompleted": {
    "id": "codex.mcpTool.computerUse.performAccessibilityAction.completed",
    "defaultMessage": "Performed accessibility action",
    "description": "Completed label for the Computer Use perform accessibility action MCP tool."
  },
  "performAccessibilityActionCompletedWithApp": {
    "id": "codex.mcpTool.computerUse.performAccessibilityAction.completedWithApp",
    "defaultMessage": "Performed accessibility action in {appName}",
    "description": "Completed label for the Computer Use perform accessibility action MCP tool with a target app."
  },
  "pressKeyActive": {
    "id": "codex.mcpTool.computerUse.pressKey.active",
    "defaultMessage": "Pressing key",
    "description": "Active label for the Computer Use press_key MCP tool."
  },
  "pressKeyActiveWithApp": {
    "id": "codex.mcpTool.computerUse.pressKey.activeWithApp",
    "defaultMessage": "Pressing key in {appName}",
    "description": "Active label for the Computer Use press_key MCP tool with a target app."
  },
  "pressKeyCompleted": {
    "id": "codex.mcpTool.computerUse.pressKey.completed",
    "defaultMessage": "Pressed key",
    "description": "Completed label for the Computer Use press_key MCP tool."
  },
  "pressKeyCompletedWithApp": {
    "id": "codex.mcpTool.computerUse.pressKey.completedWithApp",
    "defaultMessage": "Pressed key in {appName}",
    "description": "Completed label for the Computer Use press_key MCP tool with a target app."
  },
  "scrollActive": {
    "id": "codex.mcpTool.computerUse.scroll.active",
    "defaultMessage": "Scrolling",
    "description": "Active label for the Computer Use scroll MCP tool."
  },
  "scrollActiveWithApp": {
    "id": "codex.mcpTool.computerUse.scroll.activeWithApp",
    "defaultMessage": "Scrolling in {appName}",
    "description": "Active label for the Computer Use scroll MCP tool with a target app."
  },
  "scrollActiveWithDirection": {
    "id": "codex.mcpTool.computerUse.scroll.activeWithDirection",
    "defaultMessage": "Scrolling {detail}",
    "description": "Active label for the Computer Use scroll MCP tool with a scroll direction."
  },
  "scrollActiveWithDirectionAndApp": {
    "id": "codex.mcpTool.computerUse.scroll.activeWithDirectionAndApp",
    "defaultMessage": "Scrolling {detail} in {appName}",
    "description": "Active label for the Computer Use scroll MCP tool with a scroll direction and target app."
  },
  "scrollCompleted": {
    "id": "codex.mcpTool.computerUse.scroll.completed",
    "defaultMessage": "Scrolled",
    "description": "Completed label for the Computer Use scroll MCP tool."
  },
  "scrollCompletedWithApp": {
    "id": "codex.mcpTool.computerUse.scroll.completedWithApp",
    "defaultMessage": "Scrolled in {appName}",
    "description": "Completed label for the Computer Use scroll MCP tool with a target app."
  },
  "scrollCompletedWithDirection": {
    "id": "codex.mcpTool.computerUse.scroll.completedWithDirection",
    "defaultMessage": "Scrolled {detail}",
    "description": "Completed label for the Computer Use scroll MCP tool with a scroll direction."
  },
  "scrollCompletedWithDirectionAndApp": {
    "id": "codex.mcpTool.computerUse.scroll.completedWithDirectionAndApp",
    "defaultMessage": "Scrolled {detail} in {appName}",
    "description": "Completed label for the Computer Use scroll MCP tool with a scroll direction and target app."
  },
  "setValueActive": {
    "id": "codex.mcpTool.computerUse.setValue.active",
    "defaultMessage": "Setting value",
    "description": "Active label for the Computer Use set_value MCP tool."
  },
  "setValueActiveWithApp": {
    "id": "codex.mcpTool.computerUse.setValue.activeWithApp",
    "defaultMessage": "Setting value in {appName}",
    "description": "Active label for the Computer Use set_value MCP tool with a target app."
  },
  "setValueActiveWithText": {
    "id": "codex.mcpTool.computerUse.setValue.activeWithText",
    "defaultMessage": "Setting to “{detail}”",
    "description": "Active label for the Computer Use set_value MCP tool with the value being set."
  },
  "setValueActiveWithTextAndApp": {
    "id": "codex.mcpTool.computerUse.setValue.activeWithTextAndApp",
    "defaultMessage": "Setting to “{detail}” in {appName}",
    "description": "Active label for the Computer Use set_value MCP tool with the value being set and target app."
  },
  "setValueCompleted": {
    "id": "codex.mcpTool.computerUse.setValue.completed",
    "defaultMessage": "Set value",
    "description": "Completed label for the Computer Use set_value MCP tool."
  },
  "setValueCompletedWithApp": {
    "id": "codex.mcpTool.computerUse.setValue.completedWithApp",
    "defaultMessage": "Set value in {appName}",
    "description": "Completed label for the Computer Use set_value MCP tool with a target app."
  },
  "setValueCompletedWithText": {
    "id": "codex.mcpTool.computerUse.setValue.completedWithText",
    "defaultMessage": "Set to “{detail}”",
    "description": "Completed label for the Computer Use set_value MCP tool with the value being set."
  },
  "setValueCompletedWithTextAndApp": {
    "id": "codex.mcpTool.computerUse.setValue.completedWithTextAndApp",
    "defaultMessage": "Set to “{detail}” in {appName}",
    "description": "Completed label for the Computer Use set_value MCP tool with the value being set and target app."
  },
  "typeTextActive": {
    "id": "codex.mcpTool.computerUse.typeText.active",
    "defaultMessage": "Typing text",
    "description": "Active label for the Computer Use type_text MCP tool."
  },
  "typeTextActiveWithApp": {
    "id": "codex.mcpTool.computerUse.typeText.activeWithApp",
    "defaultMessage": "Typing text in {appName}",
    "description": "Active label for the Computer Use type_text MCP tool with a target app."
  },
  "typeTextActiveWithText": {
    "id": "codex.mcpTool.computerUse.typeText.activeWithText",
    "defaultMessage": "Typing text “{detail}”",
    "description": "Active label for the Computer Use type_text MCP tool with the text being typed."
  },
  "typeTextActiveWithTextAndApp": {
    "id": "codex.mcpTool.computerUse.typeText.activeWithTextAndApp",
    "defaultMessage": "Typing text “{detail}” in {appName}",
    "description": "Active label for the Computer Use type_text MCP tool with the text being typed and target app."
  },
  "typeTextCompleted": {
    "id": "codex.mcpTool.computerUse.typeText.completed",
    "defaultMessage": "Typed text",
    "description": "Completed label for the Computer Use type_text MCP tool."
  },
  "typeTextCompletedWithApp": {
    "id": "codex.mcpTool.computerUse.typeText.completedWithApp",
    "defaultMessage": "Typed text in {appName}",
    "description": "Completed label for the Computer Use type_text MCP tool with a target app."
  },
  "typeTextCompletedWithText": {
    "id": "codex.mcpTool.computerUse.typeText.completedWithText",
    "defaultMessage": "Typed text “{detail}”",
    "description": "Completed label for the Computer Use type_text MCP tool with the text being typed."
  },
  "typeTextCompletedWithTextAndApp": {
    "id": "codex.mcpTool.computerUse.typeText.completedWithTextAndApp",
    "defaultMessage": "Typed text “{detail}” in {appName}",
    "description": "Completed label for the Computer Use type_text MCP tool with the text being typed and target app."
  }
};
const nativeActivityRegistry = {
  "list_apps": {
    "active": "listMacApps",
    "activeWithApp": "listMacApps",
    "completed": "listMacApps",
    "completedWithApp": "listMacApps"
  },
  "list_mac_apps": {
    "active": "listMacApps",
    "activeWithApp": "listMacApps",
    "completed": "listMacApps",
    "completedWithApp": "listMacApps"
  },
  "click": {
    "active": "clickActive",
    "activeWithApp": "clickActiveWithApp",
    "completed": "clickCompleted",
    "completedWithApp": "clickCompletedWithApp"
  },
  "drag": {
    "active": "dragActive",
    "activeWithApp": "dragActiveWithApp",
    "completed": "dragCompleted",
    "completedWithApp": "dragCompletedWithApp"
  },
  "get_app_state": {
    "active": "getAppStateActive",
    "activeWithApp": "getAppStateActiveWithApp",
    "completed": "getAppStateCompleted",
    "completedWithApp": "getAppStateCompletedWithApp"
  },
  "get_state": {
    "active": "getAppStateActive",
    "activeWithApp": "getAppStateActiveWithApp",
    "completed": "getAppStateCompleted",
    "completedWithApp": "getAppStateCompletedWithApp"
  },
  "perform_accessibility_action": {
    "active": "performAccessibilityActionActive",
    "activeWithApp": "performAccessibilityActionActiveWithApp",
    "completed": "performAccessibilityActionCompleted",
    "completedWithApp": "performAccessibilityActionCompletedWithApp"
  },
  "perform_secondary_action": {
    "active": "performAccessibilityActionActive",
    "activeWithApp": "performAccessibilityActionActiveWithApp",
    "completed": "performAccessibilityActionCompleted",
    "completedWithApp": "performAccessibilityActionCompletedWithApp"
  },
  "press_key": {
    "active": "pressKeyActive",
    "activeWithApp": "pressKeyActiveWithApp",
    "completed": "pressKeyCompleted",
    "completedWithApp": "pressKeyCompletedWithApp"
  },
  "scroll": {
    "active": "scrollActive",
    "activeWithDetail": "scrollActiveWithDirection",
    "activeWithDetailAndApp": "scrollActiveWithDirectionAndApp",
    "activeWithApp": "scrollActiveWithApp",
    "completed": "scrollCompleted",
    "completedWithDetail": "scrollCompletedWithDirection",
    "completedWithDetailAndApp": "scrollCompletedWithDirectionAndApp",
    "completedWithApp": "scrollCompletedWithApp"
  },
  "set_value": {
    "active": "setValueActive",
    "activeWithDetail": "setValueActiveWithText",
    "activeWithDetailAndApp": "setValueActiveWithTextAndApp",
    "activeWithApp": "setValueActiveWithApp",
    "completed": "setValueCompleted",
    "completedWithDetail": "setValueCompletedWithText",
    "completedWithDetailAndApp": "setValueCompletedWithTextAndApp",
    "completedWithApp": "setValueCompletedWithApp"
  },
  "type_text": {
    "active": "typeTextActive",
    "activeWithDetail": "typeTextActiveWithText",
    "activeWithDetailAndApp": "typeTextActiveWithTextAndApp",
    "activeWithApp": "typeTextActiveWithApp",
    "completed": "typeTextCompleted",
    "completedWithDetail": "typeTextCompletedWithText",
    "completedWithDetailAndApp": "typeTextCompletedWithTextAndApp",
    "completedWithApp": "typeTextCompletedWithApp"
  }
};
