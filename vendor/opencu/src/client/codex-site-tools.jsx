import React, { useEffect, useId, useRef } from 'react';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuButton, CodexCuMenuSeparator, CodexCuPopoverSurface, CodexCuToggle, CodexCuTooltip } from './codex-cu-primitives.jsx';
import { ToolCodeOutput } from './computer-card.jsx';
import { CodexCuDialog, CodexCuDialogBody, CodexCuDialogDescription, CodexCuDialogFooter, CodexCuDialogHeader, CodexCuDialogSection, CodexCuDialogTitle } from './codex-cu-dialog.jsx';
import siteToolsCss from './codex-site-tools.css';

// Pure presentation adapters for the shipped Codex 26.1007.21159 branches.
// Availability, disclosure, activity and permission state are supplied by the host.
// This module performs no inspector queries, tool invocations or permission writes.
const cx = (...values) => values.filter(Boolean).join(' ');
const message = (messages, key, fallback, values) => typeof messages?.[key] === 'function'
  ? messages[key](values) : messages?.[key] ?? fallback;
const renderToolCodeOutput = props => <ToolCodeOutput {...props} />;

export function CodexSiteToolsStyles() { return <style>{siteToolsCss}</style>; }

export function codexSiteToolsAvailability(availability, canUseWebMcp) {
  const states = [availability?.annotations];
  if (canUseWebMcp) states.push(availability?.webMcp);
  return ['available', 'pending-available', 'pending-unavailable'].find(state => states.includes(state)) ?? 'unavailable';
}

export function codexSiteAnnotationPreviewFeature(feature) {
  return ['containers', 'controls'].includes(feature) ? feature : feature === 'metadata-with-targets' ? 'metadata' : null;
}

function hasSiteInformation(url) {
  try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
}
function preventAddressCommit(event) { event.preventDefault(); event.stopPropagation(); }

export function CodexSiteInformationButton({
  currentUrl, browserTabId, conversationId, floating = false, isAddressEditing = false,
  isOpen = false, securityState, shouldAnimateAddressExpansion = false,
  onOpenChange, onOpenSiteInformation, renderPermissionPrompt, tooltipOpen = false,
  serviceAvailable, nativeAvailable = false, disabled = false, pending = false, onError, messages, className,
}) {
  const available = (serviceAvailable ?? nativeAvailable) === true && hasSiteInformation(currentUrl) && typeof onOpenSiteInformation === 'function';
  const generation = useRef(0), operation = useRef(null);
  useEffect(() => {
    generation.current++; operation.current = null;
    return () => { generation.current++; operation.current = null; };
  }, [browserTabId, conversationId, currentUrl]);
  const certificateError = securityState === 'certificate-error';
  const warning = available && certificateError;
  const label = certificateError
    ? message(messages, 'notSecureSiteInformation', 'Not secure, view site information')
    : message(messages, 'viewSiteInformation', 'View site information');
  const width = isAddressEditing || !available ? 0 : warning ? 104 : 28;
  const trigger = available ? <CodexCuTooltip open={tooltipOpen} tooltipContent={label} side="bottom">
    <CodexCuButton type="button" unstyled focusRing="inset"
      data-browser-sidebar-skip-address-commit="true" aria-label={label} aria-expanded={isOpen} aria-haspopup="dialog"
      disabled={disabled || pending} aria-busy={pending}
      className={cx('codex-cu-site-information-button', floating && 'is-floating', warning && 'has-warning')}
      onPointerDown={preventAddressCommit} onMouseDown={preventAddressCommit}
      onClick={async event => {
        event.stopPropagation();
        if (event.nativeEvent?.isTrusted !== true || disabled || pending || operation.current) return;
        const stamp = generation.current, owned = Symbol(); operation.current = owned;
        try {
          const result = await onOpenSiteInformation({ browserTabId, conversationId, siteUrl: currentUrl });
          if (generation.current !== stamp || operation.current !== owned) return;
          if (result?.accepted !== true || result.opened !== true || result.closed === true || result.changed === true) throw new Error(result?.message ?? '站点信息未打开。');
          onOpenChange?.(true);
        } catch (error) {
          if (generation.current !== stamp || operation.current !== owned) return;
          onOpenChange?.(false); onError?.(error);
        } finally { if (operation.current === owned) operation.current = null; }
      }}>
      {warning ? <><CodexCuIcon name="shared:Tx" aria-hidden={false} className="codex-cu-site-shrink" />
        <span className="codex-cu-site-truncate">{message(messages, 'notSecure', 'Not secure')}</span></>
        : <CodexCuIcon name="shared:hct" aria-hidden={false} className={cx('codex-cu-site-information-icon', isOpen && 'is-open')} />}
    </CodexCuButton>
  </CodexCuTooltip> : null;
  return <div className={cx('codex-cu-site-information', shouldAnimateAddressExpansion && 'can-animate', className)}
    style={{ width }} inert={isAddressEditing ? '' : undefined}>
    {renderPermissionPrompt ? renderPermissionPrompt(trigger) : trigger}
  </div>;
}

const annotationFeatures = {
  containers: ['annotationRegions', 'Annotatable content', 'annotationRegionsDescription', 'This site specifies which elements on the page can be selected to annotate'],
  controls: ['annotationControls', 'Custom controls', 'annotationControlsDescription', 'This site provides custom controls to adjust while annotating certain elements'],
  surfaces: ['annotationSurfaces', 'Interactive surfaces', 'annotationSurfacesDescription', 'Part of this site supports annotating custom elements based on your pointer position'],
  'mode-toggle': ['annotationModeToggle', 'Annotation mode toggle', 'annotationModeToggleDescription', 'This site has a button that toggles annotation mode on or off'],
  requests: ['annotationRequests', 'Site-started annotations', 'annotationRequestsDescription', 'This site has a button that opens an annotation editor'],
  'requests-with-prompts': ['annotationRequests', 'Site-started annotations', 'annotationRequestsWithPromptsDescription', 'This site has a button that opens an annotation editor and suggests a comment'],
  metadata: ['annotationMetadata', 'Additional context', 'annotationMetadataDescription', 'This site includes extra details when annotating certain elements'],
  'metadata-with-targets': ['annotationMetadata', 'Additional context', 'annotationMetadataDescription', 'This site includes extra details when annotating certain elements'],
};

export function CodexSiteAnnotationFeatures({ enabled, features = [], expanded = false,
  onExpandedChange, onEnabledChange, onPreviewChange, hoveredFeature, focusedFeature,
  onFeatureInteraction, messages,
}) {
  const id = useId(), infoRef = useRef(null);
  const hovered = hoveredFeature != null && features.includes(hoveredFeature) ? hoveredFeature : undefined;
  const focused = features.includes(focusedFeature) ? focusedFeature : null;
  const canPreview = Boolean(enabled && expanded && onPreviewChange);
  const active = canPreview ? codexSiteAnnotationPreviewFeature(hovered ?? focused) : null;
  const interact = state => {
    onFeatureInteraction?.(state);
    const feature = canPreview ? codexSiteAnnotationPreviewFeature(state.hovered ?? state.focused) : null;
    onPreviewChange?.(feature && infoRef.current ? { feature, color: getComputedStyle(infoRef.current).color } : null);
  };
  return <div className="codex-cu-site-annotation-features">
    <button type="button" className="codex-cu-site-disclosure" aria-expanded={expanded}
      onClick={() => { if (expanded) onPreviewChange?.(null); onExpandedChange?.(!expanded); }}>
      <span className="codex-cu-site-disclosure-copy">
        <span className="codex-cu-site-truncate">{message(messages, 'annotationFeaturesWithCount', `Annotation features (${features.length.toLocaleString()})`, { count: features.length })}</span>
        {!enabled && !expanded && <span className="codex-cu-site-feature-disabled-summary">{message(messages, 'annotationFeaturesDisabled', 'Custom annotation features are disabled. Standard annotation mode still works.')}</span>}
      </span>
      <CodexCuIcon name="shared:K9" className={cx('codex-cu-site-chevron', expanded && 'is-expanded')} aria-hidden />
    </button>
    {expanded && <div className="codex-cu-site-disclosure-content"><div className="codex-cu-site-disclosure-clip"><div className="codex-cu-site-section-scroll">
      <span ref={infoRef} className="codex-cu-site-info-color" aria-hidden />
      <dl className={cx('codex-cu-site-feature-list', !enabled && 'is-disabled')}>
        {[...features].sort((a, b) => Number(a === 'surfaces') - Number(b === 'surfaces')).map(feature => {
          const descriptor = annotationFeatures[feature], preview = canPreview ? codexSiteAnnotationPreviewFeature(feature) : null;
          return <div key={feature} role="group" aria-labelledby={`${id}-${feature}`} tabIndex={preview == null ? undefined : 0}
            className={cx('codex-cu-site-feature', preview != null && preview === active && 'is-previewing')}
            onPointerEnter={() => interact({ hovered: feature, focused })}
            onPointerLeave={() => interact({ hovered: undefined, focused })}
            onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}
            onFocus={() => interact({ hovered, focused: feature })}
            onBlur={() => interact({ hovered, focused: null })}>
            {descriptor && <><dt id={`${id}-${feature}`}>{message(messages, descriptor[0], descriptor[1])}</dt>
              <dd className={enabled ? 'is-enabled' : undefined}>{message(messages, descriptor[2], descriptor[3])}</dd></>}
          </div>;
        })}
      </dl>
      <div className="codex-cu-site-feature-switch">
        <CodexCuToggle id={`${id}-enabled`} checked={enabled} size="sm" tone="neutral"
          onChange={value => { onPreviewChange?.(null); onEnabledChange?.(value); }} />
        <label htmlFor={`${id}-enabled`}>{enabled
          ? message(messages, 'customAnnotationFeaturesEnabled', 'Annotation features are enabled')
          : message(messages, 'customAnnotationFeaturesDisabled', 'Annotation features are disabled')}</label>
      </div>
    </div></div></div>}
  </div>;
}

function restoreToolSummaryScroll(event) {
  const summary = event.currentTarget, details = summary.closest('details');
  const scroll = summary.closest('[data-webmcp-tool-scroll]')?.parentElement;
  if (!details?.open || !scroll) return;
  const top = details.getBoundingClientRect().top, summaryTop = summary.getBoundingClientRect().top;
  const bounds = scroll.getBoundingClientRect(), contentTop = bounds.top + scroll.clientTop;
  if (summaryTop > contentTop + 1 || top >= summaryTop - 1) return;
  scroll.scrollTop += (top - contentTop) / (bounds.height / scroll.offsetHeight);
}

export function CodexSiteToolItem({ tool, messages, renderCodeBlock = renderToolCodeOutput, tooltipOpen = false }) {
  const readOnly = tool.annotations?.readOnlyHint;
  const displayName = tool.title ?? tool.name;
  const readWriteLabel = readOnly === true ? message(messages, 'read', 'Read') : readOnly === false ? message(messages, 'readWrite', 'Write') : null;
  return <details className="codex-cu-site-tool codex-cu-site-animated-disclosure">
    <CodexCuTooltip open={tooltipOpen} tooltipContent={displayName}>
      <summary className="codex-cu-site-tool-summary" onClick={restoreToolSummaryScroll}>
        <span className="codex-cu-site-tool-name" data-tooltip-overflow-target>{displayName}</span>
        <CodexCuIcon name="shared:wE" aria-hidden className="codex-cu-site-tool-chevron" />
      </summary>
    </CodexCuTooltip>
    <div className="codex-cu-site-sticky-content"><div className="codex-cu-site-sticky-clip"><div className="codex-cu-site-tool-body">
      {(tool.title != null || tool.annotations != null) && <span className="codex-cu-site-tool-access">
        {readWriteLabel && <CodexCuIcon name={readOnly ? 'shared:yd' : 'shared:vd'} aria-label={readWriteLabel} className="codex-cu-site-shrink" />}
        {tool.title != null ? <span className="codex-cu-site-truncate">{tool.name}</span> : readWriteLabel}
      </span>}
      {tool.description != null && <details open className="codex-cu-site-tool-description codex-cu-site-tool-detail codex-cu-site-animated-disclosure">
        <summary><span>{message(messages, 'availableToolDescription', 'Description')}</span><CodexCuIcon name="shared:xd" aria-hidden className="codex-cu-site-detail-chevron" /></summary>
        <p>{tool.description}</p>
      </details>}
      {tool.inputSchema != null && <details className="codex-cu-site-tool-schema codex-cu-site-tool-detail codex-cu-site-animated-disclosure">
        <summary><span>{message(messages, 'availableToolInputSchema', 'Input schema')}</span><CodexCuIcon name="shared:xd" aria-hidden className="codex-cu-site-detail-chevron" /></summary>
        {renderCodeBlock?.({ codeClassName: 'text-xs', codeContainerClassName: 'max-h-48 overflow-auto', content: JSON.stringify(tool.inputSchema, null, 2), language: 'json', showActionBar: false })}
      </details>}
    </div></div></div>
  </details>;
}

export function CodexSiteToolList({ tools, expanded = false, onExpandedChange, onRefreshRequested, messages, renderCodeBlock = renderToolCodeOutput }) {
  if (tools == null) return null;
  const readCount = tools.filter(tool => tool.annotations?.readOnlyHint === true).length;
  const writeCount = tools.filter(tool => tool.annotations?.readOnlyHint === false).length;
  return <>
    <button type="button" className="codex-cu-site-disclosure" aria-expanded={expanded}
      onClick={() => { if (!expanded) onRefreshRequested?.(); onExpandedChange?.(!expanded); }}>
      <span className="codex-cu-site-disclosure-copy">
        <span className="codex-cu-site-truncate">{message(messages, 'availableSiteToolsWithCount', `Available site tools (${tools.length.toLocaleString()})`, { count: tools.length })}</span>
        {readCount + writeCount > 0 && <span className="codex-cu-site-access-summary">{message(messages, 'accessSummary', `${readCount} read, ${writeCount} write ${writeCount === 1 ? 'tool' : 'tools'}`, { readCount, writeCount })}</span>}
      </span>
      <CodexCuIcon name="shared:wE" aria-hidden className={cx('codex-cu-site-chevron', expanded && 'is-expanded')} />
    </button>
    {expanded && <div className="codex-cu-site-disclosure-content"><div className="codex-cu-site-disclosure-clip"><div className="codex-cu-site-section-scroll">
      <div className="codex-cu-site-tool-list" data-webmcp-tool-scroll="">{tools.map(tool => <CodexSiteToolItem key={JSON.stringify([tool.frameId, tool.name])} tool={tool} messages={messages} renderCodeBlock={renderCodeBlock} />)}</div>
    </div></div></div>}
  </>;
}

export function CodexSiteTools({ siteToolsAvailability, canUseWebMcp = false, open = false, onOpenChange,
  isBrowserPanelVisible, isBrowserUseActive, inspectorData, lastToolCall, activityMinimumDurationPending = false,
  animateArrival = false, shouldReduceMotion = false, tooltipOpen = false,
  siteAnnotationFeatures, siteAnnotationFeaturesEnabled, onSiteAnnotationFeaturesEnabledChange,
  onAnnotationPreviewChange, hoveredFeature, focusedFeature, onFeatureInteraction,
  toolsExpanded = false, onToolsExpandedChange, onToolsRefreshRequested,
  annotationFeaturesExpanded = false, onAnnotationFeaturesExpandedChange,
  recentToolCallCount = 0, sourcesConversationId, onOpenSources, siteToolsHelpUrl, onOpenHelp,
  renderCodeBlock = renderToolCodeOutput, messages, popoverProps, className,
}) {
  const availability = codexSiteToolsAvailability(siteToolsAvailability, canUseWebMcp);
  const pending = availability === 'pending-available';
  const visible = availability === 'available' || pending;
  const tools = canUseWebMcp && siteToolsAvailability?.webMcp === 'available' ? inspectorData?.tools : undefined;
  const features = siteToolsAvailability?.annotations === 'available' ? siteAnnotationFeatures : undefined;
  const canPreview = Boolean(open && isBrowserPanelVisible && !isBrowserUseActive && siteAnnotationFeaturesEnabled && siteToolsAvailability?.annotations === 'available' && onAnnotationPreviewChange);
  const active = Boolean(canUseWebMcp && isBrowserPanelVisible && lastToolCall || activityMinimumDurationPending);
  const title = message(messages, 'webMcpTools', 'Site tools');
  return <div className={cx('codex-cu-site-tools', visible ? 'is-available' : 'is-unavailable', shouldReduceMotion && 'reduce-motion', className)} aria-hidden={!visible}>
    {visible && <>
      <CodexCuTooltip open={tooltipOpen && !open} tooltipContent={title} side="bottom">
        <button type="button" disabled={pending} aria-label={title} aria-expanded={open} aria-haspopup="dialog"
          data-browser-sidebar-skip-address-commit="true" className={cx('codex-cu-site-tools-trigger', open && 'is-open', active && 'is-active')}
          onClick={() => onOpenChange?.(!open)}>
          <span className={cx('codex-cu-site-tools-arrival', animateArrival && 'can-animate')}>
            <span className={cx('codex-cu-site-tools-activity', active && !shouldReduceMotion && 'can-pulse')}>
              <CodexCuIcon name="shared:Cd" aria-hidden className={active ? 'codex-cu-site-activity-glow' : undefined} />
            </span>
          </span>
        </button>
      </CodexCuTooltip>
      {!pending && <CodexCuPopoverSurface {...popoverProps} open={open} data-align="end" data-side-offset="1"
        className={cx('codex-cu-site-tools-popover', popoverProps?.className)}
        style={{ maxHeight: 'calc(min(var(--radix-popover-content-available-height), 100vh - 16px) / var(--codex-window-zoom, 1))', ...popoverProps?.style }}>
        <div className="codex-cu-site-tools-intro">
          <span className="codex-cu-site-tools-heading">{message(messages, 'siteToolsHeading', 'Site tools')}</span>
          <p>{message(messages, 'siteToolsDescription', 'Site tools help you and ChatGPT use this website to complete tasks more accurately and with fewer steps.')} {' '}
            <a href={siteToolsHelpUrl} target="_blank" rel="noreferrer" onClick={event => onOpenHelp?.(event, siteToolsHelpUrl)}>{message(messages, 'learnMore', 'Learn more')}</a>
          </p>
        </div>
        <CodexCuMenuSeparator />
        <CodexSiteToolList tools={tools} expanded={toolsExpanded} onExpandedChange={onToolsExpandedChange} onRefreshRequested={onToolsRefreshRequested} messages={messages} renderCodeBlock={renderCodeBlock} />
        {features != null && features.length > 0 && <>
          {tools == null ? null : <CodexCuMenuSeparator />}
          <CodexSiteAnnotationFeatures enabled={siteAnnotationFeaturesEnabled} features={features} expanded={annotationFeaturesExpanded}
            onExpandedChange={onAnnotationFeaturesExpandedChange} onEnabledChange={onSiteAnnotationFeaturesEnabledChange}
            onPreviewChange={canPreview ? onAnnotationPreviewChange : undefined} hoveredFeature={hoveredFeature} focusedFeature={focusedFeature}
            onFeatureInteraction={onFeatureInteraction} messages={messages} />
        </>}
        {onOpenSources != null && canUseWebMcp && sourcesConversationId != null && recentToolCallCount !== 0 && <>
          <CodexCuMenuSeparator className="codex-cu-site-shrink" />
          <CodexCuButton color="ghostActive" radius="large" size="inline" className="codex-cu-site-recent-button" onClick={onOpenSources}>
            <span className="codex-cu-site-recent-content"><span className="codex-cu-site-truncate">{message(messages, 'recentlyUsedSiteToolsWithCount', `Recently used (${recentToolCallCount.toLocaleString()})`, { count: recentToolCallCount })}</span>
              <CodexCuIcon name="shared:$lt" className="codex-cu-site-recent-chevron" />
            </span>
          </CodexCuButton>
        </>}
      </CodexCuPopoverSurface>}
    </>}
  </div>;
}

export const codexSiteAnnotationPermissionMessages = {
  blocked: 'Annotation features blocked for this site. You can still annotate the page yourself.',
  saveError: 'Could not save your choice. Please try again.',
};

export function CodexSiteAnnotationPermissionDialog({ open = true, hostname, isExitingAnnotationMode,
  busy = false, onRespond, onCloseAutoFocus, messages, windowZoom, portalContainer,
}) {
  const formId = useId();
  const respond = allowed => { if (!busy) onRespond?.(allowed); };
  return <CodexCuDialog open={open} size="compact" showDialogClose={false} shouldIgnoreClickOutside
    windowZoom={windowZoom} portalContainer={portalContainer}
    contentProps={{
      onEscapeKeyDown: event => event.preventDefault(),
      onCloseAutoFocus: event => { if (onCloseAutoFocus) { event.preventDefault(); onCloseAutoFocus(); } },
      onOpenAutoFocus: event => { event.preventDefault(); document.getElementById(formId)?.closest('[role="dialog"]')?.focus(); },
      onKeyDown: event => { if (event.key === 'Enter' && !event.repeat && event.target === event.currentTarget) { event.preventDefault(); respond(true); } },
    }}>
      <CodexCuDialogBody as="form" id={formId} className="codex-cu-site-permission-body" onSubmit={event => { event.preventDefault(); respond(true); }}>
        <CodexCuDialogSection><CodexCuDialogHeader
          title={<CodexCuDialogTitle><span className="codex-cu-site-permission-title-row">
            <CodexCuIcon name="shared:Yrt" className="codex-cu-site-permission-icon" />
            {isExitingAnnotationMode
              ? message(messages, 'toggleTitleForSite', 'Let this site toggle annotation mode?')
              : message(messages, 'enterTitleForSite', 'Let this site start annotation mode?')}
          </span></CodexCuDialogTitle>}
          subtitle={<CodexCuDialogDescription>{message(messages, 'summaryWithDomain', `Annotation mode lets you leave comments for ChatGPT on the page. ${hostname} can suggest comments and add context but can’t read or submit your prompts.`, { domain: hostname })}</CodexCuDialogDescription>}
        /></CodexCuDialogSection>
        <CodexCuDialogSection><CodexCuDialogFooter>
          <CodexCuButton color="secondary" size="medium" disabled={busy} type="button" onClick={() => respond(false)}>{message(messages, 'block', 'Block')}</CodexCuButton>
          <CodexCuButton size="medium" disabled={busy} type="submit">{message(messages, 'allow', 'Allow')}<span aria-hidden><kbd className="codex-cu-site-permission-shortcut">↵</kbd></span></CodexCuButton>
        </CodexCuDialogFooter></CodexCuDialogSection>
      </CodexCuDialogBody>
  </CodexCuDialog>;
}

export function codexPrettySiteToolJson(value) {
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

// The shipped Sources activity shell and JSON renderer are separate components.
// Callers supply their reconstructed renderers; there is no substitute card.
export function CodexSiteToolActivity({ calls = [], renderActivity, renderCodeBlock = renderToolCodeOutput, messages }) {
  if (!renderActivity) return null;
  const groups = new Map();
  for (const call of calls) {
    const group = groups.get(call.name);
    if (group) group.push(call); else groups.set(call.name, [call]);
  }
  return <ul className="codex-cu-site-activity-list">{[...groups].map(([name, grouped]) => {
    const records = grouped.filter(call => call.kind === 'invokeTool' && call.inputJson != null || call.outputJson != null);
    return <li key={name}>{renderActivity({ icon: null, indentContent: false, status: 'completed',
      summary: <span className="codex-cu-site-activity-summary">{message(messages, 'toolUseCount', `${name} ${grouped.length === 1 ? 'once' : `${grouped.length} times`}`, { name, count: grouped.length })}</span>,
      children: records.length === 0 ? null : <ul className="codex-cu-site-activity-records">{records.map((call, index) => <li key={`${name}:${index}`}>
        {call.kind !== 'invokeTool' || call.inputJson == null ? null : renderCodeBlock?.({ codeContainerClassName: 'max-h-48 overflow-auto', content: codexPrettySiteToolJson(call.inputJson), language: 'json', showStickyRightContent: false,
          title: call.inputTruncated ? message(messages, 'inputTruncated', 'Input (truncated)') : message(messages, 'input', 'Input') })}
        {call.outputJson == null ? null : renderCodeBlock?.({ codeContainerClassName: 'max-h-48 overflow-auto', content: codexPrettySiteToolJson(call.outputJson), language: 'json', showStickyRightContent: false,
          title: call.outputTruncated ? message(messages, 'resultTruncated', 'Result (truncated)') : message(messages, 'result', 'Result') })}
      </li>)}</ul>,
    })}</li>;
  })}</ul>;
}
