import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';

const run = promisify(execFile), archive = process.env.OMD_OPEN_DESIGN_SOURCE_ARCHIVE;
const hash = data => createHash('sha256').update(data).digest('hex');
test('pinned adapter preserves upstream resources and licenses, includes the checker and packs reproducibly', {
  skip: !archive && 'Set OMD_OPEN_DESIGN_SOURCE_ARCHIVE to the reviewed source archive', timeout: 30000,
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-od-pack-')); t.after(() => rm(root, { recursive: true, force: true }));
  const script = new URL('../scripts/package-open-design.py', import.meta.url).pathname;
  const builds = [];
  for (const name of ['first', 'second']) {
    const { stdout } = await run('python3', [script, archive, join(root, name)]);
    builds.push(JSON.parse(stdout));
  }
  assert.equal(builds[0].sha256, builds[1].sha256);
  assert.deepEqual(await readFile(builds[0].tgz), await readFile(builds[1].tgz));
  const packageRoot = builds[0].package;
  const manifest = JSON.parse(await readFile(join(root, 'first', 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'dsh-open-design'); assert.equal(pkg.version, '0.1.0-omd.1.0.0');
  assert.equal(pkg.private, true); assert.equal(pkg.dependencies, undefined); assert.equal(pkg.scripts, undefined);
  assert.equal(manifest.skillCount, 52); assert.equal(Object.keys(manifest.componentLicenses).length, 15);
  const { stdout } = await run('python3', ['-c', `import tarfile,hashlib,json,sys
with tarfile.open(sys.argv[1]) as t:
 print(json.dumps({m.name.split('/',1)[1]:hashlib.sha256(t.extractfile(m).read()).hexdigest() for m in t.getmembers() if m.isfile()}))`, archive], { maxBuffer: 1024 * 1024 });
  const source = JSON.parse(stdout), changed = [];
  for (const [name, digest] of Object.entries(source)) {
    if (!name.startsWith('dsh-open-design/')) continue;
    const installed = name.slice('dsh-open-design/'.length);
    const actual = hash(await readFile(join(packageRoot, installed)));
    if (actual !== digest) changed.push(installed);
  }
  assert.deepEqual(changed.sort(), ['package.json', 'skills/open-design/SKILL.md']);
  for (const [name, from] of [['LICENSE', 'LICENSE'], ['NOTICE', 'NOTICE'], ['UPSTREAM_README.md', 'README.md'], ['tools/od-check.mjs', 'tools/od-check.mjs']]) {
    assert.equal(hash(await readFile(join(packageRoot, name))), source[from], name);
  }
  for (const [name, digest] of Object.entries(manifest.files)) assert.equal(hash(await readFile(join(packageRoot, name))), digest, name);
  for (const skill of manifest.skills) {
    const text = await readFile(join(packageRoot, 'skills', skill, 'SKILL.md'), 'utf8');
    const front = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] || '');
    assert.equal(front.name, skill); assert.match(front.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(typeof front.description, 'string'); assert.ok(front.description.trim());
  }
  const router = await readFile(join(packageRoot, 'skills/open-design/SKILL.md'), 'utf8');
  assert.match(router, /\.\.\/\.\.\/tools\/od-check\.mjs/); assert.doesNotMatch(router, /`node tools\/od-check/);
  const wrong = join(root, 'wrong.tar.gz');
  await import('node:fs/promises').then(fs => fs.writeFile(wrong, 'not the reviewed archive'));
  await assert.rejects(run('python3', [script, wrong, join(root, 'rejected')]), /SHA-256 mismatch/);
});
