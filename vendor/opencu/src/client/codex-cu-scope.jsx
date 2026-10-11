import React, { Fragment, createContext, forwardRef, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

export const CodexCuAppearanceContext = createContext(null);

// Read DSH's public theme surface only. This module does not inspect Codex settings.
export function readCodexCuHostTheme() {
  if (typeof document === 'undefined') return 'light';
  const root = document.documentElement;
  const declared = root?.getAttribute('data-theme');
  if (declared === 'dark' || declared === 'light') return declared;
  if (root?.classList.contains('dark')) return 'dark';
  if (root?.classList.contains('light')) return 'light';
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const themeSubscribers = new Set();
let stopThemeObservation;
function subscribeHostTheme(notify) {
  themeSubscribers.add(notify);
  if (!stopThemeObservation && typeof document !== 'undefined') {
    const update = () => { for (const subscriber of themeSubscribers) subscriber(); };
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update);
    if (document.documentElement) observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const media = typeof window === 'undefined' ? null : window.matchMedia?.('(prefers-color-scheme: dark)');
    if (media?.addEventListener) media.addEventListener('change', update);
    else media?.addListener?.(update);
    stopThemeObservation = () => {
      observer?.disconnect();
      if (media?.removeEventListener) media.removeEventListener('change', update);
      else media?.removeListener?.(update);
      stopThemeObservation = undefined;
    };
  }
  return () => {
    themeSubscribers.delete(notify);
    if (!themeSubscribers.size) stopThemeObservation?.();
  };
}
const noSubscription = () => () => {};
const serverTheme = () => 'light';
function useHostTheme(enabled) {
  const subscribe = useCallback(notify => enabled ? subscribeHostTheme(notify) : noSubscription(), [enabled]);
  return useSyncExternalStore(subscribe, readCodexCuHostTheme, serverTheme);
}

// Exact gVs/OVs defaults and rounding, not measurements of the running Codex app.
const uiTextBases = Object.freeze({
  '--text-4xl': 72, '--text-3xl': 48, '--text-2xl': 36, '--text-xl': 28,
  '--text-lg': 16, '--text-base': 14, '--text-sm': 13, '--text-xs': 12,
  '--text-dynamic-isle-row': 14, '--text-heading-lg': 24,
  '--text-heading-app': 28, '--text-heading-md': 20, '--text-heading-sm': 18,
});
const defaults = Object.freeze({ referenceWindowType: 'electron', typographyPreset: 'electron-default', windowZoom: 1 });
const appearanceKeys = ['theme', 'referenceWindowType', 'typographyPreset', 'uiFontSize', 'codeFontSize', 'chatFontSize', 'chatCodeFontSize', 'uiFontFamily', 'codeFontFamily', 'contentFontFamily', 'windowZoom'];
const customProperties = style => Object.fromEntries(Object.entries(style ?? {}).filter(([key]) => key.startsWith('--')));
function positiveNumber(value, name) {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError(`CodexCuScope ${name} must be a positive finite number.`);
  return value;
}
function fontFamily(value, fallback) { return value == null ? undefined : `${value}, var(${fallback})`; }
function appearanceVariables(appearance) {
  const variables = { '--codex-window-zoom': String(appearance.windowZoom) };
  const uiSize = positiveNumber(appearance.uiFontSize ?? (appearance.typographyPreset === 'electron-default' ? 14 : undefined), 'uiFontSize');
  const codeSize = positiveNumber(appearance.codeFontSize ?? (appearance.typographyPreset === 'electron-default' ? 12 : undefined), 'codeFontSize');
  if (uiSize != null) {
    variables['--font-ui-size'] = `${uiSize}px`;
    for (const [token, base] of Object.entries(uiTextBases)) variables[token] = `${Math.round(base * uiSize / 14)}px`;
  }
  if (codeSize != null) variables['--font-code-size'] = `${codeSize}px`;
  const families = {
    '--font-ui-family': fontFamily(appearance.uiFontFamily, '--font-sans-default'),
    '--font-code-family': fontFamily(appearance.codeFontFamily, '--font-mono-default'),
    '--codex-content-font-family': fontFamily(appearance.contentFontFamily, '--font-sans'),
  };
  for (const [token, value] of Object.entries(families)) if (value != null) variables[token] = value;
  for (const [key, token] of [['chatFontSize', '--codex-chat-font-size-override'], ['chatCodeFontSize', '--codex-chat-code-font-size-override']]) {
    const value = positiveNumber(appearance[key], key);
    if (value != null) variables[token] = `${value}px`;
  }
  return variables;
}

/** The window type selects a reference design branch; it does not describe DSH's runtime. */
export function useCodexCuAppearance() {
  const inherited = useContext(CodexCuAppearanceContext);
  const hostTheme = useHostTheme(!inherited);
  return useMemo(() => inherited ?? { ...defaults, theme: hostTheme, variables: appearanceVariables(defaults) }, [inherited, hostTheme]);
}

/** Nested scopes reuse their parent by default. Wrap each external portal with forceScope.
 * Fragment is supported only when inheriting an existing DOM scope.
 * Styles are supplied by codex-cu-styles.mjs; this component does not inject them.
 */
export const CodexCuScope = forwardRef(function CodexCuScope({
  as, children, forceScope = false, theme, referenceWindowType, typographyPreset,
  fontSize, uiFontSize, codeFontSize, chatFontSize, chatCodeFontSize,
  uiFontFamily, codeFontFamily, contentFontFamily, windowZoom,
  className, style, ...elementProps
}, ref) {
  const inherited = useContext(CodexCuAppearanceContext);
  const hostTheme = useHostTheme(!inherited && theme == null);
  const fontOptions = { theme, referenceWindowType, typographyPreset, uiFontSize: uiFontSize ?? fontSize, codeFontSize, chatFontSize, chatCodeFontSize, uiFontFamily, codeFontFamily, contentFontFamily, windowZoom };
  const hasAppearanceOverride = appearanceKeys.some(key => fontOptions[key] !== undefined);
  const hasCustomProperties = Object.keys(style ?? {}).some(key => key.startsWith('--'));
  const boundary = !inherited || forceScope || hasAppearanceOverride || hasCustomProperties;
  const appearance = useMemo(() => {
    if (!boundary) return inherited;
    const next = { ...defaults, ...inherited, theme: inherited?.theme ?? hostTheme };
    for (const key of appearanceKeys) if (fontOptions[key] !== undefined) next[key] = fontOptions[key];
    if (next.theme !== 'dark' && next.theme !== 'light') throw new TypeError('CodexCuScope theme must be light or dark.');
    next.windowZoom = positiveNumber(next.windowZoom, 'windowZoom') ?? 1;
    next.customVariables = { ...inherited?.customVariables, ...customProperties(style) };
    next.variables = { ...appearanceVariables(next), ...next.customVariables };
    return next;
  }, [boundary, inherited, hostTheme, theme, referenceWindowType, typographyPreset, fontSize, uiFontSize, codeFontSize, chatFontSize, chatCodeFontSize, uiFontFamily, codeFontFamily, contentFontFamily, windowZoom, style]);
  const Element = as ?? 'div';
  if (Element === Fragment) {
    if (boundary) throw new TypeError('CodexCuScope Fragment requires an inherited DOM scope; root and portal scopes need an element.');
    return <>{children}</>;
  }
  if (!boundary && as == null && ref == null && className == null && style == null && !Object.keys(elementProps).length) return <>{children}</>;
  const scopeProps = boundary ? {
    'data-codex-cu-scope': '',
    'data-theme': appearance.theme,
    'data-codex-cu-window-type': appearance.referenceWindowType,
    'data-codex-cu-font-preset': appearance.typographyPreset ?? undefined,
    style: { ...appearance.variables, ...style },
  } : { style };
  const element = <Element {...elementProps} {...scopeProps} ref={ref} className={className}>{children}</Element>;
  return boundary ? <CodexCuAppearanceContext.Provider value={appearance}>{element}</CodexCuAppearanceContext.Provider> : element;
});
