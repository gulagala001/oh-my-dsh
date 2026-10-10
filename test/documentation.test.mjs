import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('installation docs distinguish the unpublished candidate from the fixed public release', async () => {
  const pkg = JSON.parse(await read('package.json')), opencu = JSON.parse(await read('vendor/opencu.json'));
  const host = pkg.devDependencies['@deepseek-ai/dsh'];
  const readme = await read('README.md'), upgrade = await read('docs/upgrade.md');
  const publicPair = /公开安装版本：\*\*OMD ([\w.+-]+) \/ DSH ([\w.+-]+)\*\*/.exec(readme);
  assert.ok(publicPair, 'README explicitly identifies the public installation version');
  const publicVersion = publicPair[1];
  const publicHost = '0.2.1-alpha.1';
  assert.equal(publicPair[2], publicHost, 'the public release keeps its verified host identity');
  assert.equal(publicVersion, `${publicHost}.omd.0.10.0`, 'the verified public release is fixed, not an arbitrary tag');
  assert.equal(pkg.version, `${host}.omd.0.15.0`, 'current unpublished candidate');
  assert.equal(pkg.omdReleaseStatus, 'unpublished', 'candidate is not a public release');
  assert.equal(opencu.version, '1.6.0', 'candidate bundles the required OpenCU version');
  assert.equal(JSON.parse(await read('vendor/opencu/package.json')).version, opencu.version, 'snapshot package agrees with its manifest');
  const badge = /https:\/\/img\.shields\.io\/badge\/version-(.*?)-3478F6\?/.exec(readme)?.[1];
  assert.equal(badge, pkg.version.replaceAll('-', '--'), 'visible candidate version badge');
  assert.ok(readme.includes(`href="docs/release-${pkg.version}.md"`), 'badge links to the local candidate notes');
  for (const file of ['README.md', 'docs/index.html', 'docs/usage.md', 'docs/upgrade.md', 'docs/windows.md']) {
    const text = await read(file);
    const targets = [...text.matchAll(/github:gulagala001\/oh-my-dsh#v([\w.+-]+)/g)].map(match => match[1]);
    assert.deepEqual([...new Set(targets)], [publicVersion], file + ': public installation commands use the explicitly identified release');
    assert.ok(text.includes(`@deepseek-ai/dsh@${publicHost}`), file + ': public host target');
    assert.ok(text.includes(pkg.version), file + ': identifies the current candidate');
    assert.ok(/候选/.test(text) && /未(?:正式)?发布|尚未发布/.test(text), file + ': states the candidate status');
    assert.ok(!text.includes(`/tag/v${pkg.version}`) && !text.includes(`/blob/v${pkg.version}/`) && !text.includes(`/tree/v${pkg.version}/`), file + ': no future online release links');
  }
  const candidates = [...upgrade.matchAll(/file:\/absolute\/path\/trisoul_x-([\w.+-]+)\.tgz/g)].map(match => match[1]);
  assert.deepEqual(candidates, [pkg.version], 'local candidate package has the exact full version');
  assert.ok(upgrade.includes(`@deepseek-ai/dsh@${host} plugin --profile candidate add file:/absolute/path/trisoul_x-${pkg.version}.tgz`), 'candidate installation uses its matching host');
  assert.ok(upgrade.split('\n').some(line => line.startsWith('| Oh My DSH 当前候选 |') && line.includes(`**${pkg.version}**`)), 'candidate upgrade table');
  assert.ok(upgrade.split('\n').some(line => line.startsWith('| Oh My DSH 公开安装版本 |') && line.includes(`**${publicVersion}**`)), 'public upgrade table');
  assert.ok(upgrade.split('\n').some(line => line.startsWith('| 内置 OpenCU |') && line.includes(`**${opencu.version}**`)), 'bundled OpenCU in upgrade table');
  const index = await read('docs/README.md');
  assert.ok(index.includes(`**OMD ${pkg.version} / DSH ${host}**`), 'documentation index candidate pair');
  assert.ok(index.includes(`**OpenCU ${opencu.version}**`), 'documentation index bundled component');
  const release = await read(`docs/release-${pkg.version}.md`);
  assert.ok(release.includes(`DSH **${host}**`) && release.includes(`OpenCU ${opencu.version}`), 'candidate notes match package and bundled component');
});

// These documents use ATX headings and explicit HTML anchors. Match their
// GitHub fragments, including duplicate headings, without installing a docs toolchain.
function anchors(text) {
  const source = text.replace(/```[^]*?```/g, '');
  const ids = new Set([...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const headings = new Set();
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/<[^>]*>/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-');
    let id = base, i = 0; while (headings.has(id)) id = base + '-' + ++i;
    headings.add(id); ids.add(id);
  }
  return ids;
}

test('current user docs link to existing local files and sections', async () => {
  const missing = [];
  for (const file of JSON.parse(await read('screenshots.json'))) {
    try { await access(new URL('../' + file, import.meta.url)); }
    catch { missing.push(`screenshots.json -> ${file}`); }
  }
  const docs = (await readdir(new URL('../docs/', import.meta.url)))
    .filter(file => file.endsWith('.md') && !file.startsWith('release-') && !file.endsWith('-research.md')).map(file => 'docs/' + file);
  for (const file of ['README.md', 'CONTRIBUTING.md', ...docs]) {
    const text = (await read(file)).replace(/```[^]*?```/g, '');
    for (const match of text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)|(?:href|src)="([^"]+)"/g)) {
      const target = (match[1] || match[2]).replace(/^<|>$/g, '');
      if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue;
      try {
        const destination = new URL(target, new URL('../' + file, import.meta.url));
        await access(destination);
        if (destination.hash && destination.pathname.endsWith('.md')) {
          const fragment = decodeURIComponent(destination.hash.slice(1));
          if (!anchors(await readFile(destination, 'utf8')).has(fragment)) missing.push(`${file} -> ${target} (missing section)`);
        }
      }
      catch { missing.push(`${file} -> ${target}`); }
    }
  }
  assert.deepEqual(missing, []);
});
