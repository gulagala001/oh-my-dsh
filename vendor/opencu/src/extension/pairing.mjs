import {randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';

const digest = token => createHash('sha256').update(token).digest('hex');
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);

/** Pairing survives transport epochs; discovery never exposes a control credential. */
export function createBrowserPairing(directory) {
  const file = join(directory, 'browser-pairings.json'), candidates = new Map(), listeners = new Set();
  let saved, demand, writing = Promise.resolve(), closed = false;
  const ready = (async () => {
    await mkdir(directory, {recursive: true, mode: 0o700});
    try { saved = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      saved = {version: 1, hostId: randomUUID(), pairs: []};
      await writeFile(file, JSON.stringify(saved), {mode: 0o600, flag: 'wx'});
    }
    if (saved.version !== 1 || !validId(saved.hostId) || !Array.isArray(saved.pairs) || saved.pairs.some(pair => !validId(pair.instanceId) || !/^chrome-extension:\/\/[a-p]{32}$/.test(pair.origin) || !/^[a-f0-9]{64}$/.test(pair.digest))) fail('INVALID_PAIRING_STORE', 'Browser pairing data is invalid; the original file was not changed.');
  })();
  const wake = () => { for (const listener of [...listeners]) listener(); };
  const key = (origin, instanceId) => origin + '/' + instanceId;
  const available = () => [...candidates.values()].filter(item => Date.now() - item.lastSeen < 35000);
  const matches = (item, browser) => !browser || browser === 'external' || [item.instanceId, 'extension:' + item.instanceId, item.label].includes(browser) || item.label.toLowerCase().includes(String(browser).toLowerCase());
  async function update(change) {
    const work = writing.catch(() => {}).then(async () => {
      await ready;
      const next = {...saved, pairs: change(saved.pairs)};
      const temporary = file + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify(next), {mode: 0o600});
      await rename(temporary, file); saved = next;
    });
    writing = work; await work;
  }
  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); listeners.delete(done); signal?.removeEventListener('abort', abort); };
      const done = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(signal.reason); };
      const timer = setTimeout(done, ms); listeners.add(done);
      signal?.addEventListener('abort', abort, {once: true});
      if (signal?.aborted) abort();
    });
  }
  const pairing = {
    ready,
    async discover(origin, value, signal) {
      await ready;
      if (closed) fail('CLOSED', 'OpenCU is closed.');
      if (!validId(value.instanceId)) fail('INVALID_IDENTITY', 'Invalid browser installation identity.');
      const id = key(origin, value.instanceId);
      let candidate = candidates.get(id);
      const firstSeen = !candidate;
      if (!candidate) { candidate = {origin, instanceId: value.instanceId, challenge: randomUUID()}; candidates.set(id, candidate); }
      candidate.label = value.label === 'Microsoft Edge' ? 'Microsoft Edge' : 'Google Chrome'; candidate.lastSeen = Date.now();
      if (firstSeen) wake();
      const pending = () => demand && matches(candidate, demand.browser) && !demand.denied.has(id);
      if (value.wait === true && !pending()) await wait(15000, signal);
      candidate.lastSeen = Date.now();
      return {protocol: 1, hostId: saved.hostId, hostName: 'OpenCU · 本机 DSH', challenge: candidate.challenge,
        ...(pending() ? {requestId: demand.id} : {})};
    },
    async allow(origin, value) {
      await ready;
      const candidate = candidates.get(key(origin, value.instanceId));
      if (closed || !candidate || candidate.challenge !== value.challenge || Date.now() - candidate.lastSeen > 35000) fail('STALE_PAIRING', 'Connection request expired; retry discovery.');
      if (value.authorized !== true || value.debuggerConsent !== true) fail('CONSENT_REQUIRED', 'Click Allow in the browser connection window.');
      if (typeof value.token !== 'string' || value.token.length < 32 || value.token.length > 256) fail('INVALID_TOKEN', 'A random browser pairing credential is required.');
      await update(pairs => [...pairs.filter(pair => pair.origin !== origin || pair.instanceId !== value.instanceId),
        {origin, instanceId: value.instanceId, label: candidate.label, digest: digest(value.token), durableDownloadConsent: value.durableDownloadConsent === true}]);
      return {paired: true, hostId: saved.hostId};
    },
    authenticate(origin, instanceId, token) {
      if (!saved || !validId(instanceId) || typeof token !== 'string') return null;
      const pair = saved.pairs.find(pair => pair.origin === origin && pair.instanceId === instanceId);
      if (!pair) return null;
      return timingSafeEqual(Buffer.from(pair.digest, 'hex'), Buffer.from(digest(token), 'hex')) ? pair : null;
    },
    connected(instanceId) { if (demand && available().some(item => item.instanceId === instanceId && matches(item, demand.browser))) { demand.connected = true; wake(); } },
    decline(origin, value) {
      const id = key(origin, value.instanceId);
      if (demand?.id === value.requestId) { demand.denied.add(id); wake(); }
      return {declined: true};
    },
    async forget(instanceId) { await update(pairs => pairs.filter(pair => pair.instanceId !== instanceId)); wake(); },
    async list() { await ready; return saved.pairs.map(({digest: ignored, origin, ...pair}) => ({...pair, extensionId: new URL(origin).hostname})); },
    async request(browser, signal, {waitMs = 60000, discoveryMs = 2200, excludeInstanceIds = [], onWaiting} = {}) {
      await ready;
      signal?.throwIfAborted();
      const eligible = item => matches(item, browser) && !excludeInstanceIds.includes(item.instanceId);
      const deadline = Date.now() + discoveryMs;
      while (!closed && !available().some(eligible) && Date.now() < deadline) await wait(Math.max(1, deadline - Date.now()), signal);
      const choices = available().filter(eligible);
      if (!choices.length) {
        if (browser) fail('BROWSER_EXTENSION_UNAVAILABLE', 'Open Chrome / Edge with the OpenCU extension enabled, then retry.');
        return {available: false};
      }
      if (choices.length > 1) {
        const browsers = choices.map(({instanceId, label}) => ({id: 'extension:' + instanceId, name: label, pairingRequired: true}));
        if (browser) throw Object.assign(new Error('Choose one discovered browser profile before requesting approval.'), {code: 'BROWSER_CHOICE_REQUIRED', details: {browsers}});
        return {available: true, browsers};
      }
      if (demand) fail('PAIRING_IN_PROGRESS', 'A browser connection request is already waiting for approval.');
      const current = demand = {id: randomUUID(), browser: choices[0].instanceId, denied: new Set(), connected: false};
      const expires = Date.now() + waitMs; wake();
      let endWaiting;
      try {
        endWaiting = onWaiting?.({kind: 'browser', requestId: current.id, appDisplayName: choices[0].label});
        while (!closed && !current.connected && Date.now() < expires) {
          if (choices.every(item => current.denied.has(key(item.origin, item.instanceId)))) fail('PAIRING_DECLINED', 'Browser connection was declined.');
          await wait(Math.max(1, expires - Date.now()), signal);
        }
        if (!current.connected) fail(closed ? 'CLOSED' : 'PAIRING_TIMEOUT', 'Browser connection was not approved.');
        return {connected: true};
      } finally { if (demand === current) demand = undefined; endWaiting?.(); wake(); }
    },
    close() { closed = true; wake(); },
  };
  return pairing;
}
