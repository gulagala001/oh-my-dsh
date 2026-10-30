export const hostTargets = Object.freeze({
  '021rc5': { version: '0.2.1-rc.5', commit: 'b830ec950faba0a46dda564be3e2d854afed94f1', cordis: '4.0.5', schema: '3.18.5', electron: '44.7.0' },
  '021rc3': { version: '0.2.1-rc.3', commit: '1f81c047fc48fa190a683e469daa699857e9afe8', cordis: '4.0.5', schema: '3.18.5', electron: '44.7.0' },
  rc1: { version: '0.2.1-rc.1', commit: '1600d8a1e140dcde43a1a0941940a0480712c011', cordis: '4.0.5', schema: '3.18.5', electron: '44.7.0' },
  '021rc2': { version: '0.2.1-rc.2', commit: '687f282e8625c6b8d11ff58211a90524be2e4317', cordis: '4.0.5', schema: '3.18.5', electron: '44.7.0' },
});
export const adapterRevision = 2;
export const browserCapabilities = Object.freeze(['downloads', 'permissions', 'automation', 'extensions', 'profile']);
export function targetFor(version) {
  const entry = Object.entries(hostTargets).find(([, target]) => target.version === version);
  if (!entry) throw new Error(`Unsupported OpenCU host build: ${version}`);
  return { id: entry[0], ...entry[1] };
}
