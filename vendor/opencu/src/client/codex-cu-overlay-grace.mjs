// Codex's original Radix Menu pointer-grace algorithm and event gates.
// Exact source ranges/SHA: work/rea-reconstruction/primitives/grace/source-index.json.
// This module owns no React state, positioning, visuals or Hji hover200 timer.

/** Original wje/isPointInPolygon, including its edge comparison semantics. */
export function isCodexCuPointInPolygon(point, polygon) {
  const { x, y } = point;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index], previousPoint = polygon[previous];
    const currentX = currentPoint.x, currentY = currentPoint.y;
    const previousX = previousPoint.x, previousY = previousPoint.y;
    if ((currentY > y) !== (previousY > y) && x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX) inside = !inside;
  }
  return inside;
}

/** Original Tje/isPointerInGraceArea: absent area always returns false. */
export function isCodexCuPointerInGraceArea(event, area) {
  return area ? isCodexCuPointInPolygon({ x: event.clientX, y: event.clientY }, area) : false;
}

/** Original _y/whenMouse. Touch and pen never enter source pointer gates. */
export function whenCodexCuMouse(handler) {
  return event => event.pointerType === 'mouse' ? handler(event) : undefined;
}

/** Original mMe leave polygon: one exit point and all four submenu corners.
 * `side` must be the actual content.dataset.side, not the preferred direction.
 * Coordinates are physical client coordinates; do not divide by Scope zoom. */
export function getCodexCuSubmenuGraceIntent(event, content) {
  const bounds = content?.getBoundingClientRect();
  if (!bounds) return null;
  const side = content?.dataset.side, opensRight = side === 'right';
  const exitOffset = opensRight ? -5 : 5;
  const nearX = bounds[opensRight ? 'left' : 'right'];
  const farX = bounds[opensRight ? 'right' : 'left'];
  return {
    area: [
      { x: event.clientX + exitOffset, y: event.clientY },
      { x: nearX, y: bounds.top },
      { x: farX, y: bounds.top },
      { x: farX, y: bounds.bottom },
      { x: nearX, y: bounds.bottom },
    ],
    side,
  };
}

/** One instance per MenuContentImpl, shared with that menu's submenu triggers.
 * Ref objects must be stable across renders. `contentRef` points to the actual
 * parent menu root; `onCurrentTabStopIdChange(null)` retains source S(null).
 * The owner composes its handlers first and skips these when defaultPrevented.
 * Do not update pointer direction before the item's gates: source jy does so
 * only after Zje/mMe bubble their own pointermove handlers. */
export function createCodexCuMenuPointerGrace({
  contentRef,
  onCurrentTabStopIdChange,
  pointerGraceTimerRef = { current: 0 },
  pointerGraceIntentRef = { current: null },
  pointerDirectionRef = { current: 'right' },
  lastPointerXRef = { current: 0 },
}) {
  if (!contentRef || typeof onCurrentTabStopIdChange !== 'function') {
    throw new TypeError('Menu pointer grace requires contentRef and onCurrentTabStopIdChange');
  }
  const isMovingToSubmenu = event => pointerDirectionRef.current === pointerGraceIntentRef.current?.side &&
    isCodexCuPointerInGraceArea(event, pointerGraceIntentRef.current?.area);
  const onItemEnter = event => { if (isMovingToSubmenu(event)) event.preventDefault(); };
  const onItemLeave = event => {
    if (!isMovingToSubmenu(event)) {
      contentRef.current?.focus();
      onCurrentTabStopIdChange(null);
    }
  };
  const onTriggerLeave = event => { if (isMovingToSubmenu(event)) event.preventDefault(); };
  const onPointerGraceIntentChange = intent => { pointerGraceIntentRef.current = intent; };
  const trackPointerDirection = whenCodexCuMouse(event => {
    if (event.currentTarget.contains(event.target) && lastPointerXRef.current !== event.clientX) {
      pointerDirectionRef.current = event.clientX > lastPointerXRef.current ? 'right' : 'left';
      lastPointerXRef.current = event.clientX;
    }
  });
  const onContentPointerMove = event => {
    if (!event.defaultPrevented) return trackPointerDirection(event);
  };
  return {
    contentRef, pointerGraceTimerRef, pointerGraceIntentRef, pointerDirectionRef, lastPointerXRef,
    isMovingToSubmenu, onItemEnter, onItemLeave, onTriggerLeave,
    onPointerGraceIntentChange, onContentPointerMove,
  };
}

/** Zje/MenuItemImpl gates. `item` is explicit for an overlay's delegated
 * pointermove; direct item handlers may omit it. Disabled items call leave.
 * An item's own callback runs before this function, as original $g requires. */
export function applyCodexCuMenuItemPointerMove(context, event, item = event.currentTarget, disabled = false) {
  if (event.defaultPrevented || event.pointerType !== 'mouse') return;
  if (disabled) context.onItemLeave(event);
  else {
    context.onItemEnter(event);
    if (!event.defaultPrevented) item.focus({ preventScroll: true });
  }
}

export function applyCodexCuMenuItemPointerLeave(context, event) {
  if (!event.defaultPrevented && event.pointerType === 'mouse') context.onItemLeave(event);
}

/** mMe/MenuSubTrigger grace leave gate. This is usable with Hji's existing
 * hover200 owner without creating a second outer hover timer. The caller
 * cancels its Hji timer before calling this; this function clears only the
 * native mMe timer if supplied. A missing content rect takes onTriggerLeave's
 * preventDefault gate before clearing the current grace intent. */
export function applyCodexCuSubmenuPointerLeave(context, event, content, {
  clearOpenTimer,
  timerHost = globalThis,
} = {}) {
  if (event.defaultPrevented || event.pointerType !== 'mouse') return;
  clearOpenTimer?.();
  const intent = getCodexCuSubmenuGraceIntent(event, content);
  if (intent) {
    context.onPointerGraceIntentChange(intent);
    timerHost.clearTimeout(context.pointerGraceTimerRef.current);
    context.pointerGraceTimerRef.current = timerHost.setTimeout(() => context.onPointerGraceIntentChange(null), 300);
  } else {
    context.onTriggerLeave(event);
    if (event.defaultPrevented) return;
    context.onPointerGraceIntentChange(null);
  }
}

/** Complete native mMe pointer handlers. Its 100ms timer REQUESTS OPEN; it
 * never requests close. For Hji callers, onOpenChange must retain Hji Ee/De's
 * rejection while the outer 200ms hover timer is pending. Wiring this directly
 * to an unconditional setOpen would change source hover200 to hover100.
 * These handlers precede Zje item gates. Direction updates come last at jy.
 * The returned dispose captures the grace timer present at creation, matching
 * mMe's original effect cleanup; it also cancels the current native open timer. */
export function createCodexCuSubmenuPointerGrace({
  menuContext,
  contentRef,
  getOpen,
  getDisabled,
  onOpenChange,
  openTimerRef = { current: null },
  timerHost = globalThis,
}) {
  if (!menuContext || !contentRef || typeof getOpen !== 'function' || typeof getDisabled !== 'function' || typeof onOpenChange !== 'function') {
    throw new TypeError('Submenu pointer grace requires menuContext, contentRef, state getters and onOpenChange');
  }
  const clearOpenTimer = () => {
    if (openTimerRef.current) timerHost.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  };
  const mountedGraceTimer = menuContext.pointerGraceTimerRef.current;
  const onPointerMove = event => {
    if (event.defaultPrevented || event.pointerType !== 'mouse') return;
    menuContext.onItemEnter(event);
    if (!event.defaultPrevented && !getDisabled() && !getOpen() && !openTimerRef.current) {
      menuContext.onPointerGraceIntentChange(null);
      openTimerRef.current = timerHost.setTimeout(() => { onOpenChange(true); clearOpenTimer(); }, 100);
    }
  };
  const onPointerLeave = event => applyCodexCuSubmenuPointerLeave(menuContext, event, contentRef.current, { clearOpenTimer, timerHost });
  const dispose = () => {
    clearOpenTimer();
    timerHost.clearTimeout(mountedGraceTimer);
    menuContext.onPointerGraceIntentChange(null);
  };
  return { openTimerRef, clearOpenTimer, onPointerMove, onPointerLeave, dispose };
}
