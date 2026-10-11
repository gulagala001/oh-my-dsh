import { pathToFileURL } from 'node:url';
if (process.platform === 'darwin') {
  for (const root of JSON.parse(process.env.OPENCU_FIXTURE_PLUGIN_ROOTS || '[]')) {
    const { PluginBrowserProvider } = await import(pathToFileURL(root + '/src/computer-use/plugin-browser-provider.mjs'));
    const start = PluginBrowserProvider.prototype.startProcess;
    PluginBrowserProvider.prototype.startProcess = function (...args) { this.useTestKeychain = true; return start.apply(this, args); };
  }
}
