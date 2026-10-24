import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const repository = (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/^https:\/\/github.com\//, '');
const privateAsset = name => /\.log$|(?:^|[-_.])(?:verification|validation|benchmark|handoff|research|evidence|plan)(?:[-_.]|$)|^(?:AGENTS|CLAUDE|AI_README|PLAN|REFERENCE)\.md$/i.test(name);
const args = process.argv.slice(2);
let assets = [], currentRelease;
if (args[0] === '--dir' && args.length === 2) assets = readdirSync(resolve(args[1])).map(name => ({ name }));
else if (!args.length) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw Error('GitHub repository metadata is required');
  for (let page = 1; ; page++) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Release inventory unavailable: HTTP ${response.status}`);
    const releases = await response.json();
    for (const release of releases) {
      assets.push(...release.assets.map(asset => ({ name: asset.name, tag: release.tag_name })));
      if (release.tag_name === 'v' + pkg.version) currentRelease = release;
    }
    if (releases.length < 100) break;
  }
} else throw Error('Usage: check-release-assets.mjs [--dir DIRECTORY]');
const bad = assets.filter(asset => privateAsset(asset.name));
if (bad.length) throw Error('Internal release attachments: ' + bad.map(asset => [asset.tag, asset.name].filter(Boolean).join('/')).join(', '));
console.log(`Release attachment names passed (${assets.length} assets). Archive contents are checked by the package gate.`);

// Check the exact contract consumed by the live updater before upload and on
// the current published release. Historical attachment layouts stay archived.
if (args[0] === '--dir' || currentRelease) {
  const filename = pkg.name + '-' + pkg.version + '.tgz';
  const local = args[0] === '--dir';
  const source = local ? null : new Map(currentRelease.assets.map(asset => [asset.name, asset]));
  const read = async name => {
    if (local) return readFileSync(resolve(args[1], name), 'utf8');
    const asset = source.get(name);
    const expected = 'https://github.com/' + repository + '/releases/download/v' + pkg.version + '/' + name;
    if (asset?.state !== 'uploaded' || asset.browser_download_url !== expected) throw Error('Missing or invalid updater attachment: ' + name);
    const response = await fetch(expected, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error('Cannot read updater attachment: ' + name);
    return response.text();
  };
  const metadata = JSON.parse(await read('metadata.json'));
  if (metadata.schema !== 1 || metadata.name !== pkg.name || metadata.version !== pkg.version
    || metadata.hostVersion !== pkg.engines.dsh || metadata.file !== filename || metadata.filename !== filename
    || !/^[a-f0-9]{64}$/.test(metadata.sha256) || !/^[a-f0-9]{40}$/.test(metadata.sourceCommit))
    throw Error('Updater metadata does not match this exact package');
  const digest = local ? createHash('sha256').update(readFileSync(resolve(args[1], filename))).digest('hex')
    : source.get(filename)?.digest?.replace(/^sha256:/, '');
  if (digest !== metadata.sha256) throw Error('Updater package SHA256 mismatch');
  const sums = (await read('SHA256SUMS')).split(/\r?\n/);
  if (sums.filter(line => line === metadata.sha256 + '  ' + filename).length !== 1) throw Error('Updater checksum manifest mismatch');
  console.log('Current updater attachment contract passed.');
}
