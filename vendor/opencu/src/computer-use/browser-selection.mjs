import {isIP} from 'node:net';

export function normalizeBrowserUrl(value) {
  return value === undefined || URL.canParse(value) ? value : `https://${value}`;
}

export function parseTabMention(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Invalid tab mention URL.'); }
  if (parsed.protocol !== 'plugin:' || parsed.host !== 'openai-bundled' ||
      !['browser', 'chrome', 'chrome-dev', 'chrome-internal'].includes(parsed.username) ||
      parsed.password !== '' || !['', '/'].includes(parsed.pathname) || parsed.hash !== '') {
    throw new Error('Invalid tab mention URL.');
  }
  const fields = Object.fromEntries(parsed.searchParams);
  const {mention, source, browserId, tabId, title, url} = fields;
  const resolvedSource = parsed.username === 'browser' ? source ?? 'iab' : 'extension';
  if (mention !== 'tab-v1' || parsed.searchParams.size !== Object.keys(fields).length ||
      !['iab', 'extension'].includes(resolvedSource) || browserId === undefined || browserId.trim() === '' ||
      tabId === undefined || tabId.trim() === '' || title === undefined || url === undefined) {
    throw new Error('Invalid tab mention fields.');
  }
  return {source: resolvedSource, browser_id: browserId, tab_id: tabId, title, url};
}

const infoOf = browser => browser.info ?? browser;
const preferred = (browser, instanceId) => instanceId != null && infoOf(browser).type === 'extension' && infoOf(browser).metadata?.extensionInstanceId === instanceId;
const pick = candidates => candidates.find(browser => infoOf(browser).type === 'iab') ?? candidates.find(browser => browser.matchesPreferredExtension) ?? candidates[0];
const localUrl = url => {
  const hostname = url.hostname.toLowerCase();
  return url.protocol === 'file:' || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
};
const withoutHash = url => { const copy = new URL(url); copy.hash = ''; return copy.href; };
const relatedHosts = (left, right) => {
  const first = left.toLowerCase().replace(/\.$/, ''), second = right.toLowerCase().replace(/\.$/, '');
  const [shorter, longer] = first.length < second.length ? [first, second] : [second, first];
  return shorter.includes('.') && isIP(shorter) === 0 && longer.endsWith(`.${shorter}`);
};

async function browserTabUrls(browser, listTabs, signal) {
  const type = infoOf(browser).type;
  if (type !== 'iab' && type !== 'extension') return [];
  signal?.throwIfAborted();
  const controller = new AbortController();
  const lifetime = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let timer, abortListener, timedOut = false;
  try {
    const operation = Promise.resolve().then(() => {
      lifetime.throwIfAborted();
      if (listTabs) return listTabs(browser, {signal: lifetime});
      return type === 'extension' ? browser.api?.getUserTabs() ?? [] : browser.api?.getTabs() ?? [];
    });
    const deadline = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        const error = Object.assign(new Error('Timed out after 1000ms waiting for open browser tabs.'), {name: 'TimeoutError'});
        reject(error);
        controller.abort(error);
      }, 1000);
    });
    const aborted = new Promise((resolve, reject) => {
      abortListener = () => reject(lifetime.reason);
      lifetime.addEventListener('abort', abortListener, {once: true});
      if (lifetime.aborted) abortListener();
    });
    const tabs = await Promise.race([operation, deadline, aborted]);
    signal?.throwIfAborted();
    return tabs.flatMap(({url}) => typeof url === 'string' ? [url] : []);
  } catch (error) {
    signal?.throwIfAborted();
    if (!timedOut && error?.name === 'AbortError') throw error;
    return [];
  } finally {
    clearTimeout(timer);
    lifetime.removeEventListener('abort', abortListener);
  }
}

export async function selectBrowserForUrl(browsers, url, {preferredExtensionInstanceId, listTabs, signal} = {}) {
  signal?.throwIfAborted();
  if (!browsers.length) throw new Error('No browser is available.');
  if (url === undefined) return browsers.find(browser => infoOf(browser).type === 'iab') ?? browsers.find(browser => preferred(browser, preferredExtensionInstanceId)) ?? browsers.find(browser => infoOf(browser).type === 'extension') ?? browsers[0];
  if (browsers.length === 1) return browsers[0];
  const destination = new URL(url);
  if (localUrl(destination)) {
    const iab = browsers.find(browser => infoOf(browser).type === 'iab');
    if (iab) return iab;
  }
  const inventory = await Promise.all(browsers.map(async browser => ({
    browser, type: infoOf(browser).type,
    matchesPreferredExtension: preferred(browser, preferredExtensionInstanceId),
    openTabUrls: await browserTabUrls(browser, listTabs, signal),
  })));
  signal?.throwIfAborted();
  const candidates = [...inventory.filter(browser => browser.type === 'iab'), ...inventory.filter(browser => browser.type === 'extension')];
  const choose = list => pick(list)?.browser;
  for (const level of ['exact', 'originPathname', 'hostname', 'hostnameHierarchy']) {
    const matches = candidates.filter(browser => browser.openTabUrls.some(value => {
      let tab;
      try { tab = new URL(value); } catch { return false; }
      if (level === 'exact') return withoutHash(tab) === withoutHash(destination);
      if (level === 'originPathname') return tab.origin === destination.origin && tab.pathname === destination.pathname;
      if (level === 'hostname') return tab.hostname === destination.hostname;
      return relatedHosts(tab.hostname, destination.hostname);
    }));
    const selected = choose(matches);
    if (selected) return selected;
  }
  return choose(inventory.filter(browser => browser.type === 'iab')) ?? choose(inventory.filter(browser => browser.type === 'extension')) ?? browsers[0];
}

export function selectTabReference(managed, user, reference) {
  let matches, mention;
  if (typeof reference === 'string') {
    if (reference === '') throw new Error('getTab requires a tab reference');
    const match = tab => tab.id === reference || tab.providerTabId === reference;
    matches = managed.filter(match);
    if (!matches.length) matches = combinedTabs(managed, user, true).filter(match);
  } else if (reference && typeof reference === 'object' && 'mention' in reference) {
    mention = parseTabMention(reference.mention);
    const match = tab => tab.providerTabId === mention.tab_id;
    matches = managed.filter(match);
    if (!matches.length) matches = combinedTabs(managed, user, true).filter(match);
    const tab = matches[0];
    if (tab && (tab.title !== mention.title || tab.url !== mention.url)) throw new Error("Stale tab mention: the tab's title or URL has changed.");
  } else {
    if (!URL.canParse(reference?.url)) throw new Error('getTab requires an absolute URL.');
    matches = combinedTabs(managed, user, false).filter(tab => tab.url === reference.url);
  }
  if (!matches.length) throw new Error('Tab not found.');
  if (matches.length !== 1) throw new Error(`Multiple tabs match the reference: ${JSON.stringify(matches)}`);
  return matches[0];
}

function combinedTabs(managed, user, mergeProviderIds) {
  const combined = new Map(user.map(tab => [tab.id, tab]));
  const providers = new Map(user.map(tab => [tab.id, tab.providerTabId]));
  for (const tab of managed) {
    combined.set(tab.id, mergeProviderIds ? {...tab, providerTabId: tab.providerTabId ?? providers.get(tab.id)} : tab);
  }
  return [...combined.values()];
}
