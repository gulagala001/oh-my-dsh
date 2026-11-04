import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Reuse a pinned source snapshot only when every published implementation and
// declaration file in the reviewed packages is identical for the target SDK.
// Source provenance remains its original tag/commit; target identity is separate.
export async function verifyHostArtifacts(root, snapshot) {
  if (!snapshot.buildTarget) return;
  const bytes = await readFile(join(root, 'vendor/host-artifacts.json'));
  if (sha256(bytes) !== snapshot.buildTarget.artifactContractSha256) throw Error('Host artifact contract changed');
  const contract = JSON.parse(bytes), pkg = JSON.parse(await readFile(join(root, 'package.json')));
  if (contract.schema !== 1 || !contract.packages?.length || contract.target.version !== pkg.engines.dsh
    || contract.target.version !== snapshot.buildTarget.version || contract.target.officialBuildCommit !== snapshot.buildTarget.officialBuildCommit
    || ['repository', 'tag', 'commit', 'version'].some(key => contract.source[key] !== snapshot[key])) throw Error('Host artifact source/target mismatch');
  const wanted = new Set(contract.packages.map(p => p.name)), located = new Map(), queue = [join(root, 'package.json')], visited = new Set();
  while (queue.length && located.size < wanted.size) {
    const owner = queue.shift(); if (visited.has(owner)) continue; visited.add(owner);
    const require = createRequire(owner), parent = JSON.parse(await readFile(owner));
    if (wanted.has(parent.name)) located.set(parent.name, owner);
    for (const name of Object.keys({ ...parent.dependencies, ...parent.peerDependencies, ...(owner === join(root, 'package.json') ? parent.devDependencies : {}) })) {
      if (!name.startsWith('@deepseek-ai/')) continue;
      try { const path = require.resolve(name + '/package.json'); if (!visited.has(path)) queue.push(path); }
      catch (error) { if (!['MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(error.code)) throw error; }
    }
  }
  for (const entry of contract.packages) {
    const path = located.get(entry.name); if (!path) throw Error('Missing reviewed host artifact: ' + entry.name);
    const installed = JSON.parse(await readFile(path));
    if (installed.name !== entry.name || installed.version !== entry.target.version || !Object.keys(entry.files).length) throw Error('Host artifact version mismatch: ' + entry.name);
    const seen = new Set(), base = dirname(path);
    const walk = async (dir, prefix) => { for (const item of await readdir(dir, { withFileTypes: true })) {
      const name = prefix + item.name, file = join(dir, item.name);
      if (item.isDirectory()) await walk(file, name + '/');
      else { if (!item.isFile() || !entry.files[name] || sha256(await readFile(file)) !== entry.files[name]) throw Error('Host artifact bytes changed: ' + entry.name + '/' + name); seen.add(name); }
    } };
    for (const name of ['lib', 'src']) { try { await walk(join(base, name), name + '/'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    if (seen.size !== Object.keys(entry.files).length) throw Error('Host artifact file inventory changed: ' + entry.name);
  }
}
