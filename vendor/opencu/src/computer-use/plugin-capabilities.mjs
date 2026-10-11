const limitations = Object.freeze({
  embeddedBrowser: 'The official DSH plugin API does not expose its embedded browser for automation. Use the plugin-managed browser or a connected browser extension.',
  nativePresentation: 'The official DSH plugin API does not expose a native window host. Standard plugin previews remain available.',
  browserHistory: 'The official DSH plugin API does not expose the embedded browser history database. Conversation visit records are a separate feature.',
  downloadHistory: 'The official DSH plugin API does not expose the embedded browser download database. Plugin-managed downloads are a separate feature.',
  siteInformation: 'The official DSH plugin API does not expose the native embedded-browser site-information dialog.',
  browserPermissions: 'The official DSH plugin API does not expose native embedded-browser permission prompts. DSH tool approval remains separate.',
});

export function unavailablePluginCapability(capability) {
  return { available: false, code: 'HOST_CAPABILITY_UNAVAILABLE', capability,
    reason: limitations[capability] ?? 'This capability has no supported official DSH plugin interface.' };
}

export function pluginCapabilityError(capability) {
  const state = unavailablePluginCapability(capability);
  return Object.assign(new Error(state.reason), { code: state.code, capability, statusCode: 501 });
}

export function pluginCapabilities() {
  return { delivery: 'dsh-plugin', requiresHostPatch: false, requiresCustomBrowserEngine: false,
    browserAutomation: { implementation: 'plugin-owned-electron-and-extension', embeddedInHost: false },
    host: Object.fromEntries(Object.keys(limitations).map(key => [key, unavailablePluginCapability(key)])) };
}

export function nativeBrowserCapabilities() {
  return { available: false, browserId: null, browserEpoch: null,
    history: unavailablePluginCapability('browserHistory'), downloads: unavailablePluginCapability('downloadHistory'),
    permissions: unavailablePluginCapability('browserPermissions'), siteInfo: [],
    siteInformation: unavailablePluginCapability('siteInformation'),
    embeddedBrowser: unavailablePluginCapability('embeddedBrowser') };
}
