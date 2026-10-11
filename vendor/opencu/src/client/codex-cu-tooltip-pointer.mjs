// BO/w5 -> aSi -> oSi in app-shared-2f2228189a8d.js.
// Exact source ranges and integration constraints are recorded in
// work/rea-reconstruction/primitives/tooltip-pointer/source-evidence.json.
// This module supplies a Floating UI virtual reference, not an HTMLElement
// reference for the public DSH useAnchoredPosition hook.

export const CODEX_CU_TOOLTIP_EMPTY_RECT = {
  bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0,
  toJSON() { return {}; },
};

// The packed desktop source folds the desktop platform test to true. There
// are no axis/options variants in this BO implementation.
export function isCodexCuTooltipPointerEnabled({
  followPointer = false, selectable = false, interactive = selectable, variant = 'tooltip',
} = {}) {
  return (followPointer === true || followPointer === 'desktop') && !interactive && variant === 'tooltip';
}

// Pass the public `open` input here, rather than the resolved local open
// state. aSi's ordinary local-tooltip default depends on controlledness.
export function resolveCodexCuTooltipPointerPolicy({
  followPointer = false, selectable = false, interactive = selectable,
  variant = 'tooltip', open, closeOnTriggerClick, triggerPopupOpen = false,
} = {}) {
  const localOrdinaryTooltip = variant === 'tooltip' && !interactive && open === undefined;
  const closeOnClick = closeOnTriggerClick ?? localOrdinaryTooltip;
  return {
    interactive,
    followPointer: isCodexCuTooltipPointerEnabled({ followPointer, interactive, variant }),
    closeOnTriggerClick: closeOnClick,
    triggerPopupBlocksOpen: triggerPopupOpen && localOrdinaryTooltip && closeOnClick,
  };
}

function containsSourceTarget(element, target) {
  const NodeClass = element?.ownerDocument.defaultView?.Node ?? globalThis.Node;
  return typeof NodeClass === 'function' && target instanceof NodeClass && element?.contains(target) === true;
}

function isSourceFocusVisible(element) {
  try { return element?.matches(':focus-visible') === true; } catch { return false; }
}

/**
 * Restore aSi's pointer-anchor state and oSi's virtual-reference protocol.
 * Events return opening/closing policy; the caller retains the source tooltip
 * delay, provider handoff and controlled-open state.
 *
 * configure() updates event inputs without resetting coordinates.
 * syncPositioningElement() is oSi's mounted layout-effect step: commit the
 * positioning element and clear coordinates when followPointer is disabled.
 * sync() combines those two steps for a mounted positioner.
 *
 * pointerEnter()/pointerMove() return whether Ue accepted the hover event.
 * focus()/click()/pointerLeave() return 'open', 'close', 'handoff' or null.
 * There is intentionally no controlled-open or scroll reset.
 */
export function createCodexCuTooltipPointer(initialOptions = {}) {
  let options = {
    referenceElementRef: { current: null }, positioningElement: null,
    followPointer: false, selectable: false, variant: 'tooltip',
    ...initialOptions,
  };
  const pointerAnchorRef = initialOptions.pointerAnchorRef ?? { current: null };
  let positioningElement = options.positioningElement;
  let closedByTriggerClick = false;
  const enabled = () => isCodexCuTooltipPointerEnabled(options);
  const referenceElement = () => options.referenceElementRef?.current ?? null;
  const sourcePolicy = () => resolveCodexCuTooltipPointerPolicy(options);
  const updatePosition = () => options.updatePositionRef?.current?.();
  const clearPointer = (notify = true) => {
    if (pointerAnchorRef.current == null) return false;
    pointerAnchorRef.current = null;
    if (notify) updatePosition();
    return true;
  };
  const virtualReference = {
    get contextElement() { return positioningElement ?? referenceElement() ?? undefined; },
    getBoundingClientRect() {
      return pointerAnchorRef.current
        ?? positioningElement?.getBoundingClientRect()
        ?? referenceElement()?.getBoundingClientRect()
        ?? CODEX_CU_TOOLTIP_EMPTY_RECT;
    },
  };

  const hover = (event, policy = {}) => {
    const disableHoverOpen = policy.disableHoverOpen ?? options.disableHoverOpen ?? false;
    const closeOnTriggerClick = policy.closeOnTriggerClick ?? sourcePolicy().closeOnTriggerClick;
    const clickSuppressed = policy.closedByTriggerClick ?? closedByTriggerClick;
    if (disableHoverOpen || !containsSourceTarget(referenceElement(), event.target)
      || closeOnTriggerClick && clickSuppressed || event.pointerType === 'touch') return false;
    const hoverOpenBlocked = policy.isHoverOpenBlocked ?? options.isHoverOpenBlocked;
    if ((typeof hoverOpenBlocked === 'function' ? hoverOpenBlocked() : hoverOpenBlocked) === true) return false;
    // Ue does not inspect defaultPrevented. Mouse coordinates are viewport
    // clientX/clientY, and the virtual rectangle has zero width/height.
    if (enabled()) {
      if (event.pointerType === 'mouse') {
        pointerAnchorRef.current = options.createPointerRect
          ? options.createPointerRect(event.clientX, event.clientY)
          : new DOMRect(event.clientX, event.clientY);
        updatePosition();
      } else clearPointer();
    }
    return true;
  };

  return {
    pointerAnchorRef, virtualReference,
    get enabled() { return enabled(); },
    get hasPointerAnchor() { return enabled() && pointerAnchorRef.current != null; },
    get closedByTriggerClick() { return closedByTriggerClick; },
    setClosedByTriggerClick(value) { closedByTriggerClick = value; },
    configure(nextOptions) { options = { ...options, ...nextOptions }; },
    syncPositioningElement() {
      positioningElement = options.positioningElement;
      // oSi's useLayoutEffect writes x.current=null without calling update.
      if (!enabled()) pointerAnchorRef.current = null;
    },
    sync(nextOptions) {
      options = { ...options, ...nextOptions };
      positioningElement = options.positioningElement;
      if (!enabled()) pointerAnchorRef.current = null;
    },
    getFloatingReference() {
      return enabled() ? virtualReference : options.positioningElement ?? virtualReference;
    },
    getBoundingClientRect() { return virtualReference.getBoundingClientRect(); },
    getSideOffset(sideOffset) {
      return sideOffset ?? (enabled() && pointerAnchorRef.current != null ? 12 : 2);
    },
    getOffset({ sideOffset, alignOffset, scale = 1 } = {}) {
      return {
        mainAxis: (sideOffset ?? (enabled() && pointerAnchorRef.current != null ? 12 : 2)) * scale,
        crossAxis: (alignOffset ?? 0) * scale,
      };
    },
    pointerEnter(event, policy) {
      // onPointerEnter clears Oe before Ue, including before Ue rejects touch.
      if (containsSourceTarget(referenceElement(), event.target)) closedByTriggerClick = false;
      return hover(event, policy);
    },
    pointerMove: hover,
    click(event, policy = {}) {
      const openOnClick = policy.openOnClick ?? options.openOnClick ?? false;
      const closeOnTriggerClick = policy.closeOnTriggerClick ?? sourcePolicy().closeOnTriggerClick;
      if (openOnClick && !event.defaultPrevented) return 'open';
      // The source close branch also runs when defaultPrevented is true.
      if (closeOnTriggerClick && containsSourceTarget(referenceElement(), event.target)) {
        closedByTriggerClick = true;
        return 'close';
      }
      return null;
    },
    focus(event, policy = {}) {
      const closeOnTriggerClick = policy.closeOnTriggerClick ?? sourcePolicy().closeOnTriggerClick;
      const openOnFocusWithin = policy.openOnFocusWithin ?? options.openOnFocusWithin ?? false;
      let target = 'focusElement' in policy ? policy.focusElement
        : 'nativeEvent' in event ? event.currentTarget : options.triggerElement ?? null;
      if (closeOnTriggerClick) target = referenceElement();
      // aSi uses the global HTMLElement constructor in this specific branch.
      if (openOnFocusWithin && typeof globalThis.HTMLElement === 'function' && event.target instanceof globalThis.HTMLElement) target = event.target;
      if (closeOnTriggerClick && event.defaultPrevented) {
        closedByTriggerClick = true;
        return 'close';
      }
      if (!event.defaultPrevented && (!closeOnTriggerClick || containsSourceTarget(referenceElement(), event.target)) && isSourceFocusVisible(target)) {
        closedByTriggerClick = false;
        clearPointer();
        return 'open';
      }
      return null;
    },
    pointerLeave(policy = {}) {
      const closeOnPointerLeave = policy.closeOnPointerLeave ?? options.closeOnPointerLeave ?? true;
      const interactive = policy.interactive ?? sourcePolicy().interactive;
      if (!closeOnPointerLeave) return null;
      if (interactive) return 'handoff';
      clearPointer();
      return 'close';
    },
    clearPointer,
  };
}
