export const hostTargets = Object.freeze({
  "0.2.2-rc.2": {"commit":"ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c","cordisVersion":"4.1.0","schemaVersion":"3.19.0","framework":{"@deepseek-ai/cordis":"4.1.0","@deepseek-ai/schemastery":"3.19.0","@deepseek-ai/cosmokit":"1.9.0","@deepseek-ai/cordis-plugin-group":"1.1.0","@deepseek-ai/cordis-plugin-hmr":"1.1.0","@deepseek-ai/cordis-plugin-include":"1.1.0","@deepseek-ai/cordis-plugin-loader":"1.1.0","@deepseek-ai/cordis-plugin-logger-console":"1.1.0","@deepseek-ai/cordis-plugin-timer":"1.2.0"}},
  "0.2.2-rc.1": {"source":{"repository":"https://github.com/deepseek-ai/deepseek-harness","tag":"dsh-v0.2.2-alpha.3","commit":"05b1cae8db6e674c5685101494d4eec24652424a","version":"0.2.2-alpha.3"},"commit":"c59d10aff167ad7eefead4b3a9082fb57c8fbfe8","cordisVersion":"4.1.0","schemaVersion":"3.19.0","framework":{"@deepseek-ai/cordis":"4.1.0","@deepseek-ai/schemastery":"3.19.0","@deepseek-ai/cosmokit":"1.9.0","@deepseek-ai/cordis-plugin-group":"1.1.0","@deepseek-ai/cordis-plugin-hmr":"1.1.0","@deepseek-ai/cordis-plugin-include":"1.1.0","@deepseek-ai/cordis-plugin-loader":"1.1.0","@deepseek-ai/cordis-plugin-logger-console":"1.1.0","@deepseek-ai/cordis-plugin-timer":"1.2.0"}},
  "0.2.2-alpha.3": {"commit":"05b1cae8db6e674c5685101494d4eec24652424a","cordisVersion":"4.0.6-alpha.2","schemaVersion":"3.18.6-alpha.2","framework":{"@deepseek-ai/cordis":"4.0.6-alpha.2","@deepseek-ai/schemastery":"3.18.6-alpha.2","@deepseek-ai/cosmokit":"1.8.7-alpha.2","@deepseek-ai/cordis-plugin-group":"1.0.6-alpha.2","@deepseek-ai/cordis-plugin-hmr":"1.0.21-alpha.2","@deepseek-ai/cordis-plugin-include":"1.0.11-alpha.2","@deepseek-ai/cordis-plugin-loader":"1.0.7-alpha.2","@deepseek-ai/cordis-plugin-logger-console":"1.0.6-alpha.2","@deepseek-ai/cordis-plugin-timer":"1.1.8-alpha.2"}},
  "0.2.2-alpha.2": {"commit": "f3803c96974ad4a94195fb97e5c637e9c2a3afe3", "cordisVersion": "4.0.6-alpha.1", "schemaVersion": "3.18.6-alpha.1", "framework": {"@deepseek-ai/cordis-plugin-logger-console": "1.0.6-alpha.1", "@deepseek-ai/cordis-plugin-group": "1.0.6-alpha.1", "@deepseek-ai/cordis-plugin-hmr": "1.0.21-alpha.1", "@deepseek-ai/cordis-plugin-include": "1.0.11-alpha.1", "@deepseek-ai/cosmokit": "1.8.7-alpha.1", "@deepseek-ai/cordis-plugin-timer": "1.1.8-alpha.1", "@deepseek-ai/cordis-plugin-loader": "1.0.7-alpha.1", "@deepseek-ai/cordis": "4.0.6-alpha.1", "@deepseek-ai/schemastery": "3.18.6-alpha.1"}},
  '0.2.1-rc.5': { commit: 'b830ec950faba0a46dda564be3e2d854afed94f1', cordisVersion: '4.0.5', schemaVersion: '3.18.5' },
  '0.2.1-rc.3': { commit: '1f81c047fc48fa190a683e469daa699857e9afe8', cordisVersion: '4.0.5', schemaVersion: '3.18.5' },
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
    ...target.framework,
  };
}
