import Schema from '@deepseek-ai/schemastery';

export const Config = Schema.object({
  dataDir: Schema.string().description('Private OpenCU data directory.'),
  browserEnabled: Schema.boolean().default(true).description('Enable the managed browser backend.').volatile(),
  managedHeadless: Schema.boolean().default(false).description('Explicitly enable a separate headless browser on the DSH server. This does not enable an embedded browser in a web client.').volatile(),
  nativeEnabled: Schema.boolean().default(true).description('Enable the supported native backend.').volatile(),
  extensionEnabled: Schema.boolean().default(true).description('Enable the browser extension connection.').volatile(),
  headless: Schema.boolean().default(false).description('Run the managed browser without a visible window.'),
  nativeRequired: Schema.boolean().default(false),
  helperPath: Schema.string().description('Packaged native helper override.'),
  cdpEndpoint: Schema.string().description('Optional existing browser CDP endpoint.'),
  registerTools: Schema.boolean().default(true).description('Register computer tools for ordinary sessions. Integrations can instead own scoped tool registration.'),
});

export function publicConfig(config = {}) {
  return Object.fromEntries(['browserEnabled', 'nativeEnabled', 'extensionEnabled', 'managedHeadless', 'headless', 'nativeRequired', 'registerTools'].map(key => [key, config[key] ?? (key.endsWith('Enabled') || key === 'registerTools')]));
}
