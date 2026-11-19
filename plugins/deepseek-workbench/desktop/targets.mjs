import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const current = { cordisVersion: '4.1.0', schemaVersion: '3.19.0' };
const hostTargets = Object.freeze({
  '0.2.1-rc.2': { cordisVersion: '4.0.5', schemaVersion: '3.18.5' },
  '0.2.2-rc.3': current,
  '0.2.2-rc.4': current,
  '0.2.2-rc.5': current,
});

export async function readHostTarget(root) {
  const readManifest = async (...parts) => JSON.parse(await readFile(join(root, ...parts, 'package.json'), 'utf8'));
  const { name, version } = await readManifest();
  if (name !== '@deepseek-ai/dsh-root' || !Object.hasOwn(hostTargets, version))
    throw new Error(`Workbench requires matching DSH source (${Object.keys(hostTargets).join(', ')})`);
  const target = hostTargets[version];
  for (const [name, expected] of [['cordis', target.cordisVersion], ['schemastery', target.schemaVersion]]) {
    if ((await readManifest('vendor', name)).version !== expected) throw new Error(`Workbench framework mismatch: ${name}`);
  }
  return version;
}
