// Reconcile the update feed on the default branch with complete, public release assets.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareVersions, validateManifest, versionStatus} from '../src/version.mjs';

const repo = 'gulagala001/oh-my-dsh';
const releaseRoot = 'https://github.com/' + repo + '/releases';
const versionPattern = /^v([\d.]+(?:-[\w.-]+)?\.omd\.(\d+\.\d+\.\d+))$/;
const identity = row => versionPattern.exec('v' + row.version);
const hostOf = row => row.version.split('.omd.')[0];
const publicBytes = async url => {
  const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw Error('Cannot read release asset ' + url + ' (HTTP ' + response.status + ')');
  return response.text();
};

export async function reconcile(feed, releases, readAsset = publicBytes, eventTag = '', report = message => { throw Error(message); }) {
  const rows = new Map(feed.releases.map(row => [row.version, {...row}]));
  const seen = new Set();
  const invalid = new Set();
  for (const release of releases) {
    const match = versionPattern.exec(release.tag_name);
    if (!match || release.draft || release.prerelease) continue;
    const [,version,product] = match;
    const file = 'oh-my-dsh-' + version + '.tgz', base = releaseRoot + '/download/' + release.tag_name + '/';
    const assets = new Map(release.assets.map(a => [a.name,a]));
    // Pre-rename archives use another package name and their historical feed policy.
    if (!assets.has(file) && compareVersions(product,'1.0.0') < 0) continue;
    const names = [file,'metadata.json','SHA256SUMS'];
    const ready = names.every(name => assets.get(name)?.state === 'uploaded' && assets.get(name).browser_download_url === base + name);
    if (!ready || !/^sha256:[a-f0-9]{64}$/.test(assets.get(file)?.digest ?? '')) {
      invalid.add(version);
      report('Incomplete updater attachments on ' + release.tag_name);
      continue;
    }
    const row = rows.get(version);
    if (!row || row.unpublished || release.tag_name === eventTag) {
      let raw, sums;
      try {
        [raw,sums] = await Promise.all([readAsset(base+'metadata.json'),readAsset(base+'SHA256SUMS')]);
      } catch (error) {
        report('Could not verify ' + version + ': ' + error.message);
        if (row && !row.unpublished) seen.add(version);
        continue;
      }
      let meta;
      try { meta = JSON.parse(raw); } catch { meta = null; }
      const hash = assets.get(file).digest.slice(7);
      if (meta?.schema !== 1 || meta.name !== 'oh-my-dsh' || meta.version !== version || meta.file !== file ||
        meta.filename !== file || meta.sha256 !== hash || !/^[a-f0-9]{40}$/.test(meta.sourceCommit) ||
        !sums.split(/\r?\n/).includes(hash + '  ' + file)) {
        invalid.add(version);
        report('Updater metadata mismatch on ' + version);
        continue;
      }
    }
    seen.add(version);
    if (row) { if (row.unpublished) row.unpublished = false; }
    else rows.set(version,{version,severity:'normal',unpublished:false,title:'Oh My DSH '+product,notes:[],releaseNotes:releaseRoot+'/tag/'+release.tag_name});
  }
  // Modern withdrawn releases must stop appearing as installable. Keep draft notes.
  for (const row of rows.values()) {
    const match=identity(row);
    if (invalid.has(row.version) || (match && compareVersions(match[2],'1.0.0')>=0 && !seen.has(row.version))) row.unpublished=true;
  }
  const ordered = [...rows.values()].filter(row=>seen.has(row.version)).sort((a,b)=>compareVersions(identity(b)[2],identity(a)[2]) || compareVersions(b.version,a.version));
  const newestByHost = new Map();
  for (const row of ordered) if (!newestByHost.has(hostOf(row))) newestByHost.set(hostOf(row),row.version);
  const keep = new Set(newestByHost.values());
  // Installed 1.8.1 constructs the URL and checks the returned identity literally.
  for (const rc of [3,4,5]) {
    const host='0.2.2-rc.'+rc, bridge=host+'.omd.1.9.0';
    if (!seen.has(bridge)) report('Missing published 1.8.1 upgrade route for '+host);
    keep.add(bridge);
  }
  const result = {...feed,releases:[...ordered,...[...rows.values()].filter(row=>!seen.has(row.version))]};
  const serialize = () => JSON.stringify(result,null,2)+'\n';
  // 1.8.1 reads at most 500 rows and 256 KiB. Retain each host's newest update and the migration entries.
  while (result.releases.length>500 || Buffer.byteLength(serialize())>256*1024) {
    const i=result.releases.findLastIndex(row=>seen.has(row.version) && !keep.has(row.version));
    if(i<0)throw Error('Cannot fit the update feed without removing a required migration');
    result.releases.splice(i,1);
  }
  const checked=validateManifest(result);
  for(const rc of [3,4,5]){
    const host='0.2.2-rc.'+rc;
    const status=versionStatus(host+'.omd.1.9.0',checked,{hostVersion:host});
    if(!seen.has(status.latestVersion)) report('Latest update has no public package for '+host);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file=new URL('../release-manifest.json',import.meta.url);
  const raw=await readFile(file,'utf8');
  const pages=JSON.parse(execFileSync('gh',['api','--paginate','--slurp','repos/'+repo+'/releases?per_page=100'],{encoding:'utf8',maxBuffer:64*1024*1024}));
  if (!pages.flat().length) throw Error('GitHub returned an empty release inventory');
  const issues=[];
  const next=JSON.stringify(await reconcile(JSON.parse(raw),pages.flat(),publicBytes,process.env.RELEASE_TAG, m=>issues.push(m)),null,2)+'\n';
  if (next!==raw) {
    if (!process.argv.includes('--write')) throw Error('Release feed is out of date. Run node scripts/sync-release-feed.mjs --write');
    await writeFile(file,next);
  }
  if (issues.length) { console.error(issues.join('\n')); process.exitCode=2; }
}
