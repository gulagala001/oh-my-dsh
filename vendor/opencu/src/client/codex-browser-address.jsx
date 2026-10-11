import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { CodexCuScope, useCodexCuAppearance } from './codex-cu-scope.jsx';
import { CodexCuOverlay } from './codex-cu-overlay.jsx';
import { CodexCuButton } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CODEX_CU_COPY } from './codex-cu-copy.mjs';
import addressCss from './codex-browser-address.css';

// Root CSS aggregation owns injection. Definitions and exact offsets are retained
// in work/rea-reconstruction/browser-address/manifest.json.
export const codexBrowserAddressStyles = addressCss;
const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cba-${value}`).join(' ');
const join = (...values) => values.filter(Boolean).join(' ');
const text = (id, locale = 'zh-CN') => CODEX_CU_COPY[id]?.[locale === 'en' ? 'english' : 'simplifiedChinese'] ?? CODEX_CU_COPY[id]?.english;
const assignRef = (ref, value) => { if (typeof ref === 'function') ref(value); else if (ref) ref.current = value; };

// popup::y.getSnapshot's stopped state. A pending provider can retain real rows;
// the source has no spinner, error row or empty-results surface here.
export const EMPTY_ADDRESS_SUGGESTION_STATE = Object.freeze({
  query: null, suggestions: Object.freeze([]), selectedSuggestion: null,
  isSelectedSuggestionMissing: false, isKeyboardSelection: false,
  selectedIndex: -1, displayedSelectedIndex: -1, isPending: false, preview: null,
});

// app-shared::jVi + RVi/LVi/zVi. Offsets and style flags come from the native
// provider's match; this renderer never creates a match or infers its URL.
function classifiedText(value, classes) {
  if (!value.length) return [];
  const result = [], first = classes[0];
  if (first == null || first.offset > 0) result.push({ offset: 0, style: 0, text: value.slice(0, first?.offset) });
  classes.forEach((classification, index) => {
    const segment = value.slice(classification.offset, classes[index + 1]?.offset);
    if (segment.length) result.push({ ...classification, text: segment });
  });
  return result;
}
function renderClassified(segment) {
  return <span key={segment.offset} className={p(Boolean(segment.style & 2) && 'font-semibold', Boolean(segment.style & 5) && 'text-codex-description')}>{segment.text}</span>;
}

/** Exact IVi provider row content, with caller-supplied native match metadata. */
export function CodexBrowserAddressSuggestionContent({ match, isZeroState, locale = 'zh-CN' }) {
  const isSearch = match.isSearch && match.acceptToken == null;
  const title = isSearch ? match.fillIntoEdit : match.description || match.contents || match.fillIntoEdit;
  let titleClasses = isSearch ? [] : match.descriptionClass;
  if (!isSearch && !match.description) titleClasses = match.contents ? match.contentsClass : [];
  const secondary = !isSearch && match.description ? match.contents || match.fillIntoEdit : null;
  const secondaryClasses = match.contents ? match.contentsClass : [];
  const icon = isSearch
    ? <CodexCuIcon name="shared:Jx" className={p('shrink-0 text-codex-description')} aria-hidden={false} />
    : match.faviconDataURL != null
      ? <img alt="" className={p('size-4 rounded-2xs object-contain')} src={match.faviconDataURL} />
      : <CodexCuIcon name="shared:Dtt" className={p('text-codex-description')} aria-hidden={false} />;
  return <>{icon}<span className={p('flex min-w-0 flex-1 items-baseline gap-1')}>
    <span className={p(isSearch ? 'min-w-0 flex-1 truncate text-default' : 'max-w-[60%] shrink-0 truncate text-default')}>{classifiedText(title, titleClasses).map(renderClassified)}</span>
    {isSearch && (!isZeroState || match.type !== 'search-history') && <span className={p('shrink-0 text-codex-description')}>{text('thread.browser.search', locale)}</span>}
    {secondary != null && <><span aria-hidden="true" className={p("shrink-0 text-codex-description before:content-['—']")} /><span className={p('min-w-0 flex-1 truncate text-codex-description')}>{classifiedText(secondary, secondaryClasses).map(renderClassified)}</span></>}
  </span></>;
}

/** Source popup::x. suggestion.content is the original provider's rendered node. */
export function CodexBrowserAddressSuggestionList({ label, listboxId, suggestions, selectedIndex, onDelete, onDeleteBlur, onSelect }) {
  return <div id={listboxId} className={p('flex max-h-[inherit] w-full flex-col overflow-y-auto rounded-xl border border-primary-outline bg-primary-soft p-1 text-default shadow-lg')} aria-label={label} role="listbox">
    {suggestions.map((suggestion, index) => {
      const selected = index === selectedIndex;
      return <div key={suggestion.renderKey ?? suggestion.id} className={p('group relative')} role="presentation">
        <button id={`${listboxId}-option-${index}`} className={join('codex-browser-address-option', p('flex h-9 w-full shrink-0 cursor-interaction items-center gap-2.5 rounded-lg px-2.5 pe-9 text-start text-[13px] outline-none select-none',
          selected && suggestion.isEmphasized && 'bg-primary-soft-active', selected && !suggestion.isEmphasized && 'bg-primary-ghost-hover', !selected && 'hover:bg-background-primary-ghost-hover/60'))}
          tabIndex={-1} type="button" aria-label={suggestion.ariaLabel} aria-selected={selected} data-browser-sidebar-skip-address-commit="true" role="option"
          onClick={() => onSelect?.(suggestion)} onPointerDown={event => event.preventDefault()}>{suggestion.content}</button>
        {onDelete != null && suggestion.deleteAction != null && <CodexCuButton className={p('absolute end-2.5 top-1/2 -translate-y-1/2', !selected && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
          color="blockAction" radius="small" size="iconCircleSm" type="button" aria-label={suggestion.deleteAction.label}
          data-browser-sidebar-autocomplete-delete="true" data-browser-sidebar-skip-address-commit="true"
          onBlur={event => onDeleteBlur?.(event.relatedTarget)} onClick={event => { event.stopPropagation(); onDelete(suggestion); }}
          onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}>
          <span className={p('_CompactSource_ym4jk_2')}><CodexCuIcon name="shared:VT" className={p('icon-2xs')} aria-hidden="true" /></span>
          <span className={p('_LeadingSource_ym4jk_6')}><CodexCuIcon name="shared:Vot" aria-hidden="true" /></span>
        </CodexCuButton>}
      </div>;
    })}
  </div>;
}

// app-shared::zKi/VKi/HKi/UKi/WKi/qKi's explicit body-anchor branch:
// bottom, gap=0, minWidth=360, viewport gutter=12; it does not flip upward.
// CodexCuOverlay scales its inner surface, so CSS coordinates are converted back
// to physical coordinates while width/height of the inner surface remain logical.
function useSourceAddressSuggestionPosition({ open, anchorRef }) {
  const { windowZoom = 1 } = useCodexCuAppearance();
  const zoom = windowZoom > 0 ? windowZoom : 1;
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const anchor = anchorRef.current, view = anchor?.ownerDocument.defaultView;
    if (!open || !anchor || !view) { setPosition(null); return; }
    const measure = () => {
      const rect = anchor.getBoundingClientRect(), viewportWidth = view.innerWidth / zoom;
      const width = Math.min(Math.max(rect.width / zoom, 360), Math.max(viewportWidth - 24, 0));
      const upper = viewportWidth - width - 12;
      const left = upper < 12 ? 12 : Math.min(Math.max(rect.left / zoom, 12), upper);
      const height = Math.max((view.innerHeight - rect.bottom) / zoom - 12, 0);
      const next = { position: 'fixed', left: left * zoom, top: rect.bottom, width: width * zoom, maxHeight: height * zoom,
        '--codex-address-suggestion-width': `${width}px`, '--codex-address-suggestion-max-height': `${height}px` };
      setPosition(previous => previous?.left === next.left && previous?.top === next.top && previous?.width === next.width && previous?.maxHeight === next.maxHeight ? previous : next);
    };
    measure(); view.addEventListener('resize', measure); view.addEventListener('scroll', measure, true);
    return () => { view.removeEventListener('resize', measure); view.removeEventListener('scroll', measure, true); };
  }, [open, anchorRef, zoom]);
  return position;
}
const useSourceAddressSuggestionMaxHeight = () => Infinity;

/** Controlled input::d visual and event adapter. All providers/navigation remain
 * external callbacks. `disabled` is the host capability guard, absent from d's
 * source props; the input and suggestions cannot act while that guard is set. */
export const CodexBrowserAddressInput = forwardRef(function CodexBrowserAddressInput({
  id, query = '', currentAddress, isAddressEditing, isVisible = true, disabled = false,
  addressBarRef, inputRef, className, placeholder, ariaLabel, locale = 'zh-CN',
  suggestionState = EMPTY_ADDRESS_SUGGESTION_STATE, hasSuggestionSources = false, allowEmptySuggestions = false,
  onValueChange, onStartEditing, onEnsureEditing, onAccept, onCancel, onStopEditing, onFinishEditing, onNavigate, onFind,
  onRequestSuggestions, onStopSuggestions, onMoveSuggestionSelection, onSelectSuggestion, onDeleteSuggestion, onSuggestionsRendered, onSubmit,
  hasEditedAddressRef, shouldKeepAddressSelectedRef, isStoppingAddressEditingRef, showAddressSuggestionsRef,
  submittedAddressStillPending = false, bottomPanelAnimation, rightPanelLayoutTick, panelTarget, onContextMenu,
}, forwardedRef) {
  const ownInputRef = useRef(null), ownEdited = useRef(false), ownKeepSelected = useRef(false), ownStopping = useRef(false);
  const edited = hasEditedAddressRef ?? ownEdited, keepSelected = shouldKeepAddressSelectedRef ?? ownKeepSelected, stopping = isStoppingAddressEditingRef ?? ownStopping;
  const preventInlineOnNextChange = useRef(false), composing = useRef(false), requestedQuery = useRef(null), callbackRef = useRef(onStopSuggestions);
  callbackRef.current = onStopSuggestions;
  const snapshotRef = useRef(suggestionState); snapshotRef.current = suggestionState;
  const { suggestions, displayedSelectedIndex, preview, selectedSuggestion } = suggestionState;
  const listboxId = `address-suggestions-${id}`;
  const open = Boolean(isAddressEditing && !disabled && suggestions.length > 0);
  const value = isAddressEditing ? preview?.value ?? query : query;
  const placeholderText = placeholder ?? text('thread.browser.addressPlaceholder', locale);
  const label = ariaLabel ?? placeholderText;
  const anchorRef = addressBarRef ?? ownInputRef;
  const stopSuggestions = (reason, finish) => { requestedQuery.current = null; preventInlineOnNextChange.current = false; if (finish) composing.current = false; onStopSuggestions?.(reason, finish); };
  const requestSuggestions = (value, selectionStart, selectionEnd, preventInlineAutocomplete = false) => {
    if (!allowEmptySuggestions && !value.length || value.length > 0 && !value.trim().length) { stopSuggestions('clobbered', false); return; }
    const request = { value, selectionStart, selectionEnd, preventInlineAutocomplete: !value.length || preventInlineAutocomplete || composing.current || selectionStart !== value.length || selectionEnd !== value.length };
    requestedQuery.current = request; onRequestSuggestions?.(request);
  };
  const showEmptySuggestions = () => {
    const input = ownInputRef.current;
    if (input && input === input.ownerDocument.activeElement && !input.value.length && allowEmptySuggestions && !open) requestSuggestions('', input.selectionStart ?? 0, input.selectionEnd ?? 0, true);
  };
  useImperativeHandle(showAddressSuggestionsRef, () => showEmptySuggestions, [showEmptySuggestions]);
  useEffect(() => { if (!isAddressEditing || !isVisible || disabled) { requestedQuery.current = null; preventInlineOnNextChange.current = false; composing.current = false; callbackRef.current?.('interaction', true); } }, [isAddressEditing, isVisible, disabled]);
  useEffect(() => () => callbackRef.current?.('interaction', true), []);
  useLayoutEffect(() => {
    const input = ownInputRef.current;
    if (isAddressEditing && input && input === input.ownerDocument.activeElement && preview && !(input.value === preview.value && input.selectionStart === preview.selectionStart && input.selectionEnd === preview.selectionEnd)) input.setSelectionRange(preview.selectionStart, preview.selectionEnd, 'forward');
  }, [isAddressEditing, preview]);
  useLayoutEffect(() => { if (open && isVisible && !suggestionState.isPending) onSuggestionsRendered?.(suggestionState); }, [open, isVisible, suggestionState, onSuggestionsRendered]);
  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current, input = ownInputRef.current, view = anchor?.ownerDocument.defaultView;
    if (!anchor || !view) return;
    const initialWidth = anchor.offsetWidth, initialHeight = anchor.offsetHeight, listbox = anchor.ownerDocument.getElementById(listboxId);
    let closed = false;
    const close = () => { if (!closed) { closed = true; callbackRef.current?.('interaction', false); } };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { if (anchor.offsetWidth !== initialWidth || anchor.offsetHeight !== initialHeight) close(); });
    const scroll = event => { if (event.target !== input && !(event.target instanceof Node && listbox?.contains(event.target))) close(); };
    observer?.observe(anchor);
    const releaseLayout = (panelTarget === 'bottom' ? bottomPanelAnimation : rightPanelLayoutTick)?.on?.('change', close);
    view.addEventListener('resize', close); view.addEventListener('scroll', scroll, true); view.visualViewport?.addEventListener('resize', close); view.visualViewport?.addEventListener('scroll', close);
    return () => { observer?.disconnect(); releaseLayout?.(); view.removeEventListener('resize', close); view.removeEventListener('scroll', scroll, true); view.visualViewport?.removeEventListener('resize', close); view.visualViewport?.removeEventListener('scroll', close); };
  }, [open, anchorRef, listboxId, panelTarget, bottomPanelAnimation, rightPanelLayoutTick]);
  const finishBlur = (target, force = false) => {
    const input = ownInputRef.current;
    if (target instanceof HTMLElement && (target === input || target.dataset.browserSidebarAutocompleteDelete === 'true')) return;
    keepSelected.current = false; stopSuggestions('interaction', true);
    const skipCommit = target instanceof HTMLElement && (target.dataset.browserSidebarOpenExternal === 'true' || target.dataset.browserSidebarSkipAddressCommit === 'true');
    if (force || stopping.current || target != null) { onFinishEditing?.(); if (!skipCommit && !submittedAddressStillPending) onCancel?.(target); stopping.current = false; }
  };
  const acceptSuggestion = (suggestion, method) => {
    if (disabled || suggestionState.isPending) return;
    if (onSelectSuggestion?.(suggestion, method, suggestionState) === true) { stopSuggestions('interaction', true); onAccept?.(); }
  };
  const changeValue = event => {
    if (disabled) return;
    const input = event.currentTarget, value = input.value, start = input.selectionStart ?? value.length, end = input.selectionEnd ?? start;
    const preventInline = preventInlineOnNextChange.current; preventInlineOnNextChange.current = false;
    edited.current = true; keepSelected.current = false; onValueChange?.(value); requestSuggestions(value, start, end, preventInline);
  };
  const activeOption = displayedSelectedIndex >= 0 && displayedSelectedIndex < suggestions.length ? `${listboxId}-option-${displayedSelectedIndex}` : undefined;
  const setInputRef = node => { ownInputRef.current = node; assignRef(inputRef, node); assignRef(forwardedRef, node); };
  return <CodexCuScope><input ref={setInputRef} className={join('codex-browser-address-input', p('h-full w-full min-w-0 bg-transparent py-0 text-sm leading-[18px] text-default outline-none select-text placeholder:text-tertiary [&::placeholder]:select-none', isAddressEditing ? 'cursor-text ps-2 text-start' : 'cursor-text text-center focus:ps-2 focus:text-start'), className)}
    dir="ltr" data-browser-sidebar-address-input="true" aria-label={label} aria-activedescendant={activeOption}
    aria-autocomplete={hasSuggestionSources ? 'both' : undefined} aria-controls={open ? listboxId : undefined} aria-expanded={hasSuggestionSources ? open : undefined} role={hasSuggestionSources ? 'combobox' : undefined}
    disabled={disabled} value={value} placeholder={placeholderText} onFocus={onEnsureEditing} onContextMenu={onContextMenu}
    onPointerDown={event => { if (disabled) return; if (event.currentTarget === event.currentTarget.ownerDocument.activeElement) keepSelected.current = false; else { event.preventDefault(); onStartEditing?.(); } showEmptySuggestions(); }}
    onChange={changeValue} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onCut={event => { if (event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) preventInlineOnNextChange.current = true; }}
    onPaste={event => {
      const pasted = event.clipboardData.getData('text'); if (!pasted.length || disabled) return;
      event.preventDefault(); const input = event.currentTarget, start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
      const next = `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`, selection = start + pasted.length;
      input.value = next; input.setSelectionRange(selection, selection); edited.current = true; keepSelected.current = false; onValueChange?.(next); requestSuggestions(next, selection, selection, true);
    }}
    onBlur={event => finishBlur(event.relatedTarget)}
    onKeyDown={event => {
      if (disabled || event.nativeEvent.isComposing) return;
      preventInlineOnNextChange.current = event.key === 'Backspace' || event.key === 'Delete';
      if (event.key.toLowerCase() === 'f' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); onFind?.(); return; }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
        event.preventDefault(); if (suggestionState.isPending) return;
        const next = onMoveSuggestionSelection?.(event.key === 'ArrowDown' ? 1 : -1, suggestionState);
        requestAnimationFrame(() => { const index = typeof next === 'number' ? next : snapshotRef.current.selectedIndex; if (index >= 0) ownInputRef.current?.ownerDocument.getElementById(`${listboxId}-option-${index}`)?.scrollIntoView?.({ block: 'nearest' }); }); return;
      }
      if (event.key === 'Escape') { event.preventDefault(); stopSuggestions('interaction', true); (onStopEditing ?? onCancel)?.(); return; }
      if (event.key !== 'Enter' && event.key !== 'Return') return;
      event.preventDefault(); if (suggestionState.isSelectedSuggestionMissing) return;
      if (selectedSuggestion != null) { acceptSuggestion(selectedSuggestion, suggestionState.isKeyboardSelection ? 'suggestion_keyboard' : preview != null ? 'inline_enter' : 'typed_enter'); return; }
      const committed = suggestionState.isPending ? suggestionState.query ?? query : event.currentTarget.value;
      if (onSubmit?.(committed, suggestionState) !== true) { if (!onNavigate) return; onNavigate(committed, suggestionState); }
      stopSuggestions('interaction', true); onAccept?.();
    }}
    onSelect={event => {
      if (disabled || preventInlineOnNextChange.current) return;
      const input = event.currentTarget, start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
      if (!edited.current && input.value === currentAddress) return;
      const matches = candidate => candidate?.value === input.value && candidate.selectionStart === start && candidate.selectionEnd === end;
      if (matches(requestedQuery.current) || matches(preview) || suggestions.some(suggestion => matches(suggestion.preview?.inline) || matches(suggestion.preview?.selected))) return;
      edited.current = true; keepSelected.current = false; onValueChange?.(input.value); requestSuggestions(input.value, start, end);
    }} />
    <CodexCuOverlay type="popover" kind="browser-address-suggestions" open={open} anchorRef={anchorRef} side="bottom" align="start" sideOffset={0} collisionPadding={12}
      usePosition={useSourceAddressSuggestionPosition} useMaxHeight={useSourceAddressSuggestionMaxHeight} className="codex-browser-address-positioner" style={{ zIndex: 30 }}
      autoFocus={false} restoreFocus={false} manageTrigger={false} dismissOnOutsidePointer={false} dismissOnFocusOutside={false}
      onEscapeKeyDown={event => { event.preventDefault(); stopSuggestions('interaction', true); (onStopEditing ?? onCancel)?.(); }}
      onClose={() => stopSuggestions('interaction', true)}>
      <div className="codex-browser-address-suggestions-size"><CodexBrowserAddressSuggestionList label={text('thread.browser.addressSuggestions', locale)} listboxId={listboxId} suggestions={suggestions} selectedIndex={displayedSelectedIndex}
        onDelete={!suggestionState.isPending && onDeleteSuggestion ? suggestion => { if (onDeleteSuggestion(suggestion, suggestionState) === true) ownInputRef.current?.focus(); } : undefined}
        onDeleteBlur={target => finishBlur(target, true)} onSelect={suggestion => acceptSuggestion(suggestion, 'suggestion_click')} /></div>
    </CodexCuOverlay>
  </CodexCuScope>;
});
