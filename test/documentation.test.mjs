import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('installation docs and release badge describe the versions actually shipped', async () => {
  const pkg = JSON.parse(await read('package.json')), opencu = JSON.parse(await read('vendor/opencu.json'));
  const readme = await read('README.md'), upgrade = await read('docs/upgrade.md');
  const badge = /https:\/\/img\.shields\.io\/badge\/version-(.*?)-3478F6\?/.exec(readme)?.[1];
  assert.equal(badge, pkg.version.replaceAll('-', '--'), 'visible version badge');
  for (const file of ['README.md', 'docs/usage.md', 'docs/upgrade.md', 'docs/windows.md']) {
    const text = await read(file);
    const targets = [...text.matchAll(/github:gulagala001\/oh-my-dsh#v([\w.+-]+)/g)].map(match => match[1]);
    assert.deepEqual([...new Set(targets)], [pkg.version], file + ': every installation target matches the current release');
    assert.ok(text.includes(`@deepseek-ai/dsh@${pkg.devDependencies['@deepseek-ai/dsh']}`), file + ': host target');
  }
  assert.ok(upgrade.split('\n').some(line => line.startsWith('| 内置 OpenCU |') && line.includes(`**${opencu.version}**`)), 'bundled OpenCU in upgrade table');
  const index = await read('docs/README.md');
  assert.ok(index.includes(`**OMD ${pkg.version} / DSH ${pkg.devDependencies['@deepseek-ai/dsh']}**`), 'documentation index release pair');
  assert.ok(index.includes(`**OpenCU ${opencu.version}**`), 'documentation index bundled component');
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
