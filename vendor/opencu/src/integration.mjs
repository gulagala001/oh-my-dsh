import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { legacySettings } from './legacy-settings.mjs';
import { Config, configSnapshot } from './config.mjs';
import { ComputerUseManager } from './computer-use/manager.mjs';
import { mountComputerUseHttp } from './computer-use/http.mjs';
import { ImageCoordinates, mountImageCoordinates } from './computer-use/image-coordinates.mjs';
import { registerComputerTools } from './computer-use/tools.mjs';
import { announceFreshComputerRuntime } from './computer-use/runtime-context.mjs';
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { updateDocumentationContext } from './computer-use/documentation-state.mjs';
import { ComputerPresentationStore } from './computer-use/presentation.mjs';
import { PluginFilePolicy } from './computer-use/plugin-file-policy.mjs';
import { PluginCdpProvider } from './computer-use/plugin-cdp-provider.mjs';

// Shared even when the host loads two physical copies of the package. The root
// owns registrations; disposing one consumer must not tear down another's tools.
const sharedKey = Symbol.for('opencu.runtime.v1');
const hostRelease = JSON.parse(readFileSync(new URL('../vendor/dsh-chat.json', import.meta.url), 'utf8')).version;
const defined = value => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
async function startupConfig(ctx, options) {
  const entries = ctx.get('configEditor')?.configuration() ?? [];
  const layers = [];
  for (const namespace of ['trisoul-x', 'opencu']) {
    const row = entries.find(row => row.entry.options.id === namespace && !row.entry.disabled);
    if (!row && namespace !== options.namespace) continue;
    const legacy = await legacySettings(ctx, namespace, Config);
    const live = configSnapshot(row?.entry.fiber?.config ?? row?.entry.options.config);
    const own = namespace === options.namespace ? { ...configSnapshot(options.config), ...options.getConfig?.() } : {};
    layers.push(Object.fromEntries(Object.entries({ ...legacy.value, ...defined(live), ...defined(own) }).filter(([key, value]) => key in Config.dict && value !== undefined)));
  }
  return Object.assign({}, ...layers);
}

export async function acquireComputerUse(ctx, options = {}) {
  const root = ctx.root;
  // Resolve both declared owners before allocating paths, regardless of their
  // mount order. Recheck the root after I/O so concurrent owners still share one.
  const initial = root[sharedKey] ? null : await startupConfig(ctx, options);
  let shared = root[sharedKey];
  if (shared?.closing) {
    await shared.closing;
    return acquireComputerUse(ctx, options);
  }
  if (!shared) {
    const explicitDirectory = initial.dataDir;
    const directory = explicitDirectory ? join(explicitDirectory, 'computer-use') : options.dataDir ?? join(initial.dataDir || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'trisoul-x'), 'computer-use');
    shared = { owners: new Map(), sessionTitles: new WeakMap(), config: () => shared.getConfig(), computerImages: new ImageCoordinates() };
    shared.computerPresentation = new ComputerPresentationStore(join(directory, 'presentation'), error => root.logger.warn('Computer Use presentation cache: ' + error.message));
    const documentationStates = new Map();
    shared.documentationState = id => {
      if (!documentationStates.has(id)) documentationStates.set(id, new Set());
      return documentationStates.get(id);
    };
    // The standalone plugin's explicit values win when it shares a runtime
    // with OMD. Each owner reads its own live Profile configuration.
    shared.getConfig = () => {
      const owners = [...shared.owners.values()].sort((a, b) => Number(a.namespace === 'opencu') - Number(b.namespace === 'opencu'));
      return Object.assign({}, initial, ...owners.map(owner => Object.fromEntries(Object.entries({
        ...configSnapshot(owner.config), ...owner.getConfig?.(),
      }).filter(([, value]) => value !== undefined))));
    };
    let appliedEnabled = initial.computerUseEnabled !== false;
    shared.refresh = () => {
      const enabled = shared.config().computerUseEnabled !== false;
      return shared.configuring = (shared.configuring || Promise.resolve()).catch(() => {}).then(async () => {
        if (enabled === appliedEnabled) return;
        await shared.computerUse.setEnabled(enabled);
        appliedEnabled = enabled;
      });
    };
    shared.filePolicy = new PluginFilePolicy(root, { directory: join(directory, 'upload-staging') });
    shared.computerUse = new ComputerUseManager(directory, {
      filePolicy: shared.filePolicy,
      capabilities: { cdp: new PluginCdpProvider(shared.filePolicy) },
      getHostUrl: () => {
        const server = root.get('webServer');
        // The pinned rc.2 service exposes host/port and only creates HTTP servers.
        const protocol = server?.protocol ?? (hostRelease === '0.2.0-rc.2'
          && ['127.0.0.1', '0.0.0.0'].includes(server?.host) ? 'http:' : undefined);
        if (!server || !['http:', 'https:'].includes(protocol) || !Number.isSafeInteger(server.port) || server.port <= 0 || typeof server.host !== 'string') return undefined;
        const hostname = server.host.includes(':') ? `[${server.host}]` : server.host;
        return new URL(`${protocol}//${hostname}:${server.port}`).origin;
      },
      getSessionTitle: id => {
        const session = root.sessions?.get?.(id);
        if (!session) return '';
        if (!shared.sessionTitles.has(session)) shared.sessionTitles.set(session, root.sessionTitle?.get?.(session)?.title || session.header?.title || '');
        return shared.sessionTitles.get(session);
      },
      enabled: initial.computerUseEnabled !== false,
      browser: { executablePath: initial.computerUseBrowserExecutable || undefined },
      extension: { chromeUserDataDir: initial.computerUseChromeUserDataDir || undefined },
      native: { binary: initial.computerUseNativeBinary || undefined, socket: initial.computerUseNativeSocket || undefined },
    });
    root[sharedKey] = shared;
    shared.fiber = root.plugin({ name: 'opencu-runtime', inject: ['tools', 'settings', 'llm', 'agents', 'sessions', 'sessionProjections'], apply(scope) {
      scope.on('app-boot/config-reload', () => shared.refresh(), { global: true });
      mountImageCoordinates(scope, shared.computerImages);
      mountComputerUseHttp(scope, shared);
      registerComputerTools(scope, shared);
      scope.on('llm/stream', async function* (options, next) {
        const session = isAgentLoopRequest(options) && options.sessionId && root.sessions?.get?.(options.sessionId);
        if (session) updateDocumentationContext(shared, session, options.messages);
        yield* next();
      }, { global: true });
      scope.on('agent/pre-step', async ({ agent, signal }, next) => {
        if (!signal.aborted && shared.config().computerUseEnabled !== false) announceFreshComputerRuntime(shared.computerUse, agent.session);
        return next();
      }, { global: true });
      scope.on('agent/disposed', async ({ agent }) => {
        shared.computerImages.clear(agent.session.id);
        if (shared.computerUse.sessions.has(agent.session.id)) {
          await shared.computerUse.reset(agent.session.id);
          await shared.computerUse.endTurn(agent.session.id);
        }
      }, { global: true });
      scope.on('session/event', (session, event) => {
        if (event.type === 'turn/start' && shared.computerUse.sessions.has(session.id)) shared.computerUse.beginTurn(session.id,event.data.turn);
        if (event.type === 'turn/end') void shared.computerUse.endTurn(session.id,event.data.turn,event.data.reason).catch(error=>root.logger.warn(error.message));
        if (event.type === 'session/title' && typeof event.data?.title === 'string') {
          shared.sessionTitles.set(session, event.data.title);
          for (const browser of shared.computerUse.extensionBrowsers.values()) void browser.renameSessionGroup(session.id, event.data.title).catch(error => root.logger.warn(error.message));
        }
      }, { global: true });
      scope.effect(() => async () => { await shared.computerUse.close(); await shared.computerPresentation.close(); });
    } });
  }
  const owner = Symbol();
  shared.owners.set(owner, options);
  void shared.refresh().catch(error => root.logger.warn(error.message));
  ctx.effect(() => () => {
    shared.owners.delete(owner);
    if (shared.owners.size) return shared.refresh();
    // A new owner must not start another controller before release completes.
    shared.closing ??= Promise.resolve().then(() => shared.fiber.dispose());
    void shared.closing.then(() => {
      if (root[sharedKey] === shared) delete root[sharedKey];
    }, () => {});
    return shared.closing;
  });
  return shared;
}
