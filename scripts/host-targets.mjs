export const hostTargets = Object.freeze({
  '0.2.1-rc.1': { commit: '1600d8a1e140dcde43a1a0941940a0480712c011', cordisVersion: '4.0.5', schemaVersion: '3.18.5' },
  '0.2.1-rc.2': { commit: '687f282e8625c6b8d11ff58211a90524be2e4317', cordisVersion: '4.0.5', schemaVersion: '3.18.5' },
});

export function hostTarget(version) {
  const target = hostTargets[version];
  if (!target) throw new Error(`Unsupported DSH build target: ${version}`);
  return target;
}

export function frameworkVersions(version) {
  const target = hostTarget(version);
  return {
    '@deepseek-ai/cordis': target.cordisVersion,
    '@deepseek-ai/schemastery': target.schemaVersion,
    '@deepseek-ai/cosmokit': '1.8.6',
    '@deepseek-ai/cordis-plugin-group': '1.0.5',
    '@deepseek-ai/cordis-plugin-hmr': '1.0.20',
    '@deepseek-ai/cordis-plugin-include': '1.0.10',
    '@deepseek-ai/cordis-plugin-loader': '1.0.6',
    '@deepseek-ai/cordis-plugin-logger-console': '1.0.5',
    '@deepseek-ai/cordis-plugin-timer': '1.1.7',
  };
}
