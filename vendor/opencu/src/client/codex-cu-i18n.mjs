import { CODEX_CU_COPY } from './codex-cu-copy.mjs';
import { CODEX_CU_FORMATTER_MESSAGES } from './codex-cu-formatter-messages.mjs';
import { CodexCuIntlMessageFormat } from './codex-cu-source-formatter.mjs';

// The ICU parser, formatter, and rich-text semantics are unchanged declarations
// from the verified Codex artifact. No external package or runtime is loaded.
export const CODEX_CU_I18N_CAPABILITIES = Object.freeze({
  engine: 'verified-packed-intl-messageformat', complexIcu: true, richText: true,
  formatterCacheLimit: 64,
});
const FORMATTER_CACHE_LIMIT = 64;
const formatterCache = new Map();
function isSimplifiedChinese(locale) {
  const normalized = String(locale ?? 'zh-CN').replace(/_/g, '-').toLowerCase();
  return normalized === 'zh-cn' || normalized.startsWith('zh-cn-');
}
function formatterFor(message, locale) {
  const key = `${locale}\0${message}`;
  if (formatterCache.has(key)) {
    const cached = formatterCache.get(key);
    formatterCache.delete(key); formatterCache.set(key, cached);
    return cached;
  }
  const formatter = new CodexCuIntlMessageFormat(message, locale);
  formatterCache.set(key, formatter);
  if (formatterCache.size > FORMATTER_CACHE_LIMIT) formatterCache.delete(formatterCache.keys().next().value);
  return formatter;
}

/** Inspection has no host/UI side effects. `text` may be a string, rich value,
 * or an array of strings/rich values, exactly as IntlMessageFormat returns it.
 * Required tag handlers and argument values are owned by the caller. Missing
 * values never produce an invented translation or an implicit DOM/link.
 */
export function inspectCodexCuMessage({ id, defaultMessage } = {}, values = {}, locale = 'zh-CN') {
  const entry = id != null && Object.prototype.hasOwnProperty.call(CODEX_CU_COPY, id) ? CODEX_CU_COPY[id]
    : id != null && Object.prototype.hasOwnProperty.call(CODEX_CU_FORMATTER_MESSAGES, id) ? CODEX_CU_FORMATTER_MESSAGES[id] : undefined;
  const english = typeof defaultMessage === 'string' ? defaultMessage : entry?.english ?? '';
  const matchesSource = entry != null && (defaultMessage == null || defaultMessage === entry.english);
  const translated = isSimplifiedChinese(locale) && matchesSource && typeof entry.simplifiedChinese === 'string';
  const message = translated ? entry.simplifiedChinese : english;
  // Official Chinese source uses the requested zh-CN locale. A missing Chinese
  // translation falls back to the English source/default locale, as ReactIntl.
  const requestedLocale = String(locale ?? 'zh-CN').replace(/_/g, '-');
  const englishLocale = isSimplifiedChinese(locale) ? 'en' : requestedLocale;
  const formatterLocale = translated ? requestedLocale : englishLocale;
  const sourceStatus = translated ? 'official-translation' : entry && !matchesSource ? 'english-descriptor-mismatch'
    : isSimplifiedChinese(locale) && !entry?.simplifiedChinese ? 'english-missing-translation' : 'english-source';
  try {
    return { text: formatterFor(message, formatterLocale).format(values ?? {}), language: translated ? 'zh-CN' : 'en', status: sourceStatus, id };
  } catch (error) {
    // Exact English may still be formatted when its required argument set is
    // complete. If it also fails, retain it unchanged for the caller's existing
    // fallback renderer. Do not coerce rich nodes or fabricate missing values.
    try {
      return { text: formatterFor(english, englishLocale).format(values ?? {}), language: 'en', status: 'english-format-fallback', id, errorCode: error?.code ?? 'FORMAT_ERROR' };
    } catch {
      return { text: english, language: 'en', status: 'english-unformatted-fallback', id, errorCode: error?.code ?? 'FORMAT_ERROR' };
    }
  }
}

/** Exact official copy plus the verified ICU/rich formatter. */
export function formatCodexCuMessage(descriptor, values, locale = 'zh-CN') {
  return inspectCodexCuMessage(descriptor, values, locale).text;
}
