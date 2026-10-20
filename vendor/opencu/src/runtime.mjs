import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

export const DEFAULT_DATA_DIR = join(homedir(), '.opencu');

export async function createRuntime(options = {}) {
  const dataDir = resolve(options.dataDir || DEFAULT_DATA_DIR);
  const { createController } = await import('./core/controller.mjs');
  let browser = options.browser;
  let native = options.native;
  let extension = options.extension;
  const warnings = [];
  try {
    // DSH inventory must not implicitly launch a second Chromium. A web user
    // may explicitly opt into a separate, server-owned headless browser.
    if (browser === undefined && options.browserEnabled !== false && (!options.dshBrowser || options.managedHeadless === true || options.cdpEndpoint || options.browserOptions?.context)) {
      const { createBrowserBackend } = await import('./browser/backend.mjs');
      const managedHeadless = options.managedHeadless === true && !options.cdpEndpoint && !options.browserOptions?.context;
      browser = await createBrowserBackend({ ...options.browserOptions, dataDir: join(dataDir, 'browser'), cdpEndpoint: options.cdpEndpoint,
        headless: managedHeadless || options.headless === true,
        ...(managedHeadless ? { launchOptions: { ...options.browserOptions?.launchOptions, headless: true } } : {}) });
    }
    if (native === undefined && options.nativeEnabled !== false) {
      try {
        const { createNativeBackend } = await import('./native/backend.mjs');
        native = await createNativeBackend({ ...options.nativeOptions, dataDir: join(dataDir, 'native'), helperPath: options.helperPath ?? options.nativeOptions?.helperPath });
      } catch (error) {
        if (options.nativeRequired) throw error;
        warnings.push({ backend: 'native', code: error.code || 'NATIVE_UNAVAILABLE', message: error.message });
      }
    }
    if (extension === undefined && options.extensionEnabled !== false && options.token) {
      const { createExtensionBackend } = await import('./extension/backend.mjs');
      extension = createExtensionBackend({ token: options.token, dataDir: join(dataDir, 'extension'), pairing: options.browserPairing });
    }
    const { createCompositeBrowserBackend, createExtensionMountHook } = await import('./browser/composite.mjs');
    // provider belongs to the composite inventory, not the plain Playwright inventory.
    const plainBrowser = browser && { ...browser, select(reference) {
      if (reference && typeof reference === 'object') {
        const { provider, ...plainReference } = reference;
        return browser.select(plainReference);
      }
      return browser.select(reference);
    } };
    const { releaseUnavailableBrowser } = await import('./browser/unavailable-release.mjs');
    const composite = browser || extension || options.dshBrowser ? createCompositeBrowserBackend({ browser: plainBrowser, extension, dsh: options.dshBrowser,
      releaseUnavailable: { browser: () => releaseUnavailableBrowser(join(dataDir, 'browser')) } }) : false;
    const controller = await createController({ dataDir, browser: composite, native: native || undefined });
    controller.runtimeInfo = { platform: process.platform, architecture: process.arch, backends: { browser: !!browser, native: !!native, extension: !!extension, dsh: !!options.dshBrowser }, warnings };
    // Configuration is not proof of a live renderer. Preserve legacy booleans,
    // but expose current provider readiness without launching or probing a browser.
    Object.defineProperty(controller.runtimeInfo, 'browserProviders', { enumerable: true, get() {
      return {
        managed: { configured: !!browser, mode: options.cdpEndpoint ? 'cdp' : options.browserOptions?.context ? 'provided_context' : options.managedHeadless === true ? 'managed_headless' : 'managed',
          ...(!options.cdpEndpoint && !options.browserOptions?.context ? { executionLocation: 'server' } : {}) },
        dsh: options.dshBrowser?.getDiagnostics?.() ?? { configured: !!options.dshBrowser, status: options.dshBrowser ? 'unknown' : 'disabled' },
        extension: { configured: !!extension, connectedBrowsers: extension?.connections?.().length ?? 0 },
      };
    } });
    controller.applicationMetadata = target => native?.applicationMetadata?.(target) ?? { displayName: target.name || target.title, iconDataURL: target.iconDataURL ?? null };
    controller.presentationContrast = args => native?.presentationContrast?.(args) ?? { available: false };
    controller.extensionConnections = () => extension?.connections?.() ?? [];
    controller.browserPairings = () => options.browserPairing?.list() ?? [];
    controller.connectBrowser = async ({browser, signal, requestApproval = false} = {}) => {
      const connected = extension?.connections?.() ?? [];
      const matches = connected.filter(item => !browser || browser === 'external' || [item.instanceId, 'extension:' + item.instanceId, item.label].includes(browser) || item.label.toLowerCase().includes(String(browser).toLowerCase()));
      if (matches.length && (!requestApproval || browser && browser !== 'external')) return {connected: true};
      if (!extension || !options.browserPairing) throw Object.assign(new Error('Browser extension connections are disabled.'), {code: 'EXTENSION_UNAVAILABLE'});
      return options.browserPairing.request(browser, signal, requestApproval ? {excludeInstanceIds: connected.map(item => item.instanceId)} : undefined);
    };
    controller.forgetBrowser = ({instanceId}) => extension?.forget(instanceId);
    controller.openBrowserSettings = async ({ instanceId, section }) => {
      if (!extension) throw new Error('No browser extension backend is available');
      return extension.openSettings(instanceId, section);
    };
    controller.disconnectBrowser = async ({ instanceId }) => {
      if (!extension) throw new Error('No browser extension backend is available');
      return extension.disconnect(instanceId);
    };
    if (extension) controller.extensionRequest = createExtensionMountHook(extension);
    controller.permissions = async () => ({ ok: true, permissions: typeof native?.permissions === 'function' ? await native.permissions() : null,
      supported: typeof native?.permissions === 'function', warnings });
    controller.openPermissionSettings = async args => {
      if (typeof native?.openPermissionSettings !== 'function') throw Object.assign(new Error('Native permission settings are not supported by this backend'), { code: 'UNSUPPORTED_METHOD' });
      return { ok: true, ...await native.openPermissionSettings(args?.permission) };
    };
    controller.requestPermission = async args => {
      if (typeof native?.requestPermission !== 'function') throw Object.assign(new Error('Native permission requests are not supported by this backend'), { code: 'UNSUPPORTED_METHOD' });
      return { ok: true, ...await native.requestPermission(args?.permission) };
    };
    controller.revealPermissionHelper = async () => {
      if (typeof native?.revealPermissionHelper !== 'function') throw Object.assign(new Error('The native permission helper is unavailable'), { code: 'UNSUPPORTED_METHOD' });
      return { ok: true, ...await native.revealPermissionHelper() };
    };
    return controller;
  } catch (error) {
    await Promise.allSettled([browser?.close?.(), native?.close?.(), extension?.close?.()]);
    throw error;
  }
}
