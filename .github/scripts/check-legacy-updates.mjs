// Run the shipped clients' discovery code and inspect the actual upgrade archives on Windows.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateManifest, versionStatus} from '../../src/version.mjs';

const feed = JSON.parse(await readFile(new URL('../../release-manifest.json', import.meta.url)));
const archives = new Map();
const originalDigests = [
  'de490f8a01cfb3c0e2ae152da6cfa0a674ddc93832f03c92fbeae57b3260c3b7',
  '76b8b666897f567d36fb476b6fa7543ceda4ec8d244b128b629b697b24294a92',
  '6d73013f22193ec50ab09c82843682756c02c654bf082532630211af76cb8763',
];
const root = await mkdtemp(join(tmpdir(), 'omd-updates-'));
async function download(version, pinned) {
  if (archives.has(version)) return archives.get(version);
  const name = 'oh-my-dsh-' + version + '.tgz';
  const base = 'https://github.com/gulagala001/oh-my-dsh/releases/download/v' + version + '/';
  const read = async file => {
    const response = await fetch(base + file, {signal: AbortSignal.timeout(90000)});
    assert.equal(response.status, 200, base + file);
    return response;
  };
  const meta = await (await read('metadata.json')).json();
  assert.equal(meta.filename, name);
  assert.equal(meta.version, version);
  const bytes = Buffer.from(await (await read(name)).arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, meta.sha256);
  if (pinned) assert.equal(digest, pinned);
  const path = join(root, name);
  await writeFile(path, bytes);
  const dir = join(root, version);
  await mkdir(dir);
  execFileSync('tar', ['-xzf',path,'-C',dir,'package/package.json','package/release-manifest.json','package/src/version.mjs']);
  assert.equal(JSON.parse(await readFile(join(dir,'package/package.json'))).version, version);
  archives.set(version,dir);
  return dir;
}
try {
  for (const [index, hash] of originalDigests.entries()) {
    const host = '0.2.2-rc.' + (index + 3), old = host + '.omd.1.8.1';
    const dir = await download(old,hash);
    const legacy = await import(pathToFileURL(join(dir,'package/src/version.mjs')));
    // Replay precisely the manifest this workflow is publishing. The package URLs below are public.
    const chosen = legacy.versionStatus(old,legacy.validateManifest(feed),{hostVersion:host});
    assert.equal(chosen.status,'update');
    assert.equal(legacy.updateHostRequirement(old,chosen.latestVersion,host),null);
    await download(chosen.latestVersion);
    const next = versionStatus(chosen.latestVersion,validateManifest(feed),{hostVersion:host});
    if (next.status==='update') await download(next.latestVersion);
    console.log(old,'->',chosen.latestVersion,'->',next.latestVersion);
  }
} finally { await rm(root,{recursive:true,force:true}); }
