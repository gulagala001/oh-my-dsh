import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('both languages offer only the existing host-matched public release assets', async () => {
  const pkg = JSON.parse(await read('package.json')), snapshot = JSON.parse(await read('vendor/opencu.json'));
  const publicHosts = ['0.2.0-rc.2', '0.2.1-alpha.1'];
  assert.equal(pkg.omdReleaseStatus, 'unpublished');
  assert.equal(pkg.version, `${pkg.devDependencies['@deepseek-ai/dsh']}.omd.0.16.0`);
  assert.equal(JSON.parse(await read('vendor/opencu/package.json')).version, snapshot.version);
  for (const file of ['README.md', 'README_EN.md', 'docs/index.html', 'docs/index_EN.html', 'docs/upgrade.md', 'docs/upgrade_EN.md']) {
    const text = await read(file);
    assert.ok(text.includes(pkg.version), `${file}: identifies the unpublished source version`);
    assert.match(text, /未.{0,8}(发布|发行)|unpublished|unreleased|not.{0,16}released/i, file);
    for (const host of publicHosts) {
      const version = `${host}.omd.0.10.0`;
      const asset = `https://github.com/gulagala001/oh-my-dsh/releases/download/v${version}/trisoul_x-${version}.tgz`;
      assert.ok(text.includes(asset), `${file}: the fixed ${host} asset is available`);
    }
    assert.ok(!text.includes('/releases/latest'), `${file}: GitHub latest is an older release`);
    assert.ok(!new RegExp(`/(?:tag|download)/v${pkg.version.replaceAll('.', '\\.')}[/\\s)]?`).test(text), `${file}: no invented source-version release`);
    for (const command of text.matchAll(/@deepseek-ai\/dsh@([\w.-]+) plugin[^\n]+add (https:\/\/github.com\/gulagala001\/oh-my-dsh\/releases\/download\/v([^/]+)\/trisoul_x-([^\s<]+)\.tgz)/g)) {
      assert.equal(command[3], `${command[1]}.omd.0.10.0`, `${file}: command host matches release`);
      assert.equal(command[4], command[3], `${file}: asset and release versions match`);
    }
  }
});

test('primary documentation has complete paired language entry points and identical release URLs', async () => {
  for (const name of ['README', 'docs/README', 'docs/usage', 'docs/upgrade', 'docs/getting-started', 'docs/showcase', 'docs/troubleshooting', 'docs/plugin-compatibility', 'docs/development']) {
    const zh = await read(`${name}.md`), en = await read(`${name}_EN.md`);
    assert.ok(zh.length > 100 && en.length > 100, name);
    const links = source => [...new Set([...source.matchAll(/https:\/\/github.com\/gulagala001\/[^\s)"<>]+\/releases\/download\/[^\s)"<>]+/g)].map(match => match[0]))].sort();
    assert.deepEqual(links(zh), links(en), `${name}: download URLs match between languages`);
  }
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
  for (const file of ['README.md', 'README_EN.md', 'CONTRIBUTING.md', ...docs]) {
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
