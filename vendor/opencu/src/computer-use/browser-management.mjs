export const BROWSER_MANAGEMENT_METHODS = Object.freeze({
  windows: Object.freeze(['get', 'getAll', 'create', 'update']),
  tabs: Object.freeze(['get', 'query', 'update', 'remove', 'move', 'group']),
  tabGroups: Object.freeze(['get', 'query', 'update', 'move']),
  bookmarks: Object.freeze([]),
});

const colors = new Set(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']);
const states = new Set(['normal', 'minimized', 'maximized', 'fullscreen']);
const unavailable = message => Object.assign(new Error(message), { code: 'BROWSER_MANAGEMENT_UNAVAILABLE' });
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_BROWSER_MANAGEMENT_ARGUMENT' });
const id = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) throw invalid(label + ' must be an explicit non-negative Chrome identifier');
  return value;
};
const integer = (value, label, minimum = -Infinity) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw invalid(label + ' must be an integer' + (minimum === -Infinity ? '' : ' >= ' + minimum));
  return value;
};
const boolean = (value, label) => {
  if (typeof value !== 'boolean') throw invalid(label + ' must be a boolean');
  return value;
};
const string = (value, label) => {
  if (typeof value !== 'string' || value.length > 4096) throw invalid(label + ' must be a string of at most 4096 characters');
  return value;
};
const member = values => (value, label) => {
  if (!values.has(value)) throw invalid(label + ' has an unsupported value');
  return value;
};
const normal = value => {
  if (value !== 'normal') throw unavailable('Browser management supports only normal windows');
  return value;
};
const noIncognito = value => {
  if (value !== false) throw unavailable('Incognito window management is unavailable');
  return false;
};
const identifiers = (value, label) => {
  if (!Array.isArray(value)) return id(value, label);
  if (!value.length || value.length > 100) throw invalid(label + ' must contain between 1 and 100 identifiers');
  const result = value.map(item => id(item, label));
  if (new Set(result).size !== result.length) throw invalid(label + ' contains duplicate identifiers');
  return result;
};
const urlPatterns = (value, label) => {
  if (!Array.isArray(value)) return string(value, label);
  if (!value.length || value.length > 100) throw invalid(label + ' must contain between 1 and 100 URL patterns');
  return value.map(item => string(item, label));
};

function properties(value, schema, label, { optional = false, required = [], nonempty = false } = {}) {
  if (value === undefined && optional) value = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw invalid(label + ' must be an options object');
  const result = {};
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(schema, key)) throw unavailable(label + '.' + key + ' is unavailable');
    if (value[key] !== undefined) result[key] = schema[key](value[key], label + '.' + key);
  }
  for (const key of required) if (!Object.hasOwn(result, key)) throw invalid(label + '.' + key + ' is required');
  if (nonempty && !Object.keys(result).length) throw invalid(label + ' must contain a supported change');
  return result;
}

function windowProperties(value, creating) {
  const schema = { focused: boolean, left: integer, top: integer, width: (value, label) => integer(value, label, 1), height: (value, label) => integer(value, label, 1), state: member(states) };
  if (creating) Object.assign(schema, { tabId: id, type: normal, incognito: noIncognito });
  const result = properties(value, schema, 'windows.' + (creating ? 'create' : 'update'), { optional: creating, nonempty: !creating });
  if (['left', 'top', 'width', 'height'].some(key => Object.hasOwn(result, key)) && result.state !== 'normal') throw invalid('Window bounds require state: "normal"');
  return result;
}

const tabQuerySchema = {
  active: boolean, audible: boolean, autoDiscardable: boolean, currentWindow: boolean, discarded: boolean,
  groupId: (value, label) => integer(value, label, -1), highlighted: boolean, index: (value, label) => integer(value, label, 0),
  lastFocusedWindow: boolean, muted: boolean, pinned: boolean, status: member(new Set(['loading', 'complete'])),
  title: string, url: urlPatterns, windowId: id, windowType: normal,
};
const groupPresentationSchema = { collapsed: boolean, color: member(colors), title: string };
const moveSchema = { index: (value, label) => integer(value, label, -1), windowId: id };
const windowGetSchema = { populate: boolean };

// This is the documented organization subset, not arbitrary Chrome API access.
export function normalizeBrowserManagementCall(namespace, method, args = []) {
  if (typeof namespace !== 'string' || typeof method !== 'string') throw invalid('Browser management namespace and method must be strings');
  if (!Object.hasOwn(BROWSER_MANAGEMENT_METHODS, namespace) || !BROWSER_MANAGEMENT_METHODS[namespace].includes(method)) throw unavailable('Browser management method is unavailable: ' + namespace + '.' + method);
  if (!Array.isArray(args)) throw invalid('Browser management args must be an array');
  const count = (minimum, maximum = minimum) => {
    if (args.length < minimum || args.length > maximum) throw invalid(namespace + '.' + method + ' received an invalid number of arguments');
  };
  let normalized;
  if (namespace === 'windows') {
    if (method === 'get') { count(1, 2); normalized = [id(args[0], 'windowId'), properties(args[1], windowGetSchema, 'windows.get', { optional: true })]; }
    if (method === 'getAll') { count(0, 1); normalized = [properties(args[0], windowGetSchema, 'windows.getAll', { optional: true })]; }
    if (method === 'create') { count(0, 1); normalized = [windowProperties(args[0], true)]; }
    if (method === 'update') { count(2); normalized = [id(args[0], 'windowId'), windowProperties(args[1], false)]; }
  } else if (namespace === 'tabs') {
    if (method === 'get') { count(1); normalized = [id(args[0], 'tabId')]; }
    if (method === 'query') { count(1); normalized = [properties(args[0], tabQuerySchema, 'tabs.query')]; }
    if (method === 'update') { count(2); normalized = [id(args[0], 'tabId'), properties(args[1], { pinned: boolean }, 'tabs.update', { required: ['pinned'] })]; }
    if (method === 'remove') { count(1); normalized = [identifiers(args[0], 'tabIds')]; }
    if (method === 'move') { count(2); normalized = [identifiers(args[0], 'tabIds'), properties(args[1], moveSchema, 'tabs.move', { required: ['index'] })]; }
    if (method === 'group') {
      count(1);
      const result = properties(args[0], {
        tabIds: identifiers, groupId: id,
        createProperties: value => properties(value, { windowId: id }, 'tabs.group.createProperties'),
      }, 'tabs.group', { required: ['tabIds'] });
      if (Object.hasOwn(result, 'groupId') && Object.hasOwn(result, 'createProperties')) throw invalid('tabs.group cannot combine groupId with createProperties');
      normalized = [result];
    }
  } else if (namespace === 'tabGroups') {
    if (method === 'get') { count(1); normalized = [id(args[0], 'groupId')]; }
    if (method === 'query') { count(1); normalized = [properties(args[0], { ...groupPresentationSchema, windowId: id }, 'tabGroups.query')]; }
    if (method === 'update') { count(2); normalized = [id(args[0], 'groupId'), properties(args[1], groupPresentationSchema, 'tabGroups.update', { nonempty: true })]; }
    if (method === 'move') { count(2); normalized = [id(args[0], 'groupId'), properties(args[1], moveSchema, 'tabGroups.move', { required: ['index'] })]; }
  }
  return { namespace, method, args: normalized };
}

export function browserManagementStatus(browser) {
  const connected = typeof browser?.call === 'function' && browser.info?.capabilities?.includes('browser-management') === true;
  const grouped = connected && browser.info.capabilities.includes('browser-management-tab-groups');
  return {
    available: connected,
    namespaces: {
      windows: { available: connected, methods: connected ? [...BROWSER_MANAGEMENT_METHODS.windows] : [] },
      tabs: { available: connected, methods: connected ? BROWSER_MANAGEMENT_METHODS.tabs.filter(method => grouped || !['group', 'move'].includes(method)) : [] },
      tabGroups: { available: grouped, methods: grouped ? [...BROWSER_MANAGEMENT_METHODS.tabGroups] : [] },
      bookmarks: { available: false, methods: [], reason: 'The extension does not have bookmark permission' },
    },
    history: { available: false, reason: 'Browsing history is not part of browser management' },
    ...(!connected ? { reason: 'The selected browser does not expose native browser management' } : {}),
  };
}

export class BrowserManagement {
  constructor(browser) { this.browser = browser; }
  status() { return browserManagementStatus(this.browser); }
  available() { return this.status().available; }
  async invoke(namespace, method, args = [], { signal } = {}) {
    const input = normalizeBrowserManagementCall(namespace, method, args), support = this.status();
    if (!support.available || !support.namespaces[namespace]?.methods.includes(method)) throw unavailable('Browser management method is unavailable on this browser: ' + namespace + '.' + method);
    signal?.throwIfAborted();
    const result = await this.browser.call('management.call', input, { signal });
    signal?.throwIfAborted();
    if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'value')) throw new Error('The browser returned an invalid management response');
    return result.value;
  }
  async getAuditTrail({ signal } = {}) {
    if (!this.available()) throw unavailable('Browser management audit trail is unavailable on this browser');
    signal?.throwIfAborted();
    const result = await this.browser.call('management.getAuditTrail', {}, { signal });
    signal?.throwIfAborted();
    if (!result || !Array.isArray(result.changes)) throw new Error('The browser returned an invalid management audit trail');
    return result;
  }
  capability({ signal } = {}) {
    const namespaces = Object.fromEntries(Object.keys(BROWSER_MANAGEMENT_METHODS).map(namespace => [namespace, new Proxy(Object.freeze({}), {
      get: (_target, method) => {
        if (typeof method !== 'string' || ['then', 'toJSON'].includes(method) || method in Object.prototype) return undefined;
        return (...args) => this.invoke(namespace, method, args, { signal });
      },
    })]));
    return Object.freeze({ ...namespaces, getAuditTrail: () => this.getAuditTrail({ signal }) });
  }
}
