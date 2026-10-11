import React, { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPosition, useAnchoredMaxHeight, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives';
import { CodexCuScope, useCodexCuAppearance } from './codex-cu-scope.jsx';
import { useCodexCuSourceFloatingPosition } from './codex-cu-overlay-position.jsx';
import { createCodexCuMenuPointerGrace, createCodexCuSubmenuPointerGrace, applyCodexCuMenuItemPointerMove, applyCodexCuMenuItemPointerLeave, applyCodexCuSubmenuPointerLeave } from './codex-cu-overlay-grace.mjs';
import { createCodexCuTooltipPointer } from './codex-cu-tooltip-pointer.mjs';

// Public DSH 0.2.1-alpha.2 positioning hooks; no DSH visual Menu/Popover shell.
// Source/host API limits are recorded in work/rea-reconstruction/primitives/overlay-contract.md.
const OwnerContext = createContext(null);
const ParentLayerContext = createContext(null);
const RendererContext = createContext(null);
const activeLayers = new WeakMap();
const sourceFocusableSelector = 'a[href],button,input,select,textarea,[tabindex],[contenteditable]';
const menuItemSelector = '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]';
const assignRef = (ref, value) => { if (typeof ref === 'function') return ref(value); if (ref) ref.current = value; };
function sourceContains(root, target) {
  const NodeClass = root?.ownerDocument.defaultView?.Node;
  return typeof NodeClass === 'function' && target instanceof NodeClass && root.contains(target);
}
function sourceElementRef(element) {
  let getter = Object.getOwnPropertyDescriptor(element.props, 'ref')?.get;
  if (getter && 'isReactWarning' in getter && getter.isReactWarning) return element.ref;
  getter = Object.getOwnPropertyDescriptor(element, 'ref')?.get;
  return getter && 'isReactWarning' in getter && getter.isReactWarning ? element.props.ref : element.props.ref || element.ref;
}
const layerStack = document => { let stack = activeLayers.get(document); if (!stack) { stack = []; activeLayers.set(document, stack); } return stack; };
const blocksEscape = record => record.isOpen() && (record.type !== 'tooltip' || record.interactive && record.keyboardNavigation && record.panelRef.current?.contains(record.document.activeElement));
const isTopLayer = record => {
  const blocking = Boolean(blocksEscape(record));
  const candidates = layerStack(record.document).filter(layer => layer.isOpen() && Boolean(blocksEscape(layer)) === blocking);
  // React commits child layout effects before parents, so mount order alone
  // cannot decide whether a submenu or its parent owns dismissal.
  return candidates.filter(layer => !candidates.some(child => isDescendant(child, layer))).at(-1) === record;
};
const isDescendant = (record, parent) => { for (let node = record.parent; node; node = node.parent) if (node === parent) return true; return false; };
function layerContains(record, target) {
  if (record.panelRef.current?.contains(target) || record.anchorRef.current?.contains(target)) return true;
  return layerStack(record.document).some(child => isDescendant(child, record) && child.panelRef.current?.contains(target));
}
function outsideEvent(kind, originalEvent) {
  const event = new Event(`codex-cu-overlay-${kind}`, { cancelable: true });
  Object.defineProperty(event, 'detail', { value: { originalEvent } });
  if (originalEvent) Object.defineProperty(event, 'target', { value: originalEvent.target });
  return event;
}
function sourceFocusable(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(sourceFocusableSelector)).filter(element => {
    if (element.tabIndex < 0 && (element.hasAttribute('tabindex') || !element.matches('[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]')) || element.matches(':disabled') || element.closest('[inert],[hidden]') || getComputedStyle(element).visibility === 'hidden') return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) if (getComputedStyle(ancestor).display === 'none') return false;
    return true;
  }).sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
}
function sourceTooltipGate(trigger, openWhen) {
  if (openWhen === 'always') return true;
  if (openWhen === 'trigger-overflows') { const target = trigger?.querySelector('[data-tooltip-overflow-target]') ?? trigger; return target != null && (target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight); }
  if (openWhen === 'visibility-target-hidden') { const target = trigger?.querySelector('[data-tooltip-visibility-target]'); return target != null && getComputedStyle(target).display === 'none'; }
  return false;
}
function menuRoot(panel) { return panel?.querySelector('[role="menu"]') ?? panel; }
function menuItems(panel) {
  const root = menuRoot(panel);
  return Array.from(root?.querySelectorAll(menuItemSelector) ?? []).filter(element => !element.hasAttribute('data-disabled') && !element.matches(':disabled') && element.closest('[hidden],[inert]') == null && element.getClientRects().length && element.closest('[role="menu"]') === (root.getAttribute('role') === 'menu' ? root : null));
}
function focusMenuItem(element) { element?.focus({ preventScroll: true }); }
function sourceMenuTypeahead(items, search, current) {
  const value = search.length > 1 && Array.from(search).every(character => character === search[0]) ? search[0] : search;
  const currentIndex = items.indexOf(current), start = Math.max(currentIndex, 0);
  let candidates = items.map((item, index) => items[(start + index) % items.length]);
  if (value.length === 1) candidates = candidates.filter(item => item !== current);
  const match = candidates.find(item => (item.getAttribute('data-text-value') ?? item.textContent ?? '').trim().toLowerCase().startsWith(value.toLowerCase()));
  return match === current ? undefined : match;
}

// Original Radix iTe keeps a closed surface only when its animation name
// changes, then unmounts on animationend/cancel. Durations stay in Codex CSS.
function useSourcePresence(open, scaledRef) {
  const [suspended, setSuspended] = useState(false), previousOpen = useRef(open), previousAnimation = useRef('none');
  useLayoutEffect(() => {
    const node = scaledRef.current?.firstElementChild;
    if (!node) { if (!open) setSuspended(false); previousOpen.current = open; return; }
    const animationName = () => getComputedStyle(node).animationName || 'none';
    let restoreFillTimer;
    if (open) { previousAnimation.current = animationName(); setSuspended(true); }
    else if (previousOpen.current) {
      const nextAnimation = animationName(), style = getComputedStyle(node);
      setSuspended(nextAnimation !== 'none' && style.display !== 'none' && nextAnimation !== previousAnimation.current);
    }
    previousOpen.current = open;
    const start = event => { if (event.target === node) previousAnimation.current = animationName(); };
    const end = event => {
      if (event.target !== node || !animationName().split(',').some(name => name.trim() === event.animationName) || previousOpen.current) return;
      setSuspended(false);
      const previousFill = node.style.animationFillMode; node.style.animationFillMode = 'forwards';
      restoreFillTimer = node.ownerDocument.defaultView.setTimeout(() => { if (node.style.animationFillMode === 'forwards') node.style.animationFillMode = previousFill; });
    };
    node.addEventListener('animationstart', start); node.addEventListener('animationend', end); node.addEventListener('animationcancel', end);
    return () => { node.removeEventListener('animationstart', start); node.removeEventListener('animationend', end); node.removeEventListener('animationcancel', end); if (restoreFillTimer != null) node.ownerDocument.defaultView.clearTimeout(restoreFillTimer); };
  }, [open, scaledRef]);
  return open || suspended;
}

/** Dialog owners create this before rendering their provider. Child portal
 * registration propagates to ancestor owners without querying unrelated DOM. */
export function useCodexCuOverlayOwnerRegistry(ownerId) {
  const parent = useContext(OwnerContext), portalsRef = useRef(new Map());
  return useMemo(() => ({
    id: ownerId,
    registerPortal(node, registration = {}) {
      if (!node) return () => {};
      portalsRef.current.set(node, registration); const unregisterParent = parent?.registerPortal(node, registration);
      return () => { portalsRef.current.delete(node); unregisterParent?.(); };
    },
    isInternalTarget(target) { return target != null && [...portalsRef.current.keys()].some(node => node.contains(target)); },
    hasOpenPortals() { return [...portalsRef.current.values()].some(registration => typeof registration.blocksEscape === 'function' ? registration.blocksEscape() : registration.blocksEscape !== false); },
    hasAnyPortals() { return portalsRef.current.size > 0; },
  }), [ownerId, parent]);
}
export function CodexCuOverlayOwnerProvider({ ownerId, value, children }) {
  const generatedId = useId(), registry = useCodexCuOverlayOwnerRegistry(ownerId ?? generatedId);
  return <OwnerContext.Provider value={value ?? registry}>{children}</OwnerContext.Provider>;
}
export function useCodexCuOverlayOwner() { return useContext(OwnerContext); }

/** Same renderLayer object accepted by SplitButton and specialist CU menus.
 * The injected hooks must stay stable for a mounted preview. */
export function createCodexCuLayerRenderer(defaults = {}) {
  return options => <CodexCuOverlay {...defaults} {...options} />;
}
export function renderCodexCuLayer(options) { return <CodexCuOverlay {...options} />; }
export function CodexCuOverlayProvider({ renderLayer, usePosition, useMaxHeight, useOutsidePointer, portalContainer, children }) {
  const renderer = useMemo(() => renderLayer ?? createCodexCuLayerRenderer({ usePosition, useMaxHeight, useOutsidePointer, portalContainer }), [renderLayer, usePosition, useMaxHeight, useOutsidePointer, portalContainer]);
  return <RendererContext.Provider value={renderer}>{children}</RendererContext.Provider>;
}
export function useCodexCuLayerRenderer() { return useContext(RendererContext) ?? renderCodexCuLayer; }

export function CodexCuOverlay(options) {
  const {
    type = 'menu', kind, open = false, forceMount = false, onOpenChange, onClose, triggerButton, trigger,
    anchorRef: externalAnchorRef, triggerRef, contentRef, content, children, portalContainer,
    side, preferTooltipCssSide = false, align = type === 'tooltip' ? 'center' : 'start',
    sideOffset, alignOffset = 0,
    collisionPadding = type === 'tooltip' ? 8 : 6, collisionBoundary, avoidCollisions = true, availableSizeCap, dir,
    sticky = 'partial', hideWhenDetached = false, updatePositionStrategy = 'optimized', submenu: submenuInput,
    followPointer = false, tooltipVariant = 'tooltip', positioningElement, flipAlignment = true, scaleAvailableSizeWithZoom = false,
    openOnClick = false, openOnFocusWithin = false, isHoverOpenBlocked,
    usePosition = useAnchoredPosition, useMaxHeight = useAnchoredMaxHeight, useOutsidePointer = useDismissOnOutsidePointer,
    autoFocus = type !== 'tooltip', restoreFocus = type !== 'tooltip', loop = false, openIntent,
    onOpenAutoFocus, onCloseAutoFocus, onEscapeKeyDown, onPointerDownOutside, onFocusOutside, onInteractOutside,
    dismissOnOutsidePointer = type !== 'tooltip', dismissOnFocusOutside,
    closeOnWindowBlur = type === 'tooltip', closeOnTriggerBlur = true, closeOnTriggerClick = false,
    disableHoverOpen = false, delayDuration = 200, delayOpen = false, openWhen = 'always', onBeforeOpen,
    closeOnPointerLeave = true, interactive = false, keyboardNavigation = false,
    manageTrigger = triggerButton != null || trigger != null, triggerClassName, className, style,
  } = options;
  const appearance = useCodexCuAppearance(), owner = useContext(OwnerContext), parentLayer = useContext(ParentLayerContext), id = useId();
  const ownAnchorRef = useRef(null), panelRef = useRef(null), scaledRef = useRef(null), ownMenuContentRef = useRef(null), menuTabStopRef = useRef(null), ownsSuppliedAnchorRef = useRef(false), focusedOnOpenRef = useRef(false), lastSurfaceRef = useRef(null);
  const present = useSourcePresence(open, scaledRef), renderedPresent = forceMount || present;
  const suppliedAnchor = externalAnchorRef ?? (typeof triggerRef === 'object' ? triggerRef : null);
  const anchorRef = suppliedAnchor ?? ownAnchorRef;
  const pointerPositionUpdateRef = useRef(null), tooltipPointerRef = useRef(null), menuGraceRef = useRef(null);
  const submenuTriggersRef = useRef(new Map());
  const [pointerRevision, setPointerRevision] = useState(0);
  pointerPositionUpdateRef.current = () => setPointerRevision(previous => previous + 1);
  if (!tooltipPointerRef.current) tooltipPointerRef.current = createCodexCuTooltipPointer({ referenceElementRef: anchorRef, updatePositionRef: pointerPositionUpdateRef });
  if (!menuGraceRef.current) menuGraceRef.current = createCodexCuMenuPointerGrace({ contentRef: ownMenuContentRef, onCurrentTabStopIdChange: value => { menuTabStopRef.current = value; } });
  const tooltipPointer = tooltipPointerRef.current, menuGrace = menuGraceRef.current;
  tooltipPointer.configure({ referenceElementRef: anchorRef, positioningElement, followPointer, interactive, variant: tooltipVariant,
    closeOnTriggerClick, disableHoverOpen, openOnClick, openOnFocusWithin, isHoverOpenBlocked });
  useLayoutEffect(() => { if (renderedPresent && type === 'tooltip') tooltipPointer.syncPositioningElement(); }, [renderedPresent, type, tooltipPointer, positioningElement, followPointer, interactive, tooltipVariant]);
  const [container, setContainer] = useState(() => typeof document === 'undefined' ? null : portalContainer ?? document.body);
  const [metrics, setMetrics] = useState({ width: 0, height: 0, anchor: null, viewportWidth: 0, viewportHeight: 0 });
  const callbackRef = useRef(options), closeReasonRef = useRef('controlled'), pointerEventRef = useRef(null), openIntentRef = useRef('pointer');
  const layerOpenChangeRef = useRef(null);
  const timersRef = useRef({ open: null, close: null, search: null, focus: null }), searchRef = useRef('');
  callbackRef.current = options;
  useLayoutEffect(() => { setContainer(portalContainer ?? anchorRef.current?.ownerDocument.body ?? (typeof document === 'undefined' ? null : document.body)); }, [portalContainer, anchorRef]);
  const preferredTooltipSide = preferTooltipCssSide && anchorRef.current ? getComputedStyle(anchorRef.current).getPropertyValue('--side-tooltip').trim() : null;
  const effectiveDir = dir ?? (anchorRef.current ? getComputedStyle(anchorRef.current).direction : undefined);
  const physicalAlign = effectiveDir === 'rtl' && align !== 'center' ? align === 'end' ? 'start' : 'end' : align;
  const requestedSide = side ?? (type === 'tooltip' ? preferredTooltipSide === 'bottom' ? 'bottom' : 'top' : 'bottom');
  const isSubmenu = submenuInput ?? (type === 'menu' && parentLayer?.type === 'menu' && ['left', 'right'].includes(requestedSide));
  const focusOutsideEnabled = dismissOnFocusOutside ?? (type === 'popover' || isSubmenu);
  const resolvedSideOffset = type === 'tooltip' ? tooltipPointer.getSideOffset(sideOffset) : sideOffset ?? (type === 'popover' ? 4 : 1);
  const requestedVerticalSide = requestedSide === 'bottom' ? 'bottom' : 'top';
  const nativePosition = usePosition({ open: renderedPresent, anchorRef, panelRef, side: requestedVerticalSide, align: physicalAlign === 'end' ? 'end' : 'start', gap: resolvedSideOffset, margin: typeof collisionPadding === 'number' ? collisionPadding : 0 });
  const documentObject = container?.ownerDocument ?? anchorRef.current?.ownerDocument ?? (typeof document === 'undefined' ? null : document);
  const record = useMemo(() => ({ id, parent: parentLayer, panelRef, anchorRef, document: documentObject, type, interactive, keyboardNavigation, grace: menuGrace, submenuTriggers: submenuTriggersRef.current, menuContentRef: ownMenuContentRef, isSubmenu, isOpen: () => callbackRef.current.open === true, changeOpen: (...args) => layerOpenChangeRef.current?.(...args) }), [id, parentLayer, anchorRef, documentObject, type, interactive, keyboardNavigation, menuGrace, isSubmenu]);
  const clearTimer = name => { const timer = timersRef.current[name]; if (timer != null) clearTimeout(timer); timersRef.current[name] = null; };
  const changeOpen = useCallback((next, reason = 'controlled', originalEvent) => {
    const callbacks = callbackRef.current;
    if (next && callbacks.onBeforeOpen?.() === false) return;
    closeReasonRef.current = reason;
    if (callbacks.onOpenChange) callbacks.onOpenChange(next, { reason, originalEvent });
    else if (!next) callbacks.onClose?.({ reason, originalEvent });
  }, []);
  layerOpenChangeRef.current = changeOpen;
  const closeOutside = useCallback(next => {
    if (next || !record.document || !isTopLayer(record)) return;
    const original = pointerEventRef.current;
    if (original && layerContains(record, original.target)) return;
    const event = outsideEvent('pointer-down-outside', original);
    callbackRef.current.onPointerDownOutside?.(event); callbackRef.current.onInteractOutside?.(event);
    if (!event.defaultPrevented) changeOpen(false, 'outside-pointer', original);
  }, [changeOpen, record]);
  useOutsidePointer(anchorRef, open && dismissOnOutsidePointer, closeOutside, panelRef);

  useLayoutEffect(() => {
    const panel = panelRef.current, anchor = anchorRef.current;
    if (!renderedPresent || !panel || !anchor) return;
    const view = panel.ownerDocument.defaultView;
    const measure = () => {
      const rect = anchor.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
      const next = { width: bounds.width, height: bounds.height, anchor: rect, viewportWidth: view.innerWidth, viewportHeight: view.innerHeight };
      setMetrics(previous => previous.width === next.width && previous.height === next.height && previous.viewportWidth === next.viewportWidth && previous.viewportHeight === next.viewportHeight && previous.anchor?.left === rect.left && previous.anchor?.top === rect.top && previous.anchor?.right === rect.right && previous.anchor?.bottom === rect.bottom ? previous : next);
    };
    measure(); view.addEventListener('resize', measure); view.addEventListener('scroll', measure, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure); observer?.observe(panel); observer?.observe(anchor);
    return () => { observer?.disconnect(); view.removeEventListener('resize', measure); view.removeEventListener('scroll', measure, true); };
  }, [renderedPresent, container, anchorRef]);
  const zoom = appearance.windowZoom ?? 1;
  const contentZoom = portalContainer == null ? zoom : 1;
  const floatingResult = useCodexCuSourceFloatingPosition({ renderedPresent, referenceElementRef: anchorRef, panelRef,
    type, side: requestedSide, align, sideOffset: resolvedSideOffset, alignOffset, collisionPadding, collisionBoundary,
    avoidCollisions, sticky, hideWhenDetached, updatePositionStrategy, tooltipVariant, flipAlignment, tooltipPointer,
    scaleAvailableSizeWithZoom, windowZoom: zoom, portalContainer, availableSizeCap,
    sourcePositionSignal: nativePosition, pointerRevision, onPositionError: options.onPositionError });
  const position = floatingResult?.floatingStyles;
  const resolvedSide = floatingResult?.side ?? requestedSide, resolvedAlign = floatingResult?.align ?? align;
  const availableHeight = floatingResult?.availableHeight;
  const maxHeightCap = availableHeight == null ? Infinity : Math.min(Math.max(0, availableHeight), Math.max(0, metrics.viewportHeight - 16), availableSizeCap ?? Infinity);
  // Host fitting stays subscribed through its public hook. Source size
  // middleware is authoritative, including flipped-side/virtual-anchor space.
  useMaxHeight(panelRef, maxHeightCap, floatingResult, typeof collisionPadding === 'number' ? collisionPadding : 0);
  const sourceHeight = availableSizeCap == null ? availableHeight : Math.min(availableHeight, availableSizeCap);
  const radixVariables = floatingResult ? {
    '--radix-dropdown-menu-trigger-width': `${floatingResult.referenceRect.width}px`,
    '--radix-dropdown-menu-content-available-width': `${floatingResult.availableWidth}px`,
    '--radix-dropdown-menu-content-available-height': `${sourceHeight}px`,
    '--radix-popover-trigger-width': `${floatingResult.referenceRect.width}px`,
    '--radix-popover-content-available-width': `${floatingResult.availableWidth}px`,
    '--radix-popover-content-available-height': `${sourceHeight}px`,
    '--radix-tooltip-trigger-width': `${Math.max(0, floatingResult.referenceRect.width)}px`,
    '--radix-tooltip-content-available-width': `${Math.max(0, floatingResult.availableWidth) / floatingResult.availableSizeScale}px`,
    '--radix-tooltip-content-available-height': `${Math.max(0, sourceHeight) / floatingResult.availableSizeScale}px`,
    '--radix-popover-content-transform-origin': floatingResult.transformOrigin,
  } : {};

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!renderedPresent || !panel || !record.document) return;
    const stack = layerStack(record.document); stack.push(record);
    const unregisterOwner = owner?.registerPortal(panel, { blocksEscape: () => blocksEscape(record) }), root = type === 'menu' ? menuRoot(panel) : panel;
    if (type === 'menu') ownMenuContentRef.current = root;
    const contentRefCleanup = assignRef(contentRef, root);
    if (root && root.getAttribute('tabindex') == null && type !== 'tooltip') root.tabIndex = -1;
    focusedOnOpenRef.current = false;
    return () => {
      const index = stack.indexOf(record); if (index >= 0) stack.splice(index, 1);
      unregisterOwner?.(); if (typeof contentRefCleanup === 'function') contentRefCleanup(); else assignRef(contentRef, null);
      if (type === 'menu') { ownMenuContentRef.current = null; clearTimeout(menuGrace.pointerGraceTimerRef.current); menuGrace.onPointerGraceIntentChange(null); }
      for (const name of Object.keys(timersRef.current)) clearTimer(name);
      searchRef.current = '';
      const close = outsideEvent('close-auto-focus'); callbackRef.current.onCloseAutoFocus?.(close);
      if (isSubmenu) {
        // Native gMe never restores submenu focus through FocusScope.
        // Its back-arrow path explicitly returns focus to the trigger.
        close.preventDefault();
        if (closeReasonRef.current === 'submenu-back') anchorRef.current?.focus({ preventScroll: true });
      }
      const shouldRestore = callbackRef.current.restoreFocus ?? type !== 'tooltip';
      if (shouldRestore && !close.defaultPrevented && !['outside-pointer', 'outside-focus', 'window-blur'].includes(closeReasonRef.current)) anchorRef.current?.focus({ preventScroll: true });
      closeReasonRef.current = 'controlled';
    };
  }, [renderedPresent, container, owner, record, type]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel || !position || !metrics.anchor || metrics.width <= 0 || focusedOnOpenRef.current) return;
    focusedOnOpenRef.current = true;
    const event = outsideEvent('open-auto-focus'); callbackRef.current.onOpenAutoFocus?.(event);
    if (autoFocus && !event.defaultPrevented) {
      const root = type === 'menu' ? menuRoot(panel) : panel;
      const intent = openIntent ?? openIntentRef.current;
      if (isSubmenu && intent === 'pointer') { event.preventDefault(); return; }
      const target = type === 'menu' ? intent === 'keyboard-last' ? menuItems(panel).at(-1) : intent === 'keyboard' ? menuItems(panel)[0] : root : sourceFocusable(panel)[0] ?? root;
      (target ?? root)?.focus({ preventScroll: true });
    }
  }, [open, position, metrics.anchor, metrics.width, autoFocus, type, openIntent, isSubmenu]);

  useLayoutEffect(() => {
    if (!open || !record.document) return;
    const capturePointer = event => { pointerEventRef.current = event; };
    const escape = event => {
      if (event.key !== 'Escape' || !isTopLayer(record) || event.defaultPrevented) return;
      callbackRef.current.onEscapeKeyDown?.(event);
      if (!event.defaultPrevented) {
        if (blocksEscape(record)) { event.preventDefault(); event.stopPropagation(); }
        if (type === 'tooltip' && interactive && keyboardNavigation && panelRef.current?.contains(event.target)) anchorRef.current?.focus({ preventScroll: true });
        if (isSubmenu) {
          let rootMenu = record;
          while (rootMenu.isSubmenu && rootMenu.parent?.type === 'menu') rootMenu = rootMenu.parent;
          rootMenu.changeOpen(false, 'escape', event);
        } else changeOpen(false, 'escape', event);
      }
    };
    const focusOutside = original => {
      if (!focusOutsideEnabled || !isSubmenu && !isTopLayer(record) || layerContains(record, original.target)) return;
      const event = outsideEvent('focus-outside', original);
      callbackRef.current.onFocusOutside?.(event); callbackRef.current.onInteractOutside?.(event);
      if (!event.defaultPrevented) changeOpen(false, 'outside-focus', original);
    };
    const blurWindow = original => { if (closeOnWindowBlur && isTopLayer(record)) changeOpen(false, 'window-blur', original); };
    record.document.addEventListener('pointerdown', capturePointer, true);
    record.document.addEventListener('keydown', escape);
    record.document.addEventListener('focusin', focusOutside);
    record.document.defaultView?.addEventListener('blur', blurWindow);
    return () => {
      record.document.removeEventListener('pointerdown', capturePointer, true);
      record.document.removeEventListener('keydown', escape);
      record.document.removeEventListener('focusin', focusOutside);
      record.document.defaultView?.removeEventListener('blur', blurWindow);
    };
  }, [open, record, focusOutsideEnabled, closeOnWindowBlur, changeOpen, type, interactive, keyboardNavigation, isSubmenu]);

  const hasSubmenuOpenRequest = typeof options.onSubmenuOpenRequest === 'function';
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!isSubmenu || !parentLayer?.grace || !anchor) return;
    const nativePointerGrace = hasSubmenuOpenRequest ? createCodexCuSubmenuPointerGrace({
      menuContext: parentLayer.grace, contentRef: ownMenuContentRef,
      getOpen: () => callbackRef.current.open === true,
      getDisabled: () => anchor.hasAttribute('data-disabled') || anchor.matches(':disabled,[aria-disabled="true"]'),
      onOpenChange: next => callbackRef.current.onSubmenuOpenRequest?.(next),
      timerHost: anchor.ownerDocument.defaultView,
    }) : null;
    const entry = { record, nativePointerGrace };
    parentLayer.submenuTriggers.set(anchor, entry);
    const leave = event => {
      if (event.relatedTarget && sourceContains(anchor, event.relatedTarget)) return;
      // Hji's owner callback (cancelHover) runs first in React's event chain.
      // The parent delegated item leave waits for this source submenu gate.
      queueMicrotask(() => {
        if (!parentLayer.submenuTriggers.has(anchor)) return;
        if (nativePointerGrace) nativePointerGrace.onPointerLeave(event);
        else applyCodexCuSubmenuPointerLeave(parentLayer.grace, event, ownMenuContentRef.current, { timerHost: anchor.ownerDocument.defaultView });
        applyCodexCuMenuItemPointerLeave(parentLayer.grace, event);
      });
    };
    anchor.addEventListener('pointerout', leave);
    return () => { anchor.removeEventListener('pointerout', leave); nativePointerGrace?.dispose(); if (parentLayer.submenuTriggers.get(anchor) === entry) parentLayer.submenuTriggers.delete(anchor); };
  }, [anchorRef, isSubmenu, parentLayer, record, hasSubmenuOpenRequest]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !manageTrigger) return;
    const requestTooltip = delay => {
      clearTimer('close');
      if (open || callbackRef.current.triggerPopupBlocksOpen || !sourceTooltipGate(anchor, callbackRef.current.openWhen ?? 'always')) return;
      if (timersRef.current.open != null) { if (delay !== 0) return; clearTimer('open'); }
      if (delay === 0) changeOpen(true, 'focus');
      else timersRef.current.open = setTimeout(() => { timersRef.current.open = null; if (sourceTooltipGate(anchor, callbackRef.current.openWhen ?? 'always')) changeOpen(true, 'hover'); }, delay);
    };
    const pointerEnter = event => {
      if (type !== 'tooltip') return;
      if (event.relatedTarget && sourceContains(anchor, event.relatedTarget)) return;
      if (tooltipPointer.pointerEnter(event)) { openIntentRef.current = 'pointer'; requestTooltip(delayOpen ? 250 : delayDuration); }
    };
    const pointerMove = event => {
      if (type === 'tooltip' && tooltipPointer.pointerMove(event)) { openIntentRef.current = 'pointer'; requestTooltip(delayOpen ? 250 : delayDuration); }
    };
    const pointerLeave = event => {
      if (type !== 'tooltip' || !closeOnPointerLeave || event.relatedTarget && (sourceContains(anchor, event.relatedTarget) || interactive && sourceContains(panelRef.current, event.relatedTarget))) return;
      clearTimer('open');
      const action = tooltipPointer.pointerLeave({ closeOnPointerLeave, interactive });
      if (action === 'close') changeOpen(false, 'pointer-leave', event);
      else if (action === 'handoff') { clearTimer('close'); timersRef.current.close = setTimeout(() => changeOpen(false, 'pointer-leave', event), 100); }
    };
    const focus = event => {
      if (type !== 'tooltip') return;
      queueMicrotask(() => {
        const action = tooltipPointer.focus(event, { focusElement: anchor });
        if (action === 'open') { openIntentRef.current = 'keyboard'; requestTooltip(0); }
        else if (action === 'close') { clearTimer('open'); changeOpen(false, 'trigger-focus', event); }
      });
    };
    const blur = event => {
      if (type !== 'tooltip' || !closeOnTriggerBlur || interactive && sourceContains(panelRef.current, event.relatedTarget)) return;
      clearTimer('open'); changeOpen(false, 'trigger-blur', event);
    };
    const click = event => {
      if (anchor.matches(':disabled,[aria-disabled="true"]')) return;
      if (type === 'tooltip') {
        const action = tooltipPointer.click(event);
        if (action === 'open') changeOpen(true, 'trigger-click', event);
        else if (action === 'close') { clearTimer('open'); changeOpen(false, 'trigger-click', event); }
        return;
      }
      if (event.defaultPrevented) return;
      if (event.button != null && event.button !== 0 || event.ctrlKey) return;
      openIntentRef.current = event.detail === 0 ? 'keyboard' : 'pointer';
      queueMicrotask(() => { if (!event.defaultPrevented) changeOpen(!open, 'trigger', event); });
    };
    const keydown = event => {
      if (event.defaultPrevented || anchor.matches(':disabled,[aria-disabled="true"]')) return;
      if (type === 'menu' && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); openIntentRef.current = event.key === 'ArrowUp' ? 'keyboard-last' : 'keyboard';
        if (!open) changeOpen(true, 'keyboard', event); else focusMenuItem(event.key === 'ArrowUp' ? menuItems(panelRef.current).at(-1) : menuItems(panelRef.current)[0]);
      } else if (type === 'tooltip' && event.key === 'Tab' && !event.shiftKey && open && interactive && keyboardNavigation) {
        const first = sourceFocusable(panelRef.current)[0]; if (first) { event.preventDefault(); first.focus({ preventScroll: true }); }
      }
    };
    const contextMenu = event => { if (type === 'tooltip') { clearTimer('open'); changeOpen(false, 'context-menu', event); } };
    anchor.addEventListener('pointerover', pointerEnter); anchor.addEventListener('pointerout', pointerLeave);
    anchor.addEventListener('pointermove', pointerMove);
    anchor.addEventListener('focusin', focus); anchor.addEventListener('focusout', blur);
    anchor.addEventListener('click', click); anchor.addEventListener('keydown', keydown); anchor.addEventListener('contextmenu', contextMenu);
    return () => {
      anchor.removeEventListener('pointerover', pointerEnter); anchor.removeEventListener('pointerout', pointerLeave);
      anchor.removeEventListener('pointermove', pointerMove);
      anchor.removeEventListener('focusin', focus); anchor.removeEventListener('focusout', blur);
      anchor.removeEventListener('click', click); anchor.removeEventListener('keydown', keydown); anchor.removeEventListener('contextmenu', contextMenu);
      clearTimer('open'); clearTimer('close');
    };
  }, [anchorRef, open, type, manageTrigger, disableHoverOpen, delayDuration, delayOpen, closeOnPointerLeave, closeOnTriggerBlur, closeOnTriggerClick, interactive, keyboardNavigation, changeOpen, triggerButton, trigger, tooltipPointer]);

  const handleMenuKeyboard = event => {
    if (event.defaultPrevented || !isTopLayer(record)) return;
    const panel = panelRef.current, root = menuRoot(panel), target = event.target.closest?.(menuItemSelector);
    if (event.target.matches?.('input,select,textarea,[contenteditable="true"]')) return;
    const items = menuItems(panel), index = items.indexOf(target);
    if (event.key === 'Tab') {
      const input = root?.querySelector('input');
      if (event.shiftKey && input && target === items[0]) { event.preventDefault(); input.focus({ preventScroll: true }); return; }
      event.preventDefault(); return;
    }
    if (event.key === 'ArrowUp' && target === items[0]) { const input = root?.querySelector('input'); if (input) { event.preventDefault(); input.focus({ preventScroll: true }); return; } }
    if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      event.preventDefault();
      let next = ['Home', 'PageUp'].includes(event.key) ? 0 : ['End', 'PageDown'].includes(event.key) ? items.length - 1 : event.key === 'ArrowUp' ? index < 0 ? items.length - 1 : index - 1 : index + 1;
      if (loop && items.length) next = (next + items.length) % items.length;
      if (next >= 0 && next < items.length) focusMenuItem(items[next]); return;
    }
    if (target && ['Enter', ' '].includes(event.key) && (event.key !== ' ' || searchRef.current === '')) { event.preventDefault(); target.click(); return; }
    if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.length === 1) {
      searchRef.current += event.key; clearTimer('search');
      timersRef.current.search = setTimeout(() => { searchRef.current = ''; timersRef.current.search = null; }, 1000);
      const match = sourceMenuTypeahead(items, searchRef.current, record.document.activeElement);
      if (match) { clearTimer('focus'); timersRef.current.focus = setTimeout(() => focusMenuItem(match)); }
    }
  };
  const handleKeyboard = event => {
    if (event.defaultPrevented || !isTopLayer(record)) return;
    if (type === 'menu') { handleMenuKeyboard(event); return; }
    if (event.key !== 'Tab') return;
    const nodes = sourceFocusable(panelRef.current), active = record.document.activeElement, first = nodes[0], last = nodes.at(-1);
    if (type === 'popover' && nodes.length) {
      if (event.shiftKey && (active === first || active === panelRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || active === panelRef.current)) { event.preventDefault(); first.focus(); }
    } else if (type === 'tooltip' && interactive && keyboardNavigation) {
      if (event.shiftKey && active === first) { event.preventDefault(); anchorRef.current?.focus({ preventScroll: true }); }
      else if (!event.shiftKey && active === last) {
        const candidates = sourceFocusable(record.document.body).filter(node => !panelRef.current?.contains(node));
        const next = candidates[candidates.indexOf(anchorRef.current) + 1];
        if (next) { event.preventDefault(); next.focus({ preventScroll: true }); if (closeOnTriggerBlur) changeOpen(false, 'outside-focus', event); }
      }
    }
  };
  const handleMenuSelection = event => {
    if (type !== 'menu' || event.defaultPrevented || !isTopLayer(record)) return;
    const item = event.target.closest?.(menuItemSelector);
    if (!item || item.hasAttribute('data-disabled') || item.hasAttribute('aria-haspopup')) return;
    changeOpen(false, 'selection', event);
  };
  const handleMenuPointerMove = event => {
    if (type !== 'menu' || event.pointerType !== 'mouse' || !panelRef.current?.contains(event.target)) return;
    const root = ownMenuContentRef.current, item = event.target.closest?.(menuItemSelector);
    if (item?.closest('[role="menu"]') === root) {
      const disabled = item.hasAttribute('data-disabled') || item.matches(':disabled');
      const submenu = record.submenuTriggers.get(item);
      if (submenu?.nativePointerGrace) submenu.nativePointerGrace.onPointerMove(event);
      else if (submenu && !event.defaultPrevented) {
        menuGrace.onItemEnter(event);
        if (!event.defaultPrevented && !disabled && !submenu.record.isOpen()) menuGrace.onPointerGraceIntentChange(null);
      }
      applyCodexCuMenuItemPointerMove(menuGrace, event, item, disabled);
    }
    menuGrace.onContentPointerMove(event);
  };
  const handleMenuPointerOut = event => {
    if (type !== 'menu' || event.pointerType !== 'mouse' || !panelRef.current?.contains(event.target)) return;
    const item = event.target.closest?.(menuItemSelector);
    if (!item || item.closest('[role="menu"]') !== ownMenuContentRef.current || event.relatedTarget && sourceContains(item, event.relatedTarget)) return;
    // The submenu trigger composes mMe before Zje in its deferred native leave.
    if (!record.submenuTriggers.has(item)) applyCodexCuMenuItemPointerLeave(menuGrace, event);
  };
  const highlight = event => {
    if (type !== 'menu') return;
    for (const item of menuItems(panelRef.current)) item.removeAttribute('data-highlighted');
    const item = event.target.closest?.(menuItemSelector); if (item && !item.hasAttribute('data-disabled')) item.setAttribute('data-highlighted', '');
  };
  const triggerElement = triggerButton ?? trigger;
  const attachAnchor = node => {
    const actual = node?.nodeType === 1 && node.classList?.contains('codex-cu-overlay-trigger') ? node.firstElementChild ?? node : node;
    ownAnchorRef.current = actual;
    if (suppliedAnchor && actual && (!suppliedAnchor.current || suppliedAnchor.current === actual)) { suppliedAnchor.current = actual; ownsSuppliedAnchorRef.current = true; }
    else if (suppliedAnchor && !actual && ownsSuppliedAnchorRef.current) { suppliedAnchor.current = null; ownsSuppliedAnchorRef.current = false; }
    if (triggerRef && typeof triggerRef !== 'object') assignRef(triggerRef, actual);
    if (React.isValidElement(triggerElement)) assignRef(sourceElementRef(triggerElement), actual);
  };
  const renderedTrigger = React.isValidElement(triggerElement) ? typeof triggerElement.type === 'string' || triggerElement.type?.$$typeof === Symbol.for('react.forward_ref')
    ? React.cloneElement(triggerElement, { ref: attachAnchor,
      ...(type === 'tooltip' ? { 'aria-describedby': open ? `${id}-content` : triggerElement.props['aria-describedby'] } : { 'aria-haspopup': type === 'menu' ? 'menu' : 'dialog', 'aria-expanded': open, 'aria-controls': open ? `${id}-content` : undefined, 'data-state': open ? 'open' : 'closed' }),
    }) : <span ref={attachAnchor} className={['codex-cu-overlay-trigger', triggerClassName].filter(Boolean).join(' ')}>{triggerElement}</span> : triggerElement;
  const suppliedSurface = content ?? children;
  if (open && suppliedSurface != null) lastSurfaceRef.current = suppliedSurface;
  const surface = suppliedSurface ?? (present ? lastSurfaceRef.current : null);
  const sourceSurface = React.isValidElement(surface) ? surface.type.codexCuSurface : undefined;
  const scopedSurface = React.isValidElement(surface) ? React.cloneElement(surface, {
    id: surface.props.id ?? `${id}-content`, 'data-overlay-owner': owner?.id, 'data-side': resolvedSide,
    'data-theme': appearance.theme, 'data-state': open ? 'open' : 'closed',
    ...(sourceSurface === 'menu' || sourceSurface === 'popover' ? { open, forceMount: true, state: open ? 'open' : 'closed', side: resolvedSide, align: resolvedAlign } : {}),
    ...(sourceSurface === 'popover' ? { zoom, portalScaled: true } : {}),
    style: { ...surface.props.style },
  }) : surface;
  const portal = renderedPresent && container && surface ? createPortal(<ParentLayerContext.Provider value={record}>
    <CodexCuScope forceScope ref={panelRef} className={['codex-cu-overlay-positioner', className].filter(Boolean).join(' ')}
      data-codex-cu-overlay={type} data-codex-cu-overlay-kind={kind} data-overlay-owner={owner?.id}
      data-side={resolvedSide} data-align={resolvedAlign} data-state={open ? 'open' : 'closed'} dir={effectiveDir} tabIndex={type === 'tooltip' ? undefined : -1}
      style={{ position: type === 'tooltip' ? 'absolute' : 'fixed', left: 0, top: 0,
        ...radixVariables, ...position, visibility: position && metrics.anchor && metrics.width > 0 ? undefined : 'hidden', ...style }}
      onKeyDown={handleKeyboard} onClick={handleMenuSelection} onFocusCapture={highlight}
      onBlur={event => { if (type === 'tooltip' && interactive && closeOnTriggerBlur && !sourceContains(panelRef.current, event.relatedTarget) && !sourceContains(anchorRef.current, event.relatedTarget)) changeOpen(false, 'outside-focus', event); }}
      onPointerMove={handleMenuPointerMove} onPointerOut={handleMenuPointerOut}
      onPointerEnter={() => { if (interactive) clearTimer('close'); }}
      onPointerLeave={event => { if (type === 'tooltip' && interactive && closeOnPointerLeave && !sourceContains(anchorRef.current, event.relatedTarget)) { clearTimer('close'); timersRef.current.close = setTimeout(() => changeOpen(false, 'pointer-leave', event), 100); } }}>
      <div ref={scaledRef} className="codex-cu-overlay-scale" style={{ zoom: contentZoom !== 1 ? contentZoom : undefined }}>{scopedSurface}</div>
    </CodexCuScope>
  </ParentLayerContext.Provider>, container) : null;
  return <>{renderedTrigger}{portal}</>;
}
