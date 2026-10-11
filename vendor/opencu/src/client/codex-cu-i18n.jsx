import React, { createContext, useCallback, useContext } from 'react';
import { formatCodexCuMessage } from './codex-cu-i18n.mjs';

export const CodexCuLocaleContext = createContext('zh-CN');
export const CodexCuFormatMessageContext = createContext(null);
export function CodexCuI18nProvider({ locale, formatMessage, children }) {
  const inheritedLocale = useContext(CodexCuLocaleContext);
  const inheritedFormat = useContext(CodexCuFormatMessageContext);
  return <CodexCuLocaleContext.Provider value={locale ?? inheritedLocale}>
    <CodexCuFormatMessageContext.Provider value={formatMessage ?? inheritedFormat}>{children}</CodexCuFormatMessageContext.Provider>
  </CodexCuLocaleContext.Provider>;
}
export function useFormatCodexCuMessage({ locale, formatMessage } = {}) {
  const inheritedLocale = useContext(CodexCuLocaleContext);
  const inheritedFormat = useContext(CodexCuFormatMessageContext);
  const selectedLocale = locale ?? inheritedLocale;
  const selectedFormatter = formatMessage ?? inheritedFormat;
  return useCallback((descriptor, values) => selectedFormatter
    ? selectedFormatter(descriptor, values, selectedLocale)
    : formatCodexCuMessage(descriptor, values, selectedLocale), [selectedLocale, selectedFormatter]);
}
/** A file's audited exact-English map; arbitrary caller text/ReactNodes stay intact.
 * Plain display and aria/options values are always strings, even with overrides.
 */
export function useCodexCuPlainText(mapping, options) {
  const formatter = useFormatCodexCuMessage(options);
  return useCallback((value, values) => {
    if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(mapping, value)) return value;
    const result = formatter({ id: mapping[value], defaultMessage: value }, values);
    return typeof result === 'string' ? result : value;
  }, [formatter, mapping]);
}
export function CodexCuMessage({ id, defaultMessage, values, locale, formatMessage }) {
  const formatter = useFormatCodexCuMessage({ locale, formatMessage });
  return <>{formatter({ id, defaultMessage }, values)}</>;
}
