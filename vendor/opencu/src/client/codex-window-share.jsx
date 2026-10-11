import React, {useState} from 'react';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {ImageDialog} from './tool-image.jsx';
import './codex-window-share.css';

// Source: app-initial Ksl/Ysl/Xsl/Jsl/lyl, app-primary x2e.
// Exact bundle offsets, hashes, gates and native boundaries are retained in
// work/rea-reconstruction/window-share/manifest.json. All capture data is supplied
// by the caller; these components never query windows or request capture access.
const message = (formatMessage, id, defaultMessage, values) =>
  formatMessage?.({id, defaultMessage}, values) ??
  defaultMessage.replace(/\{(\w+)\}/g, (_, key) => values?.[key] ?? `{${key}}`);

/** Original context-action descriptor; insert into the host's context menu. */
export function createCodexAppshotAction({
  disabled = false, formatMessage, key = 'context-action:attach-appshot', target,
  onCapture,
}) {
  return {
    action: onCapture,
    disabled: disabled || target == null,
    key,
    label: target == null
      ? message(formatMessage, 'composer.appshotCapture.attach', 'Attach appshot')
      : message(formatMessage, 'composer.appshotCapture.attachApp', 'Attach {appName}', {appName: target.name}),
    detail: null,
    iconElement: target?.iconSmallDataURL == null
      ? <CodexCuIcon name="shared:W_" className="tx-cu-codex-appshot-action-icon"/>
      : <img alt="" aria-hidden="true" className="tx-cu-codex-appshot-action-image" src={target.iconSmallDataURL}/>,
    type: 'action',
  };
}

export function CodexAppshotTextPreview({accessibilityText, formatMessage}) {
  return <div className="tx-cu-codex-appshot-text-preview">
    <div className="tx-cu-codex-appshot-text-heading"><div>
      {message(formatMessage, 'appshotAttachment.accessibilityTextPreviewTitle', 'plaintext')}
    </div></div>
    <div className="tx-cu-codex-appshot-text-body"><pre>{accessibilityText}</pre></div>
  </div>;
}

function AppshotThreadImage({appIconSrc, screenshotAlt, screenshotSrc}) {
  const [naturalSize, setNaturalSize] = useState(null);
  const renderedHeight = naturalSize?.height > 0 && naturalSize?.width > 0
    ? naturalSize.height * Math.min(232 / naturalSize.width, 140 / naturalSize.height)
    : 140;
  return <div className="tx-cu-codex-appshot-thread-image">
    <div className="tx-cu-codex-appshot-thread-image-mask" style={{height: renderedHeight}}>
      {screenshotSrc != null && <img src={screenshotSrc} alt={screenshotAlt ?? ''} draggable={false}
        onLoad={event => setNaturalSize({height: event.currentTarget.naturalHeight, width: event.currentTarget.naturalWidth})}/>}
    </div>
    {appIconSrc != null && appIconSrc.length > 0 && <img className="tx-cu-codex-appshot-app-icon" src={appIconSrc} alt="" aria-hidden="true" draggable={false}/>}
  </div>;
}

/** Ksl's composer and sent-thread variants, including pending handoff endpoints. */
export function CodexAppshotAttachment({
  appIconSrc, appName, accessibilityText, captureRequestId,
  handoffComplete = true, handoffHeightReady = true,
  handoffTransitionSpringDampingFraction, handoffTransitionSpringResponse,
  previewEnabled = true, previewIndex = 0, previewItems,
  screenshotAlt, screenshotSrc, transitionSnapshotHeight, transitionSnapshotSrc, windowTitle,
  variant = 'composer', onRemove, formatMessage,
  renderHandoff,
}) {
  const [open, setOpen] = useState(false);
  const [showText, setShowText] = useState(false);
  const [activeIndex, setActiveIndex] = useState(previewIndex);
  const title = windowTitle?.trim() || appName;
  const singlePreview = screenshotSrc == null ? null : {alt: screenshotAlt ?? '', accessibilityText, src: screenshotSrc};
  const items = previewItems ?? (singlePreview == null ? [] : [singlePreview]);
  const current = items[activeIndex] ?? singlePreview;
  const text = current?.accessibilityText?.trim() ?? '';
  const hasText = text.length > 0;
  const textVisible = showText && hasText;
  const canPreview = previewEnabled && handoffComplete && current != null;
  const composer = variant === 'composer';
  const thread = variant === 'thread';
  const layoutReady = handoffComplete || handoffHeightReady;
  const snapshotHeight = transitionSnapshotHeight ?? 140;
  const hasSnapshot = transitionSnapshotSrc != null && transitionSnapshotSrc.length > 0;
  const setPreviewOpen = value => {
    if (value) setActiveIndex(previewIndex);
    setShowText(false);
    setOpen(value);
  };
  const interactiveProps = canPreview ? {
    'aria-label': title,
    onClick: () => setPreviewOpen(true),
    onKeyDown: event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setPreviewOpen(true);
      }
    },
    role: 'button', tabIndex: 0,
  } : {};
  const cardProps = {
    className: 'tx-cu-codex-appshot composer-attachment-surface',
    'data-appshot-attachment': true,
    'data-appshot-capture-request-id': captureRequestId,
    'data-codex-cu-appshot-variant': variant,
    'data-codex-cu-appshot-complete': String(handoffComplete),
    'data-codex-cu-appshot-interactive': String(canPreview),
    ...interactiveProps,
  };
  const content = <div className="tx-cu-codex-appshot-card" data-appshot-attachment-card>
    {thread ? <AppshotThreadImage appIconSrc={appIconSrc} screenshotAlt={screenshotAlt} screenshotSrc={screenshotSrc}/>
      : <div className="tx-cu-codex-appshot-composer-image" style={{height: snapshotHeight}}>
      {hasSnapshot
        ? <img src={transitionSnapshotSrc} alt="" aria-hidden="true" draggable={false} style={{height: snapshotHeight, width: 232}}/>
        : <span aria-hidden="true" style={{height: snapshotHeight, width: 232}}/>}
    </div>}
    {thread && <div className="tx-cu-codex-appshot-title">{title}</div>}
    {handoffComplete && onRemove && <button type="button" className="tx-cu-codex-appshot-remove"
      aria-label={message(formatMessage, 'appshotAttachment.removeAriaLabel', 'Remove {title}', {title})}
      onPointerDown={event => {event.preventDefault(); event.stopPropagation();}}
      onClick={event => {event.preventDefault(); event.stopPropagation(); onRemove();}}>
      <CodexCuIcon name="shared:VT" size={12}/>
    </button>}
  </div>;
  const endpoints = {
    '--appshot-handoff-gap-compensation': layoutReady ? 0 : -1,
    height: layoutReady ? snapshotHeight + 8 : 0,
    width: layoutReady ? 232 : 0,
  };
  const spring = handoffComplete ? {duration: 0} : {
    type: 'spring',
    visualDuration: handoffTransitionSpringResponse == null || handoffTransitionSpringResponse <= 0 ? .35 : handoffTransitionSpringResponse,
    bounce: Math.max(0, Math.min(1, 1 - (handoffTransitionSpringDampingFraction ?? .73))),
    delay: .15,
  };
  const style = composer ? {
    ...endpoints,
    marginRight: 'calc(var(--composer-attachment-gap, calc(var(--spacing) * 3)) * var(--appshot-handoff-gap-compensation, 0))',
  } : undefined;
  const card = composer && renderHandoff
    ? renderHandoff({cardProps, children: content, initial: false, animate: endpoints, transition: spring, style: {marginRight: style.marginRight}})
    : <div {...cardProps} style={style}>{content}</div>;
  const movePreview = index => {setActiveIndex(index); setShowText(false);};
  return <>{card}{canPreview && current != null && open && <ImageDialog
    src={current.src} alt={current.alt}
    downloadSrc={current.src} imageDraggable={false} controlsSurface="translucent"
    onClose={() => setPreviewOpen(false)} showZoomControls={!textVisible}
    previewContent={textVisible ? <CodexAppshotTextPreview accessibilityText={text} formatMessage={formatMessage}/> : undefined}
    toolbarLeadingAction={hasText ? {
      active: textVisible,
      ariaLabel: textVisible
        ? message(formatMessage, 'appshotAttachment.showVisualPreview', 'Show screenshot')
        : message(formatMessage, 'appshotAttachment.showAccessibilityText', 'Show accessibility text'),
      label: message(formatMessage, 'appshotAttachment.viewAccessibilityText', 'View text'),
      onClick: () => setShowText(value => !value),
    } : undefined}
    onPreviousImage={activeIndex > 0 ? () => movePreview(activeIndex - 1) : undefined}
    onNextImage={activeIndex + 1 < items.length ? () => movePreview(activeIndex + 1) : undefined}
  />}</>;
}

/** Local composer's existing attachment row; no window picker is fabricated. */
export function CodexAppshotAttachmentRow({attachments = [], children, formatMessage, renderHandoff}) {
  if (attachments.length === 0 && children == null) return null;
  const single = children == null && attachments.length === 1 ? attachments[0] : null;
  const margin = single?.handoffComplete === false && single?.handoffHeightReady === false ? -4 : 0;
  return <div className="tx-cu-codex-appshot-scroll" data-composer-attachments-scroll-container style={{marginTop: margin, marginBottom: margin}}>
    <div className="tx-cu-codex-appshot-row" data-composer-attachments-row>
      {attachments.map((attachment, index) => <CodexAppshotAttachment key={attachment.captureRequestId ?? attachment.screenshotSrc ?? index}
        {...attachment} formatMessage={formatMessage} renderHandoff={renderHandoff}/>)}
      {children}
    </div>
  </div>;
}
