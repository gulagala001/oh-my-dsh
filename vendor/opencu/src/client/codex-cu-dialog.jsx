import React, { Children, cloneElement, createContext, isValidElement, useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CodexCuButton } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuOverlayOwnerProvider, useCodexCuOverlayOwnerRegistry } from './codex-cu-overlay.jsx';
import './codex-cu-dialog.css';

// Codex 26.1007.21159 / build 20052. Full bindings/CSS references live in
// work/rea-reconstruction/dialog. This local surface covers default/opaque/form.
const DialogContext = createContext(null);
const join = (...values) => values.filter(Boolean).join(' ');
const focusableSelector = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function outsideEvent(originalEvent) {
  const event = new Event('codex-cu-dialog-interact-outside', { cancelable: true });
  Object.defineProperty(event, 'detail', { value: { originalEvent } });
  Object.defineProperty(event, 'target', { value: originalEvent.target });
  return event;
}

/** Controlled counterpart of IT=qMi / QMi; business pending/permission gates
 * remain in onOpenChange and the children, as in the original call sites. */
export function CodexCuDialog({
  open = false, onOpenChange, children, modal = true, size = 'default',
  variant = 'default', radius = 'default', contentOverflow = 'hidden',
  contentPosition = 'centered', contentClassName, overlayClassName,
  showDialogClose = true, closeButtonSize = 'default', dialogCloseClassName,
  dialogCloseLabel = 'Close dialog', autoFocusCloseButton, headerActions,
  shouldIgnoreClickOutside = false, shouldStopPointerDownPropagation = true,
  portalContainer, triggerContent, triggerAsChild = true, triggerRef,
  viewportSized = false, unstyledContent = false, widthHint,
  windowZoom, contentProps = {},
}) {
  const generatedId = useId();
  const overlayOwner = useCodexCuOverlayOwnerRegistry(generatedId);
  const titleId = `${generatedId}-title`, descriptionId = `${generatedId}-description`;
  const [titleCount, setTitleCount] = useState(0), [descriptionCount, setDescriptionCount] = useState(0);
  const [container, setContainer] = useState(null);
  const anchorRef = useRef(null), surfaceRef = useRef(null), heightRef = useRef(null);
  const closeRef = useRef(null), localTriggerRef = useRef(null), callbackRef = useRef(null);
  const {
    className, style, onOpenAutoFocus, onCloseAutoFocus, onPointerDownOutside,
    onInteractOutside, onEscapeKeyDown, onPointerDown, onKeyDown,
    ...surfaceProps
  } = contentProps;
  callbackRef.current = { onOpenChange, onPointerDownOutside, onInteractOutside, onEscapeKeyDown, shouldIgnoreClickOutside, overlayOwner };

  useLayoutEffect(() => {
    setContainer(portalContainer ?? anchorRef.current?.closest('[data-codex-cu-scope]') ?? document.body);
  }, [portalContainer]);

  const explicitlySized = style?.height != null || /\bh-(?!auto\b)[^\s]+/.test(`${contentClassName ?? ''} ${className ?? ''}`);
  const heightAnimated = !unstyledContent && !viewportSized && contentPosition !== 'top'
    && !['setup', 'wideTall', 'xwideTall', 'editor', 'appLauncher', 'square', 'sheet', 'responsiveSheet', 'xxxwideTall'].includes(size)
    && !explicitlySized;
  useLayoutEffect(() => {
    const surface = surfaceRef.current, body = heightRef.current;
    if (!open || !heightAnimated || !surface || !body || typeof ResizeObserver === 'undefined') return;
    let measureFrame = null, readyFrame = null, lastHeight = -1, ready = false;
    const measure = () => {
      const height = body.offsetHeight || body.scrollHeight;
      if (!Number.isFinite(height) || Math.abs(height - lastHeight) < .5) return;
      lastHeight = height;
      surface.style.setProperty('--dialog-content-height', `${height}px`);
      surface.style.height = 'var(--dialog-content-height)';
      if (!ready) {
        if (readyFrame != null) cancelAnimationFrame(readyFrame);
        readyFrame = requestAnimationFrame(() => { ready = true; surface.dataset.dialogHeightReady = 'true'; });
      }
    };
    const schedule = () => { measureFrame ??= requestAnimationFrame(() => { measureFrame = null; measure(); }); };
    const observer = new ResizeObserver(schedule);
    observer.observe(body);
    schedule();
    return () => {
      observer.disconnect();
      if (measureFrame != null) cancelAnimationFrame(measureFrame);
      if (readyFrame != null) cancelAnimationFrame(readyFrame);
      surface.style.removeProperty('--dialog-content-height');
      surface.style.height = '';
      delete surface.dataset.dialogHeightReady;
    };
  }, [open, container, heightAnimated]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!open || !surface) return;
    const document = surface.ownerDocument;
    const event = new Event('codex-cu-dialog-open-auto-focus', { cancelable: true });
    document.defaultView?.getSelection()?.removeAllRanges();
    onOpenAutoFocus?.(event);
    if (!event.defaultPrevented) {
      const first = autoFocusCloseButton ? closeRef.current : [...surface.querySelectorAll(focusableSelector)].find(node => node.getClientRects().length > 0);
      (first ?? surface).focus();
    }
    const onDocumentPointerDown = originalEvent => {
      if (surface.contains(originalEvent.target) || callbackRef.current.overlayOwner.isInternalTarget(originalEvent.target)) return;
      const current = callbackRef.current, outside = outsideEvent(originalEvent);
      if (current.shouldIgnoreClickOutside || originalEvent.button === 2 || (originalEvent.button === 0 && originalEvent.ctrlKey)) outside.preventDefault();
      current.onPointerDownOutside?.(outside);
      current.onInteractOutside?.(outside);
      if (!outside.defaultPrevented && !localTriggerRef.current?.contains(originalEvent.target)) current.onOpenChange?.(false);
    };
    const onDocumentKeyDown = event => {
      // Native child layers own Escape before their parent Dialog. Menus and
      // Popovers block it; ordinary visual Tooltips do not.
      if (event.defaultPrevented || event.key !== 'Escape' || callbackRef.current.overlayOwner.hasOpenPortals()) return;
      callbackRef.current.onEscapeKeyDown?.(event);
      if (!event.defaultPrevented) { event.preventDefault(); callbackRef.current.onOpenChange?.(false); }
    };
    const onDocumentFocus = event => {
      if (modal && !surface.contains(event.target) && !callbackRef.current.overlayOwner.isInternalTarget(event.target)) surface.focus();
    };
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    document.addEventListener('focusin', onDocumentFocus);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
      document.removeEventListener('focusin', onDocumentFocus);
      const closeEvent = new Event('codex-cu-dialog-close-auto-focus', { cancelable: true });
      onCloseAutoFocus?.(closeEvent);
      if (!closeEvent.defaultPrevented) localTriggerRef.current?.focus();
    };
  }, [open, container, modal]);

  const attachTrigger = node => {
    localTriggerRef.current = node;
    if (typeof triggerRef === 'function') triggerRef(node);
    else if (triggerRef) triggerRef.current = node;
  };
  const triggerProps = {
    ref: attachTrigger, 'aria-haspopup': 'dialog', 'aria-expanded': open,
    'aria-controls': open ? `${generatedId}-content` : undefined, 'data-state': open ? 'open' : 'closed',
    onClick: event => { triggerContent?.props?.onClick?.(event); if (!event.defaultPrevented) onOpenChange?.(!open); },
  };
  const trigger = triggerContent && (triggerAsChild && isValidElement(triggerContent)
    ? cloneElement(triggerContent, triggerProps)
    : <button type="button" {...triggerProps}>{triggerContent}</button>);
  const context = { titleId, descriptionId, setTitleCount, setDescriptionCount };

  // QMi applies widthHint before square/sheet/viewport/setup inline dimensions.
  const hintApplies = !viewportSized && !['square', 'sheet'].includes(size);

  let surface = null;
  if (open && ['default', 'opaque', 'form'].includes(variant)) {
    const close = showDialogClose && <button
      ref={closeRef} type="button" className={join('codex-cu-dialog-close', dialogCloseClassName)}
      data-size={closeButtonSize} data-in-header={headerActions != null ? 'true' : undefined}
      autoFocus={autoFocusCloseButton}
      onClick={event => { event.stopPropagation(); onOpenChange?.(false); }}
    >{closeButtonSize === 'default'
      ? variant === 'form' ? <CodexCuIcon name="shared:wot" aria-hidden="true" /> : <CodexCuIcon name="shared:VT" aria-hidden="true" className="codex-cu-dialog-close-icon" />
      : <CodexCuIcon name="shared:Sot" aria-hidden="true" />}<span className="codex-cu-dialog-sr-only">{dialogCloseLabel}</span></button>;
    const closeActions = headerActions == null ? close : <div className="codex-cu-dialog-header-actions">{headerActions}{close}</div>;
    surface = <CodexCuOverlayOwnerProvider value={overlayOwner}><DialogContext.Provider value={context}>
      {modal && <div className={join('codex-cu-dialog-overlay', overlayClassName)} data-variant={variant} data-size={size} data-position={contentPosition} data-state="open" />}
      <div
        {...surfaceProps} ref={surfaceRef} id={surfaceProps.id ?? `${generatedId}-content`}
        role={Object.hasOwn(surfaceProps, 'role') ? surfaceProps.role : 'dialog'}
        aria-modal={Object.hasOwn(surfaceProps, 'aria-modal') ? surfaceProps['aria-modal'] : modal}
        aria-labelledby={Object.hasOwn(surfaceProps, 'aria-labelledby') ? surfaceProps['aria-labelledby'] : titleCount ? titleId : undefined}
        aria-describedby={Object.hasOwn(surfaceProps, 'aria-describedby') ? surfaceProps['aria-describedby'] : descriptionCount ? descriptionId : undefined}
        tabIndex={Object.hasOwn(surfaceProps, 'tabIndex') ? surfaceProps.tabIndex : -1}
        className={join('codex-cu-dialog', contentClassName, className)}
        data-overlay-owner={overlayOwner.id}
        data-state="open" data-size={size} data-variant={variant} data-radius={radius}
        data-position={contentPosition} data-overflow={contentOverflow} data-portal={portalContainer != null ? 'custom' : 'default'}
        data-viewport-sized={viewportSized ? 'true' : undefined} data-unstyled={unstyledContent ? 'true' : undefined}
        style={{ ...(hintApplies && widthHint != null && Number.isFinite(widthHint) && widthHint > 0 ? { width: widthHint } : null),
          ...(windowZoom != null ? { '--codex-window-zoom': windowZoom } : null),
          ...(contentPosition !== 'inline' && portalContainer == null ? { zoom: windowZoom ?? 'var(--codex-window-zoom)' } : null), ...style }}
        onPointerDown={event => { if (shouldStopPointerDownPropagation) event.stopPropagation(); onPointerDown?.(event); }}
        onKeyDown={event => {
          onKeyDown?.(event);
          if (event.defaultPrevented || event.key !== 'Tab' || !modal || overlayOwner.isInternalTarget(event.target)) return;
          const nodes = [...surfaceRef.current.querySelectorAll(focusableSelector)].filter(node => node.getClientRects().length > 0);
          const first = nodes[0], last = nodes[nodes.length - 1], active = surfaceRef.current.ownerDocument.activeElement;
          if (!first) { event.preventDefault(); surfaceRef.current.focus(); }
          else if (event.shiftKey && (active === first || active === surfaceRef.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && (active === last || active === surfaceRef.current)) { event.preventDefault(); first.focus(); }
        }}
      >{heightAnimated ? <div ref={heightRef}>{children}</div> : children}{closeActions}</div>
    </DialogContext.Provider></CodexCuOverlayOwnerProvider>;
    if (contentPosition === 'scrollable') surface = <div className="codex-cu-dialog-scroll-viewport"><div className="codex-cu-dialog-scroll-layout">{surface}</div></div>;
  }
  return <>{trigger}<span hidden ref={anchorRef} />{contentPosition === 'inline' ? surface : container && surface ? createPortal(surface, container) : null}</>;
}

export function CodexCuDialogTitle({ children, asChild = false, className, ...props }) {
  const context = useContext(DialogContext);
  useLayoutEffect(() => { context?.setTitleCount(count => count + 1); return () => context?.setTitleCount(count => count - 1); }, [context?.setTitleCount]);
  const attributes = { id: context?.titleId, ...props, className: join('codex-cu-dialog-title', className, asChild && children?.props?.className) };
  return asChild && isValidElement(children) ? cloneElement(children, attributes) : <h2 {...attributes}>{children}</h2>;
}

export function CodexCuDialogDescription({ children, asChild = false, className, ...props }) {
  const context = useContext(DialogContext);
  useLayoutEffect(() => { context?.setDescriptionCount(count => count + 1); return () => context?.setDescriptionCount(count => count - 1); }, [context?.setDescriptionCount]);
  const attributes = { id: context?.descriptionId, ...props, className: join('codex-cu-dialog-description', className, asChild && children?.props?.className) };
  return asChild && isValidElement(children) ? cloneElement(children, attributes) : <p {...attributes}>{children}</p>;
}

export function CodexCuDialogHeader({
  icon, title, subtitle, className, iconClassName, iconBackgroundClassName,
  titleSize = 'dialog', titleClassName, subtitleSize = 'base', subtitleTone = 'tertiary', subtitleClassName,
  variant = 'default',
}) {
  return <div className={join('codex-cu-dialog-header', className)} data-variant={variant}>
    {icon && <span className={join('codex-cu-dialog-header-icon', iconClassName, iconBackgroundClassName)} data-default-background={iconBackgroundClassName == null ? 'true' : undefined}>{icon}</span>}
    <div className="codex-cu-dialog-header-copy">
      {title && <div className={join('codex-cu-dialog-heading', titleClassName)} data-size={titleSize}>{title}</div>}
      {subtitle && <div className={join('codex-cu-dialog-subtitle', subtitleClassName)} data-size={subtitleSize} data-tone={subtitleTone}>{subtitle}</div>}
    </div>
  </div>;
}

export function CodexCuDialogBody({ as, children, className, size, variant = 'default', ...props }) {
  const Element = as === 'form' ? 'form' : 'div';
  return <Element {...props} className={join('codex-cu-dialog-body', className)} data-size={size} data-variant={variant}>{children}</Element>;
}

export function CodexCuDialogSection({ children, className, spacing = 'default', ...props }) {
  return <div {...props} className={join('codex-cu-dialog-section', className)} data-spacing={spacing}>{children}</div>;
}

export function CodexCuDialogFooter({ children, className, expandSingleButton = true, variant = 'default', ...props }) {
  const items = Children.toArray(children);
  const count = items.reduce((value, item) => value + (isValidElement(item) && item.type === CodexCuButton ? 1 : 0), 0);
  return <div {...props} className={join('codex-cu-dialog-footer', className)} data-variant={variant}>
    {items.map(item => isValidElement(item) && item.type === CodexCuButton
      ? cloneElement(item, { size: item.props.size ?? 'medium', className: join(item.props.className, expandSingleButton && count === 1 && 'codex-cu-dialog-single-action') })
      : item)}
  </div>;
}
