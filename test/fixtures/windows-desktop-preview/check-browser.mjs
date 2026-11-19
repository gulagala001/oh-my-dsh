import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

async function evaluate(address, expression) {
  const socket = new WebSocket(address);
  try {
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Desktop evaluation timed out')), 20_000);
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true } }));
      }, { once: true });
      const fail = () => {
        clearTimeout(timeout);
        reject(new Error('Desktop debugging connection closed'));
      };
      socket.addEventListener('close', fail, { once: true });
      socket.addEventListener('error', fail, { once: true });
      socket.addEventListener('message', event => {
        const answer = JSON.parse(event.data);
        if (answer.id !== 1) return;
        clearTimeout(timeout);
        if (answer.error || answer.result.exceptionDetails) {
          reject(new Error(answer.error?.message ?? answer.result.exceptionDetails?.exception?.description ?? answer.result.exceptionDetails?.text));
        } else resolve(answer.result.result.value);
      });
    });
    return await response;
  } finally {
    socket.close();
  }
}

const port = Number(process.argv[2]);
assert(Number.isSafeInteger(port) && port > 0 && port < 65536);
const listing = `http://127.0.0.1:${port}/json/list`;
const deadline = Date.now() + 120_000;
let desktop;
let skipped = false;
while (Date.now() < deadline && !desktop) {
  const targets = await fetch(listing, { signal: AbortSignal.timeout(2_000) }).then(response => response.json()).catch(() => []);
  for (const target of targets.filter(value => value.type === 'page' && value.webSocketDebuggerUrl)) {
    const address = target.webSocketDebuggerUrl;
    if (!skipped && await evaluate(address, 'Boolean(window.dshWelcome?.skip)').catch(() => false)) {
      skipped = await evaluate(address, '(() => { setTimeout(() => window.dshWelcome.skip(), 25); return true })()').catch(() => false);
    }
    if (target.url === 'dsh-app://app/' && await evaluate(address, 'document.readyState === "complete" && Boolean(window.dshDesktop?.browser?.openCU)').catch(() => false)) {
      desktop = address;
      break;
    }
  }
  if (!desktop) await delay(500);
}
assert(desktop, 'The installed desktop did not expose its OpenCU browser bridge');

const fixture = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>OMD browser smoke</title><p>Installed browser guest</p>');
});
try {
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  const url = `http://127.0.0.1:${fixture.address().port}/`;
  const result = await evaluate(desktop, `(async () => {
    const browser = window.dshDesktop.browser;
    const workbench = await browser.capabilities();
    const lease = await browser.acquireOpenCU();
    const guest = document.createElement('webview');
    guest.setAttribute('name', lease.lease);
    guest.setAttribute('partition', lease.partition);
    guest.setAttribute('allowpopups', '');
    guest.setAttribute('src', 'about:blank#' + lease.lease);
    try {
      const loaded = new Promise((resolve, reject) => {
        guest.addEventListener('did-finish-load', () => {
          if (guest.getURL().startsWith('about:blank')) guest.src = ${JSON.stringify(url)};
          else if (guest.getURL() === ${JSON.stringify(url)}) resolve(guest.getTitle());
        });
        guest.addEventListener('did-fail-load', event => {
          if (event.validatedURL === ${JSON.stringify(url)}) reject(new Error(event.errorDescription));
        });
      });
      document.body.append(guest);
      return { title: await loaded, openCU: browser.openCU, workbench };
    } finally {
      guest.remove();
      await browser.release(lease.lease);
    }
  })()`);
  assert.equal(result.title, 'OMD browser smoke');
  assert.equal(result.openCU.revision, 2);
  assert(result.workbench.persistentProfiles && result.workbench.downloads);
  console.log(`Installed OpenCU bridge revision ${result.openCU.revision} loaded a real guest page; Workbench capabilities are present.`);
} finally {
  fixture.closeAllConnections();
  await new Promise(resolve => fixture.close(resolve));
}
