import { AsyncLocalStorage } from 'node:async_hooks';
import { findPackageJSON } from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as native from '@deepseek-ai/dsh-mcp-client';

// Observe only explicitly owned native clients. Native apply still owns name
// reservation, discovery, tool registration, transport creation and reconnect.
// The SDK's public Client.onclose is the transport's actual close receipt;
// a resolved Fiber.dispose alone is not that receipt.
const current = new AsyncLocalStorage();
let loading;
async function clientClass() {
  return loading ??= (async () => {
    const file = findPackageJSON('@modelcontextprotocol/client', import.meta.resolve('@deepseek-ai/dsh-mcp-client'));
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    const entry = manifest.exports?.['.']?.import?.default;
    if (manifest.version !== '2.2.0' || typeof entry !== 'string') throw Error('Unsupported native MCP lifecycle contract');
    return (await import(new URL(entry, pathToFileURL(file)))).Client;
  })();
}
const hooks = new WeakMap();
function retainHook(Client) {
  let hook = hooks.get(Client);
  if (!hook) {
    const previous = Client.prototype.connect;
    hook = { owners: 0, previous, wrapper: function (...args) {
      const owner = current.getStore();
      return owner ? owner.connect(this, args[0], () => previous.apply(this, args)) : previous.apply(this, args);
    } };
    Client.prototype.connect = hook.wrapper; hooks.set(Client, hook);
  }
  hook.owners++;
  return () => {
    if (--hook.owners) return;
    if (Client.prototype.connect === hook.wrapper) Client.prototype.connect = hook.previous;
    hooks.delete(Client);
  };
}

export async function observeNativeMcp(changed, { closeWaitMs = 5500 } = {}) {
  const releaseHook = retainHook(await clientClass()), live = new Set();
  let latest, stopping = false, released = false;
  const publish = (entry, status, error = null) => {
    entry.status = status;
    if (entry === latest && !stopping) changed({ status, error, ...(status === 'connected' ? { connectedAt: entry.connectedAt ??= Date.now() } : {}) });
  };
  const owner = {
    async connect(client, transport, connect) {
      if (stopping) throw Error('MCP connection is stopping');
      const receipt = Promise.withResolvers();
      const entry = latest = { client, transport, receipt, connecting: true, closed: false, initialClosed: false };
      live.add(entry); publish(entry, 'starting');
      const settled = () => {
        if (entry.closed || !entry.connecting && !client.transport && entry.initialClosed) {
          entry.closed = true; live.delete(entry); receipt.resolve();
        }
      };
      const priorClose = client.onclose, priorError = client.onerror, transportClose = transport.onclose;
      client.onerror = error => { publish(entry, 'unconfirmed', error.message); return priorError?.call(client, error); };
      const request = client.request;
      if (typeof request === 'function') client.request = async function (...args) {
        const result = await request.apply(this, args);
        if (!entry.closed && client.transport) publish(entry, 'connected');
        return result;
      };
      client.onclose = (...args) => {
        entry.closed = true; settled(); publish(entry, 'disconnected');
        return priorClose?.apply(client, args);
      };
      // Protocol negotiation may close a probe transport and open a sibling.
      // Closing that probe is not a disconnect of the final Client transport.
      transport.onclose = (...args) => { entry.initialClosed = true; settled(); return transportClose?.apply(transport, args); };
      try { const value = await connect(); if (!entry.closed && client.transport) publish(entry, 'connected'); return value; }
      catch (error) { publish(entry, 'disconnected', error.message); throw error; }
      finally { entry.connecting = false; settled(); }
    },
    module: { ...native, async apply(ctx, config) { return current.run(owner, () => native.apply(ctx, config)); } },
    get connected() { return Boolean(latest && latest.status === 'connected' && !latest.closed && !latest.connecting && latest.client.transport); },
    stopping() { stopping = true; },
    async close() {
      stopping = true;
      const failures = [];
      await Promise.all([...live].map(async entry => {
        let timer;
        try {
          const cleanup = (async () => {
            await entry.client.close();
            if (!entry.client.transport && !entry.initialClosed) await entry.transport.close();
            await entry.receipt.promise;
          })();
          await Promise.race([cleanup, new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('MCP transport closure is still unconfirmed')), closeWaitMs);
          })]);
        } catch (error) { failures.push(error); }
        finally { clearTimeout(timer); }
      }));
      if (failures.length) throw new AggregateError(failures, 'MCP transport cleanup is not confirmed');
      if (!released) { released = true; releaseHook(); }
    },
  };
  return owner;
}
