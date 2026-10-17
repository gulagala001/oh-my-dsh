const ports = Array.from({length: 10}, (_, index) => 19390 + index);
const label = () => /Edg\//.test(navigator.userAgent) ? 'Microsoft Edge' : 'Google Chrome';
export function createPairingClient({connect, connected, error: report}) {
  let pending = [], scanning, stopped = false;
  async function identity() {
    const saved = await chrome.storage.local.get('instanceId');
    if (saved.instanceId) return saved.instanceId;
    const instanceId = crypto.randomUUID(); await chrome.storage.local.set({instanceId}); return instanceId;
  }
  async function post(port, path, value, token, timeout = 4000) {
    const response = await fetch(`http://127.0.0.1:${port}/opencu-extension/v1/${path}`, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeout),
      headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})}, body: JSON.stringify(value),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error?.message || '本机 DSH 连接失败'), result.error);
    return result;
  }
  async function discover(wait = false) {
    if (stopped || connected()) return;
    const instanceId = await identity(), saved = await chrome.storage.local.get(['pairings', 'pausedHosts']);
    const found = (await Promise.all(ports.map(async port => {
      try {
        const host = await post(port, 'discover', {instanceId, label: label(), wait}, undefined, wait ? 20000 : 2000);
        return host.protocol === 1 && typeof host.hostId === 'string' && typeof host.challenge === 'string' ? {...host, port} : null;
      } catch { return null; }
    }))).filter(Boolean);
    pending = found;
    for (const host of found) {
      if (stopped || connected()) return;
      const pair = (saved.pairings || []).find(item => item.hostId === host.hostId);
      if (pair && !(saved.pausedHosts || []).includes(host.hostId)) {
        try { await connect({...pair, port: host.port, consent: true}, true); return; }
        catch (error) {
          report(error);
          if (error.code !== 'UNAUTHORIZED') continue;
          await chrome.storage.local.set({pairings: (await chrome.storage.local.get('pairings')).pairings.filter(item => item.hostId !== host.hostId)});
        }
      }
      if (host.requestId) {
        const {shownRequests = []} = await chrome.storage.session.get('shownRequests');
        if (!shownRequests.includes(host.requestId)) {
          await chrome.storage.session.set({shownRequests: [...shownRequests.slice(-19), host.requestId]});
          await chrome.windows.create({url: chrome.runtime.getURL('options.html'), type: 'popup', width: 500, height: 550, focused: true});
        }
      }
    }
  }
  async function scan(wait = false) {
    if (scanning) return scanning;
    scanning = discover(wait).finally(() => {scanning = undefined;});
    return scanning;
  }
  return {
    async start() {
      stopped = false;
      while (!stopped && !connected()) {
        await scan();
        if (!stopped && !connected()) await scan(true);
        if (!stopped && !connected()) await new Promise(resolve => setTimeout(resolve, 1000));
      }
    },
    stop() { stopped = true; },
    async hosts() { if (!pending.length) await scan(); return pending.map(({challenge: ignored, ...host}) => host); },
    async allow(hostId) {
      let host = pending.find(item => item.hostId === hostId) || (pending.length === 1 ? pending[0] : null);
      if (!host) { await scan(); host = pending.find(item => item.hostId === hostId) || (pending.length === 1 ? pending[0] : null); }
      if (!host) throw Object.assign(new Error('请先打开本机 DSH；无需复制连接信息。'), {code: pending.length ? 'AMBIGUOUS_HOST' : 'HOST_UNAVAILABLE'});
      const instanceId = await identity(), token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
      // Save the client half before committing the host half; a lost HTTP reply is retryable.
      const {pairings = [], pausedHosts = []} = await chrome.storage.local.get(['pairings', 'pausedHosts']);
      const pair = {hostId: host.hostId, port: host.port, token, consent: true, durableDownloadConsent: true};
      await chrome.storage.local.set({pairings: [...pairings.filter(item => item.hostId !== host.hostId), pair], pausedHosts: pausedHosts.filter(id => id !== host.hostId)});
      await post(host.port, 'pair', {instanceId, challenge: host.challenge, token, authorized: true, debuggerConsent: true, durableDownloadConsent: true});
      return connect({...pair, consent: true});
    },
    async decline() {
      const instanceId = await identity();
      await Promise.all(pending.filter(host => host.requestId).map(host => post(host.port, 'decline', {instanceId, requestId: host.requestId})));
      return {connected: false, message: '已拒绝本次连接'};
    },
    async pause(hostId) {
      if (!hostId) return;
      const {pausedHosts = []} = await chrome.storage.local.get('pausedHosts');
      await chrome.storage.local.set({pausedHosts: [...new Set([...pausedHosts, hostId])]});
    },
    async forget(c) {
      const {pairings = []} = await chrome.storage.local.get('pairings');
      await chrome.storage.local.set({pairings: pairings.filter(item => item.hostId !== c.hostId)});
      await post(Number(new URL(c.endpoint).port), 'forget', {instanceId: c.instanceId}, c.token);
    },
  };
}
