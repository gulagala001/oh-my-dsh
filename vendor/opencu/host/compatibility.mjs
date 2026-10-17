export const hostTargets = Object.freeze({
  rc2: { version: '0.2.0-rc.2', commit: '639ed015397290b3745d163aafe02ffee4aa3f84', cordis: '4.0.4', schema: '3.18.4' },
  alpha3: { version: '0.2.1-alpha.3', commit: '2fbf4359b82fb94c03dcce0b831660d87f12ea5c', cordis: '4.0.5-alpha.2', schema: '3.18.5-alpha.2' },
  rc1: { version: '0.2.1-rc.1', commit: '1600d8a1e140dcde43a1a0941940a0480712c011', cordis: '4.0.5', schema: '3.18.5', electron: '44.7.0' },
});
export const adapterRevision = 2;
export const browserCapabilities = Object.freeze(['downloads', 'permissions', 'automation', 'extensions', 'profile']);
export function targetFor(version) {
  const entry = Object.entries(hostTargets).find(([, target]) => target.version === version);
  if (!entry) throw new Error(`Unsupported OpenCU host build: ${version}`);
  return { id: entry[0], ...entry[1] };
}
