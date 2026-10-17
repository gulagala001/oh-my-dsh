export const hostTargets = Object.freeze({
  '0.2.0-rc.2': { commit: '639ed015397290b3745d163aafe02ffee4aa3f84', subagentDriver: true, cordisVersion: '4.0.4', schemaVersion: '3.18.4', frameworkSuffix: '' },
  '0.2.1-alpha.2': { commit: 'd743267388641bc76f17c45ce8b4c231aed1d32c', subagentDriver: false, cordisVersion: '4.0.5-alpha.1', schemaVersion: '3.18.5-alpha.1', frameworkSuffix: '-alpha.1' },
  '0.2.1-alpha.3': { commit: '2fbf4359b82fb94c03dcce0b831660d87f12ea5c', subagentDriver: false, cordisVersion: '4.0.5-alpha.2', schemaVersion: '3.18.5-alpha.2', frameworkSuffix: '-alpha.2' },
  '0.2.1-rc.1': { commit: '1600d8a1e140dcde43a1a0941940a0480712c011', subagentDriver: false, cordisVersion: '4.0.5', schemaVersion: '3.18.5', frameworkSuffix: '' },
  '0.2.1-rc.2': { commit: '687f282e8625c6b8d11ff58211a90524be2e4317', subagentDriver: false, cordisVersion: '4.0.5', schemaVersion: '3.18.5', frameworkSuffix: '' },
});

export function hostTarget(version) {
  const target = hostTargets[version];
  if (!target) throw new Error(`Unsupported DSH build target: ${version}`);
  return target;
}

export function frameworkVersions(version) {
  const target = hostTarget(version), modern = version !== '0.2.0-rc.2';
  const pick = (stable, current) => modern ? current + target.frameworkSuffix : stable;
  return {
    '@deepseek-ai/cordis': target.cordisVersion,
    '@deepseek-ai/schemastery': target.schemaVersion,
    '@deepseek-ai/cosmokit': pick('1.8.5', '1.8.6'),
    '@deepseek-ai/cordis-plugin-group': pick('1.0.4', '1.0.5'),
    '@deepseek-ai/cordis-plugin-hmr': pick('1.0.19', '1.0.20'),
    '@deepseek-ai/cordis-plugin-include': pick('1.0.9', '1.0.10'),
    '@deepseek-ai/cordis-plugin-loader': pick('1.0.5', '1.0.6'),
    '@deepseek-ai/cordis-plugin-logger-console': pick('1.0.4', '1.0.5'),
    '@deepseek-ai/cordis-plugin-timer': pick('1.1.6', '1.1.7'),
  };
}
