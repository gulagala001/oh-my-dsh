import { createHash } from 'node:crypto';
// Passive diagnostics only. This projection never changes acceptance errors.
export const resourcePrefix = 'OMD_HOT_RESOURCE ';
const phases = ['prepare', 'launch', 'stock-selected', 'install-request', 'receipt-returned',
  'installed-snapshot-ok', 'readiness-ok', 'screenshot-before', 'screenshot-after',
  'quit-before', 'quit-evaluation-returned', 'quit-issued-received', 'electron-exit',
  'host-before-exit-received', 'host-exit-received', 'exit-verified', 'failure',
  'cleanup-app-close-before', 'cleanup-app-close-returned'];
const moduleIds = ['trisoul_x', '@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-chat',
  '@deepseek-ai/dsh-client-ui-renderer', 'omd-desktop-conversation-hot-observer'];
const declaredStaticPaths = ['/', '/index.html', '/favicon.ico', '/favicon.svg', '/favicon-dark.svg', '/manifest.webmanifest'];
const omdPaths = new Set(['/trisoul-x/api/version', '/trisoul-x/api/model-mode']);
// Fixed rc2 @Remote declarations and the fixture's public RPC methods only.
const sdkPaths = new Set(['session/list', 'session/create', 'session/modelCatalog', 'session/rename',
  'workspace/create', 'pluginManager/listBundles', 'pluginManager/installBundle'].map(name => '/api/' + name));
const choice = (value, values) => values.includes(value) ? value : 'other';
const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 1e9 ? value : null;
const errorTexts = ['net::ERR_ABORTED', 'net::ERR_FAILED', 'net::ERR_UNEXPECTED',
  'net::ERR_CONNECTION_REFUSED', 'net::ERR_CONNECTION_CLOSED', 'net::ERR_EMPTY_RESPONSE',
  'net::ERR_HTTP_RESPONSE_CODE_FAILURE', 'net::ERR_FILE_NOT_FOUND', 'net::ERR_NETWORK_CHANGED'];

export function createResourceDiagnostics({ now, write = line => console.log(line) }) {
  const started = now(), events = [], critical = [], marks = [], revisions = new Map();
  const requests = new WeakMap();
  const staticPaths = new Set(declaredStaticPaths);
  let requestId = 0, sequence = 0, phase = 'prepare', loopback, dropped = 0, emitted = false;
  const ms = () => Math.max(0, Math.min(720000, Math.round(now() - started)));
  function resource(raw) {
    let url;
    try { url = new URL(raw); } catch { return { category: 'invalid' }; }
    const shell = url.protocol === 'dsh-app:' && url.hostname === 'app' && !url.port;
    const local = loopback && url.origin === loopback;
    if (!shell && !local) return { category: choice(url.protocol, ['data:', 'blob:', 'file:']) };
    if (url.username || url.password) return { category: 'credentials-redacted' };
    const origin = shell ? 'dsh-app' : 'current-loopback';
    if (url.pathname === '/plugins/events') return { category: 'module-events', origin };
    // The module loader uses ??<package>/client.js&rev=<hex>, not URLSearchParams.
    if (url.pathname === '/plugins/' && url.search.startsWith('??')) {
      const match = /^\?\?([^&?#]+)\/client\.js&rev=([a-f0-9]{8,64})$/.exec(url.search);
      if (match && moduleIds.includes(match[1]) && revisions.get(match[1])?.has(match[2]))
        return { category: 'module', origin, module: match[1], file: 'client.js', rev: match[2] };
      return { category: 'module-redacted', origin };
    }
    if (staticPaths.has(url.pathname)) return { category: 'known-static', origin, path: url.pathname };
    if (omdPaths.has(url.pathname)) return { category: 'omd-api', origin, path: url.pathname };
    if (sdkPaths.has(url.pathname)) return { category: 'sdk-api', origin, method: url.pathname.slice(5) };
    const pathnameSha256 = createHash('sha256').update(url.pathname).digest('hex');
    if (url.pathname.startsWith('/api/')) return { category: 'api-redacted', origin, pathnameSha256 };
    if (url.pathname.startsWith('/assets/')) return { category: 'asset-redacted', origin, pathnameSha256 };
    return { category: 'path-redacted', origin, pathnameSha256 };
  }
  function record(kind, fields, important = false) {
    const row = { sequence: ++sequence, ms: ms(), phase, kind, ...fields };
    const target = important ? critical : events, limit = important ? 64 : 128;
    if (target.length === limit) { dropped++; if (important) return; target.shift(); }
    target.push(row);
  }
  const link = key => key && typeof key === 'object' ? requests.get(key) ?? { startObserved: false } : { startObserved: false };
  return {
    allowStaticPaths(paths) {
      // Called only with the pinned packaged application's enumerated dist.
      if (!Array.isArray(paths) || paths.length > 4096) throw Error('Invalid packaged static inventory');
      for (const path of paths) {
        if (declaredStaticPaths.includes(path)) { staticPaths.add(path); continue; }
        if (typeof path !== 'string' || path.length > 256 || !/^\/assets\/[A-Za-z0-9_./-]+\.(?:js|css|svg|png|webp|woff2|map)$/.test(path)
          || path.split('/').slice(1).some(part => part === '.' || part === '..' || part === '')) continue;
        staticPaths.add(path);
      }
    },
    setLoopback(value) {
      const url = new URL(value);
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password)
        throw Error('Expected authenticated test-owned loopback origin');
      loopback = url.origin;
    },
    allowModules(rows) {
      for (const row of rows ?? []) if (moduleIds.includes(row.id) && /^[a-f0-9]{8,64}$/.test(row.rev)) {
        const expected = `plugins/??${row.id}/client.js&rev=${row.rev}`;
        if (row.url !== expected) continue;
        if (!revisions.has(row.id)) revisions.set(row.id, new Set());
        revisions.get(row.id).add(row.rev);
      }
    },
    mark(value, fields = {}) {
      const label = choice(value, phases);
      // Unknown labels never enter stdout, including through exception text.
      if (label !== 'other') phase = label;
      if (marks.length >= 48) { dropped++; return; }
      marks.push({ sequence: ++sequence, ms: ms(), phase, kind: 'mark', label,
        pid: integer(fields.pid), clock: 'test-receive-monotonic' });
    },
    request({ key, url, method, type }) {
      const start = { requestId: ++requestId, startObserved: true, startedMs: ms(), startedPhase: phase };
      if (key && typeof key === 'object') requests.set(key, start);
      record('request', { ...start, resource: resource(url), method: choice(method, ['GET', 'HEAD', 'POST', 'OPTIONS']),
        type: choice(type, ['document', 'stylesheet', 'image', 'media', 'font', 'script', 'fetch', 'xhr', 'eventsource', 'other']) });
    },
    response({ key, url, status, method, type }) {
      record('response', { ...link(key), resource: resource(url), status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
        method: choice(method, ['GET', 'HEAD', 'POST', 'OPTIONS']),
        type: choice(type, ['document', 'stylesheet', 'image', 'media', 'font', 'script', 'fetch', 'xhr', 'eventsource', 'other']) }, status >= 400);
    },
    failed({ key, url, errorText, method, type }) {
      record('requestfailed', { ...link(key), resource: resource(url), errorText: choice(errorText, errorTexts),
        method: choice(method, ['GET', 'HEAD', 'POST', 'OPTIONS']),
        type: choice(type, ['document', 'stylesheet', 'image', 'media', 'font', 'script', 'fetch', 'xhr', 'eventsource', 'other']) }, true);
    },
    consoleError({ url, lineNumber, columnNumber }) {
      record('console-error', { resource: resource(url), line: integer(lineNumber), column: integer(columnNumber) }, true);
    },
    pageEvent(kind) { record(choice(kind, ['page-close', 'page-crash']), {}, true); },
    snapshot() {
      return { clock: 'test-process monotonic; Host/quit markers are receive times, not cross-process execution timestamps',
        dropped, marks: [...marks], events: [...events], critical: [...critical] };
    },
    flush() {
      if (emitted) return;
      emitted = true;
      let bytes = 0, omitted = dropped;
      for (const row of [...marks, ...events.slice(-64), ...critical].sort((a, b) => a.sequence - b.sequence)) {
        const line = resourcePrefix + JSON.stringify(row), size = Buffer.byteLength(line + '\n');
        if (size > 1200 || bytes + size > 65536 - 128) { omitted++; continue; }
        write(line); bytes += size;
      }
      write(resourcePrefix + JSON.stringify({ kind: 'end', droppedOrOmitted: omitted + Math.max(0, events.length - 64), clock: 'test-receive-monotonic' }));
    },
  };
}
