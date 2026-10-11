import React, { useEffect, useRef } from 'react';
import numberCss from './codex-annotation-number.css';

// Codex 26.1007.21159 / 20052: Bn → Vn/Hn → Kn. Complete bindings,
// utility selectors and source spans: results-annotation/number/manifest.json.
export const codexAnnotationNumberStyles = numberCss;
const join = (...values) => values.filter(Boolean).join(' ');
export const codexAnnotationNumberUtilities = (...values) => values.flat(Infinity).filter(Boolean)
  .join(' ').split(/\s+/).filter(Boolean).map(value => `can-${value}`).join(' ');
const p = codexAnnotationNumberUtilities;
const shell = 'min-w-0 rounded-lg border border-primary-outline bg-primary-soft text-default shadow-sm outline-none transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring';
const input = 'min-w-0 appearance-none border-0 bg-transparent font-mono text-default outline-none ring-0 placeholder:text-tertiary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0';
const numericInput = '_numericInput_1hft5_1';

export const codexAnnotationNumberClassNames = Object.freeze({
  shell: p(shell), input: p(input), numericInput: p(numericInput),
  compactInput: p('min-h-7 w-full px-1 text-center text-xs'),
  tertiary: p('text-tertiary'), divider: p('border-l border-subtle'),
});

// Tr/xr/Sr/wr/Mr/Er/Dr/Ar/kr retain the original parsing and clamp semantics.
const parsePixelValue = value => value.trim().match(/^(-?\d+(?:\.\d+)?)px$/)?.[1] ?? null;
const parsePixelNumber = value => { const number = parsePixelValue(value); return number == null ? null : Number(number); };
const isGapProperty = property => property === 'column-gap' || property === 'gap' || property === 'row-gap';
const normalGapValue = (property, value) => isGapProperty(property) && value.trim() === 'normal' ? '0' : null;
const parseNumericValue = value => { if (value.trim().length === 0) return 0; const number = Number(value); return Number.isFinite(number) ? number : null; };
const numericScrubValue = (value, placeholder) => value.trim().length === 0 && placeholder != null ? parseNumericValue(placeholder) : parseNumericValue(value);
const formatNumericValue = value => String(Number.isInteger(value) ? value : Number(value.toFixed(2)));
const clampNumericValue = (value, min, max) => min != null && value < min ? min : max != null && value > max ? max : value;
const isLengthProperty = property => property === 'font-size' || property === 'border-radius' || property === 'border-width'
  || isGapProperty(property) || property === 'height' || property === 'width'
  || property.startsWith('margin-') || property.startsWith('padding-');
const isLengthDeclaration = declaration => isLengthProperty(declaration.property)
  && (declaration.value.length === 0 || parsePixelValue(declaration.placeholderValue ?? '') != null
    || parsePixelValue(declaration.value) != null || normalGapValue(declaration.property, declaration.value) != null
    || normalGapValue(declaration.property, declaration.placeholderValue ?? '') != null);

export const codexAnnotationNumberHelpers = Object.freeze({
  parsePixelValue, parsePixelNumber, normalGapValue, parseNumericValue, numericScrubValue,
  formatNumericValue, clampNumericValue, isLengthProperty, isLengthDeclaration,
});

// Wr, Gr=4, Kr=Gr. Source ke percent-encodes the authored SVG.
const scrubSvg = "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none'><path d='M8 1 11 4H9v4H7V4H5l3-3Z' fill='#475569'/><path d='M8 15 5 12h2V8h2v4h2l-3 3Z' fill='#475569'/></svg>";
const scrubCursor = `url("data:image/svg+xml;utf8,${encodeURIComponent(scrubSvg)}") 8 8, ns-resize`;
const scrubPixelsPerStep = 4;
const scrubThreshold = scrubPixelsPerStep;

export const CodexAnnotationNumberControl = React.forwardRef(function CodexAnnotationNumberControl({
  ariaLabel, className, formatScrubValue, inputMode, max, min, property, scrubMax,
  scrubMin, scrubStep, scrubValue, step, title, type, placeholder, value = '',
  onScrubActiveChange, onValueChange, disabled = false, readOnly = false,
  styleEnabled = false, onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
  onLostPointerCapture, onClick, onWheel, ...inputProps
}, forwardedRef) {
  const inputRef = useRef(null);
  const scrub = useRef(null);
  const suppressClick = useRef(false);
  const callbacks = useRef({ onScrubActiveChange });
  callbacks.current = { onScrubActiveChange };
  const editable = !disabled && !readOnly && typeof onValueChange === 'function';

  function finishScrub(element) {
    const state = scrub.current;
    if (state == null) return;
    const target = element ?? state.target;
    if (target != null) {
      const body = target.ownerDocument.body.style;
      const document = target.ownerDocument.documentElement.style;
      body.cursor = state.previousBodyCursor;
      body.overscrollBehavior = state.previousBodyOverscrollBehavior;
      body.userSelect = state.previousBodyUserSelect;
      document.overscrollBehavior = state.previousDocumentOverscrollBehavior;
      target.style.cursor = state.previousTargetCursor;
      delete target.dataset.scrubbing;
    }
    if (state.scrollContainer != null) {
      state.scrollContainer.style.overflowY = state.previousScrollContainerOverflowY;
      state.scrollContainer.style.overscrollBehavior = state.previousScrollContainerOverscrollBehavior;
    }
    // Clear before releasing capture so lostpointercapture cannot finish twice.
    scrub.current = null;
    if (state.hasScrubbed) {
      suppressClick.current = true;
      callbacks.current.onScrubActiveChange?.(null, target);
    }
    if (target?.hasPointerCapture?.(state.pointerId) === true) target.releasePointerCapture(state.pointerId);
  }

  // The controlled frontend also restores the source cursor/scroll transaction
  // when its owner disables or unmounts the field during an active scrub.
  useEffect(() => () => finishScrub(inputRef.current), []);
  useEffect(() => { if (!editable) finishScrub(inputRef.current); }, [editable]);

  function startScrub(event) {
    onPointerDown?.(event);
    if (event.defaultPrevented || !editable || type !== 'number' || scrubStep == null || scrubValue == null
      || !Number.isFinite(scrubValue) || event.button !== 0 || !event.isPrimary || event.pointerType === 'touch') return;
    const target = event.currentTarget;
    const { body, documentElement } = target.ownerDocument;
    const bodyStyle = body.style;
    const documentStyle = documentElement.style;
    const scrollContainer = target.closest('[data-browser-sidebar-design-scroll-container]');
    const state = {
      target, hasScrubbed: false, lastValue: scrubValue, pointerId: event.pointerId,
      previousBodyCursor: bodyStyle.cursor, previousBodyOverscrollBehavior: bodyStyle.overscrollBehavior,
      previousBodyUserSelect: bodyStyle.userSelect, previousDocumentOverscrollBehavior: documentStyle.overscrollBehavior,
      previousScrollContainerOverflowY: scrollContainer?.style.overflowY ?? '',
      previousScrollContainerOverscrollBehavior: scrollContainer?.style.overscrollBehavior ?? '',
      previousTargetCursor: target.style.cursor, scrollContainer,
      startClientY: event.clientY, startValue: scrubValue,
    };
    event.preventDefault();
    target.focus();
    target.setPointerCapture?.(event.pointerId);
    target.dataset.scrubbing = 'true';
    target.style.cursor = scrubCursor;
    bodyStyle.cursor = scrubCursor;
    bodyStyle.overscrollBehavior = 'none';
    documentStyle.overscrollBehavior = 'none';
    if (scrollContainer != null) {
      scrollContainer.style.overflowY = 'hidden';
      scrollContainer.style.overscrollBehavior = 'none';
    }
    scrub.current = state;
  }

  function moveScrub(event) {
    onPointerMove?.(event);
    const state = scrub.current;
    if (!editable || state == null || state.pointerId !== event.pointerId || scrubStep == null || formatScrubValue == null) return;
    const delta = state.startClientY - event.clientY;
    event.preventDefault();
    if (!state.hasScrubbed && Math.abs(delta) < scrubThreshold) return;
    if (!state.hasScrubbed) {
      const body = event.currentTarget.ownerDocument.body.style;
      body.cursor = scrubCursor;
      body.userSelect = 'none';
      state.hasScrubbed = true;
      onScrubActiveChange?.(property, event.currentTarget);
    }
    const steps = Math.trunc(delta / scrubPixelsPerStep);
    const nextValue = clampNumericValue(state.startValue + steps * scrubStep, scrubMin, scrubMax);
    if (nextValue === state.lastValue) return;
    state.lastValue = nextValue;
    onValueChange(formatScrubValue(nextValue));
  }

  function endScrub(event, callback) {
    callback?.(event);
    const state = scrub.current;
    if (state == null || state.pointerId !== event.pointerId) return;
    if (state.hasScrubbed) event.preventDefault();
    finishScrub(event.currentTarget);
  }

  const setInputRef = element => {
    inputRef.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef != null) forwardedRef.current = element;
  };
  return <>{styleEnabled && <style data-codex-annotation-number-styles>{numberCss}</style>}<input
    {...inputProps} ref={setInputRef} aria-label={ariaLabel ?? inputProps['aria-label']}
    className={join('codex-annotation-number', className, p('touch-none cursor-text', editable && 'hover:cursor-ns-resize active:cursor-ns-resize'))}
    dir="ltr" inputMode={inputMode} max={max} min={min} step={step} title={title}
    type={type} placeholder={placeholder} value={value} disabled={disabled} readOnly={!editable}
    onChange={event => { if (editable) onValueChange(event.target.value); }}
    onClick={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); } onClick?.(event); }}
    onLostPointerCapture={event => { onLostPointerCapture?.(event); finishScrub(event.currentTarget); }}
    onPointerCancel={event => endScrub(event, onPointerCancel)} onPointerDown={startScrub}
    onPointerMove={moveScrub} onPointerUp={event => endScrub(event, onPointerUp)}
    onWheel={event => { if (type === 'number' && event.currentTarget.ownerDocument.activeElement === event.currentTarget) event.currentTarget.blur(); onWheel?.(event); }}
  /></>;
});

export const CodexAnnotationLengthControl = React.forwardRef(function CodexAnnotationLengthControl({
  ariaLabel, property, value = '', placeholderValue, isEdited = false, disabled = false,
  onValueChange, onScrubActiveChange, className, inputClassName, pixelUnitLabel = 'px',
  styleEnabled = false, ...inputProps
}, ref) {
  const displayedValue = parsePixelValue(value) ?? '';
  const placeholder = parsePixelValue(placeholderValue ?? '') ?? normalGapValue(property, placeholderValue ?? value) ?? undefined;
  const initialScrubValue = parsePixelNumber(value) ?? parsePixelNumber(placeholderValue ?? '') ?? 0;
  return <>{styleEnabled && <style data-codex-annotation-number-styles>{numberCss}</style>}<span
    className={join('codex-annotation-length', p(shell, 'w-[112px] flex min-h-7 min-w-0 items-center gap-1 px-3'), className)}>
    <CodexAnnotationNumberControl {...inputProps} ref={ref} ariaLabel={ariaLabel} property={property}
      className={join(p(input, numericInput, 'h-7 w-full truncate text-start text-xs', !isEdited && 'text-tertiary'), inputClassName)}
      inputMode="decimal" step="any" title={value} type="number" value={displayedValue} placeholder={placeholder}
      scrubStep={1} scrubValue={initialScrubValue} formatScrubValue={formatNumericValue}
      disabled={disabled} onScrubActiveChange={onScrubActiveChange} styleEnabled={false}
      onValueChange={typeof onValueChange === 'function' ? next => onValueChange(next.length === 0 ? '' : `${next}px`) : undefined} />
    <span className={p('shrink-0 font-mono text-xs text-tertiary')}>{pixelUnitLabel}</span>
  </span></>;
});

export const CodexAnnotationOpacityControl = React.forwardRef(function CodexAnnotationOpacityControl({
  ariaLabel, property = 'opacity', value = '', placeholderValue, isEdited = false, disabled = false,
  onValueChange, onScrubActiveChange, className, inputClassName, styleEnabled = false, ...inputProps
}, ref) {
  return <>{styleEnabled && <style data-codex-annotation-number-styles>{numberCss}</style>}<span
    className={join('codex-annotation-opacity', p(shell, 'w-[112px] flex min-h-7 min-w-0 items-center px-3'), className)}>
    <CodexAnnotationNumberControl {...inputProps} ref={ref} ariaLabel={ariaLabel} property={property}
      className={join(p(input, numericInput, 'h-7 w-full truncate text-start text-xs', !isEdited && 'text-tertiary'), inputClassName)}
      inputMode="decimal" max="1" min="0" step="0.01" title={value} type="number" value={value} placeholder={placeholderValue}
      scrubMax={1} scrubMin={0} scrubStep={0.01} scrubValue={numericScrubValue(value, placeholderValue)}
      formatScrubValue={formatNumericValue} disabled={disabled} onScrubActiveChange={onScrubActiveChange}
      onValueChange={onValueChange} styleEnabled={false} />
  </span></>;
});
