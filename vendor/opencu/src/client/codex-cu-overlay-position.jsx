import { useLayoutEffect, useRef, useState } from 'react';
import { computeCodexCuFloatingPosition, sourceAutoUpdate } from './codex-cu-overlay-flip.mjs';

// Own the lifecycle around the verbatim source compute/DOM platform. DSH's
// public position hook remains an update signal, never a geometry fallback.
export function useCodexCuSourceFloatingPosition({
  renderedPresent, referenceElementRef, panelRef, type, side, align,
  sideOffset, alignOffset, collisionPadding, collisionBoundary, avoidCollisions,
  sticky, hideWhenDetached, updatePositionStrategy, tooltipVariant,
  flipAlignment, tooltipPointer, scaleAvailableSizeWithZoom, windowZoom,
  portalContainer, availableSizeCap, sourcePositionSignal, pointerRevision,
  onPositionError,
}) {
  const [result, setResult] = useState(null), requestRef = useRef(0), errorRef = useRef(onPositionError);
  errorRef.current = onPositionError;
  useLayoutEffect(() => {
    const floating = panelRef.current;
    const reference = type === 'tooltip' ? tooltipPointer.getFloatingReference() : referenceElementRef.current;
    if (!renderedPresent || !floating || !reference) { setResult(null); return; }
    let live = true;
    const portalZoom = portalContainer == null && windowZoom !== 1 ? windowZoom : 1;
    const offsetScale = type === 'tooltip' && tooltipVariant === 'coachmark' ? portalZoom : 1;
    const availableSizeScale = type === 'tooltip' && (scaleAvailableSizeWithZoom || tooltipVariant === 'rich') ? portalZoom : offsetScale;
    const setVariable = (name, value) => floating.style.setProperty(name, `${value}px`);
    const applySize = state => {
      const { availableWidth, availableHeight, rects } = state;
      const height = availableSizeCap == null ? availableHeight : Math.min(availableHeight, availableSizeCap);
      if (type === 'menu') {
        // Native DropdownMenu maps these aliases to the Popper physical vars.
        setVariable('--radix-dropdown-menu-trigger-width', rects.reference.width);
        setVariable('--radix-dropdown-menu-content-available-width', availableWidth);
        setVariable('--radix-dropdown-menu-content-available-height', height);
      } else if (type === 'popover') {
        setVariable('--radix-popover-trigger-width', rects.reference.width);
        setVariable('--radix-popover-content-available-width', availableWidth);
        setVariable('--radix-popover-content-available-height', height);
      } else if (availableSizeCap != null) {
        setVariable('--radix-tooltip-content-available-height', Math.max(0, height) / availableSizeScale);
      }
    };
    const update = () => {
      const request = ++requestRef.current;
      void computeCodexCuFloatingPosition({ reference, floating, type, side, align,
        sideOffset, alignOffset, collisionPadding, collisionBoundary, avoidCollisions,
        sticky, hideWhenDetached, tooltipVariant, flipAlignment, offsetScale,
        availableSizeScale, sizeApply: applySize,
      }).then(next => {
        if (!live || request !== requestRef.current) return;
        setResult({ ...next, portalZoom, offsetScale, availableSizeScale });
      }).catch(error => {
        if (!live || request !== requestRef.current) return;
        if (errorRef.current) errorRef.current(error);
        else void Promise.reject(error); // Source has no invented position fallback.
      });
    };
    const cleanup = sourceAutoUpdate(reference, floating, update, { animationFrame: updatePositionStrategy === 'always' });
    return () => { live = false; requestRef.current++; cleanup(); };
  }, [renderedPresent, referenceElementRef, panelRef, type, side, align, sideOffset, alignOffset,
    collisionPadding, collisionBoundary, avoidCollisions, sticky, hideWhenDetached,
    updatePositionStrategy, tooltipVariant, flipAlignment, tooltipPointer,
    scaleAvailableSizeWithZoom, windowZoom, portalContainer, availableSizeCap,
    sourcePositionSignal, pointerRevision]);
  return result;
}
