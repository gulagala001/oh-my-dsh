const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);
const TARGETS = new Set(['in-app-browser', 'external-browser']);
export const CODEX_OWNED_CHAT_LINK_SCOPE = 'opencu-owned-chat';
const fail = (message, code = 'INVALID_BROWSER_LINK') => Object.assign(new Error(message), { code });

function absoluteUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 32768 || value.includes('\0')) throw fail('Invalid browser link URL');
  try { return new URL(value); }
  catch { throw fail('Browser links require an absolute URL'); }
}

function target(value, name) {
  if (!TARGETS.has(value)) throw fail(`Invalid ${name}`);
  return value;
}

// Codex main He/G/Xe: loopback names and local file URLs, without broader IP heuristics.
export function isCodexLocalBrowserUrl(value) {
  const parsed = absoluteUrl(value);
  if (['http:', 'https:'].includes(parsed.protocol)) {
    const host = parsed.hostname.toLowerCase();
    return host.endsWith('.localhost') || LOCAL_HOSTS.has(host);
  }
  if (parsed.protocol !== 'file:' || parsed.hostname.length > 0 && parsed.hostname !== 'localhost') return false;
  let path = parsed.pathname.replace(/\\/gu, '/').replace(/^\/{3,}/u, '//');
  if (/^\/[A-Za-z]:[\\/]/u.test(path)) path = path.slice(1);
  return /^[A-Za-z]:[\\/]/u.test(path) || !(/^\\\\[^\\]+\\[^\\]+/u.test(path) || /^\/\/[^/]+\/[^/]+/u.test(path));
}

// The source qe/vL decision applies only to app-owned URL opening requests.
export function resolveCodexBrowserLinkTarget(request, values, { browserPaneEnabled = true } = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw fail('Invalid browser link request');
  const parsed = absoluteUrl(request.url);
  if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) throw fail('Unsupported browser link protocol', 'UNSUPPORTED_LINK_PROTOCOL');
  if (request.useExternalBrowser !== undefined && typeof request.useExternalBrowser !== 'boolean') throw fail('Invalid external browser intent');
  if (request.openTarget !== undefined && request.openTarget !== null) target(request.openTarget, 'explicit browser target');
  if (request.useExternalBrowser === true || request.openTarget === 'external-browser' || browserPaneEnabled === false) return 'external-browser';
  const local = isCodexLocalBrowserUrl(request.url);
  if (parsed.protocol === 'file:' && !local) return 'external-browser';
  const explicit = request.openTarget ?? (['new-tab', 'new-background-tab'].includes(request.disposition) ? 'in-app-browser' : undefined);
  if (explicit !== undefined) return explicit;
  const key = local ? 'openLocalUrlInTargetPreference' : 'openLinkInTargetPreference';
  return target(values?.[key], key);
}

/** Execute a selected HTTP(S) destination using the caller's authenticated, session-bound operations. */
export async function openCodexPreferredBrowserLink(request, {
  readPreferences, openInAppBrowser, openExternalBrowser, browserPaneEnabled = true, signal,
} = {}) {
  signal?.throwIfAborted();
  const parsed = absoluteUrl(request?.url);
  // Markdown's public scope only admits HTTP(S); file opening retains its existing authorization route.
  if (!['http:', 'https:'].includes(parsed.protocol)) throw fail('This browser link route accepts HTTP(S) only', 'UNSUPPORTED_LINK_PROTOCOL');
  const normalized = { ...request, url: parsed.href };
  const explicit = normalized.useExternalBrowser === true || normalized.openTarget != null
    || ['new-tab', 'new-background-tab'].includes(normalized.disposition) || browserPaneEnabled === false;
  let values;
  if (!explicit) {
    if (typeof readPreferences !== 'function') throw fail('Browser link preferences are unavailable', 'BROWSER_LINK_PREFERENCES_UNAVAILABLE');
    const snapshot = await readPreferences({ signal });
    signal?.throwIfAborted();
    if (snapshot?.available !== true || !snapshot.values) throw fail('Browser link preferences are not ready', 'BROWSER_LINK_PREFERENCES_UNAVAILABLE');
    values = snapshot.values;
  }
  const destination = resolveCodexBrowserLinkTarget(normalized, values, { browserPaneEnabled });
  const open = destination === 'in-app-browser' ? openInAppBrowser : openExternalBrowser;
  if (typeof open !== 'function') throw fail(`The ${destination} link opener is unavailable`, 'BROWSER_LINK_OPENER_UNAVAILABLE');
  let url = normalized.url;
  if (destination === 'external-browser' && parsed.protocol === 'https:' && parsed.hostname === 'chatgpt.com') {
    parsed.searchParams.set('no_universal_links', '1');
    url = parsed.href;
  }
  signal?.throwIfAborted();
  const result = await open({ ...normalized, url, active: normalized.disposition !== 'new-background-tab' }, { signal });
  if (result === false || result?.ok === false || result?.success === false) throw fail('Browser link open did not complete', 'BROWSER_LINK_OPEN_FAILED');
  return { destination, url, result };
}

/** The authenticated HTTP owner supplies actual session/control checks and browser operations. */
export async function openCodexOwnedChatBrowserLink(sessionId, input, {
  assertSessionCurrent, readPreferences, openInAppBrowser, openExternalBrowser, signal,
} = {}) {
  if (typeof sessionId !== 'string' || !sessionId || !input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['url', 'controlEpoch'].includes(key))
    || !Number.isSafeInteger(input.controlEpoch) || input.controlEpoch < 0) throw fail('Invalid owned chat browser link request');
  if ([assertSessionCurrent, readPreferences, openInAppBrowser, openExternalBrowser].some(callback => typeof callback !== 'function')) {
    throw fail('Owned chat browser link operations are unavailable', 'BROWSER_LINK_OPENER_UNAVAILABLE');
  }
  const assertCurrent = async () => {
    signal?.throwIfAborted();
    if (await assertSessionCurrent(sessionId, input.controlEpoch) === false) throw fail('The chat session control state changed', 'CONTROL_CHANGED');
    signal?.throwIfAborted();
  };
  await assertCurrent();
  return openCodexPreferredBrowserLink({ url: input.url }, {
    signal,
    readPreferences: async () => {
      await assertCurrent();
      const preferences = await readPreferences(sessionId, { signal });
      await assertCurrent();
      return preferences;
    },
    openInAppBrowser: async (request, options) => {
      await assertCurrent();
      return openInAppBrowser(sessionId, { ...request, controlEpoch: input.controlEpoch }, options);
    },
    openExternalBrowser: async (request, options) => {
      await assertCurrent();
      return openExternalBrowser(sessionId, request, options);
    },
  });
}
