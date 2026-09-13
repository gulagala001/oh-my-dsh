import { join } from 'node:path';
import { homedir } from 'node:os';
import { Config } from './config.mjs';
import { ComputerUseManager } from './computer-use/manager.mjs';
import { mountComputerUseHttp } from './computer-use/http.mjs';
import { ImageCoordinates, mountImageCoordinates } from './computer-use/image-coordinates.mjs';
import { registerComputerTools } from './computer-use/tools.mjs';
import { announceFreshComputerRuntime } from './computer-use/runtime-context.mjs';

// Shared even when the host loads two physical copies of the package. The root
// owns registrations; disposing one consumer must not tear down another's tools.
const sharedKey = Symbol.for('opencu.runtime.v1');
export function acquireComputerUse(ctx, options = {}) {
  const root = ctx.root;
  let shared = root[sharedKey];
  if (!shared) {
    const legacy = ctx.settings.section('trisoul-x') ?? {};
    const initial = { ...legacy, ...options.config, ...options.getConfig?.(), ...ctx.settings.section('opencu') };
    const explicitDirectory = ctx.settings.section('opencu')?.dataDir;
    const directory = explicitDirectory ? join(explicitDirectory, 'computer-use') : options.dataDir ?? join(initial.dataDir || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'trisoul-x'), 'computer-use');
    shared = { owners: new Map(), config: () => shared.getConfig(), computerImages: new ImageCoordinates() };
    // Explicit OpenCU settings win; otherwise keep the integration's existing
    // configuration, including saved legacy browser/native paths.
    shared.getConfig = () => ({ ...legacy, ...[...shared.owners.values()].find(o => o.config)?.config, ...[...shared.owners.values()].find(o => o.getConfig)?.getConfig(), ...ctx.settings.section('opencu') });
    shared.refresh = () => shared.computerUse.setEnabled(shared.config().computerUseEnabled !== false);
    shared.computerUse = new ComputerUseManager(directory, {
      enabled: initial.computerUseEnabled !== false,
      browser: { executablePath: initial.computerUseBrowserExecutable || undefined },
      extension: { chromeUserDataDir: initial.computerUseChromeUserDataDir || undefined },
      native: { binary: initial.computerUseNativeBinary || undefined, socket: initial.computerUseNativeSocket || undefined },
    });
    root[sharedKey] = shared;
    shared.fiber = root.plugin({ name: 'opencu-runtime', inject: ['tools', 'settings', 'llm', 'agents', 'sessions', 'sessionProjections'], apply(scope) {
      // Keep absent fields absent, so Oh My's existing settings stay effective.
      const base = { ...legacy, ...options.config };
      scope.settings.installSection(scope, 'opencu', Config, base, {
        setSource: () => {},
        onChange: () => shared.refresh(),
      });
      mountImageCoordinates(scope, shared.computerImages);
      mountComputerUseHttp(scope, shared);
      registerComputerTools(scope, shared);
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
        if (event.type === 'turn/end') void shared.computerUse.endTurn(session.id);
      }, { global: true });
      scope.effect(() => () => shared.computerUse.close());
    } });
  }
  const owner = Symbol();
  shared.owners.set(owner, options);
  void shared.refresh().catch(error => root.logger.warn(error.message));
  ctx.effect(() => () => {
    shared.owners.delete(owner);
    if (shared.owners.size) return shared.refresh();
    if (root[sharedKey] === shared) delete root[sharedKey];
    return shared.fiber.dispose();
  });
  return shared;
}
