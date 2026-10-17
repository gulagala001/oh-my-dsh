import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const pluginSource = source.match(/\{ name: 'opencu-factory', setup\(b\) \{[\s\S]*?\n  \} \}/)?.[0];
assert.ok(pluginSource, 'the actual build must retain the scoped OpenCU resolver');
const resolvers = [];
runInNewContext(`(${pluginSource})`).setup({ onResolve(options, resolve) { resolvers.push({ ...options, resolve }); } });
assert.equal(resolvers.length, 2);
function resolve(path, importer, kind = 'dynamic-import') {
  return resolvers.filter(row => row.filter.test(path)).map(row => row.resolve({ path, importer, kind })).find(Boolean);
}

test('factory dynamic asset imports remain external on POSIX and Windows', () => {
  for (const importer of ['/repo/vendor/opencu/lib/client.factory.mjs', 'D:\\a\\oh-my-dsh\\vendor\\opencu\\lib\\client.factory.mjs']) {
    for (const path of ['/api/opencu/rea-assets/abap-4341a951e10d.js', './rea-assets/chunk.js']) {
      const result = resolve(path, importer);
      assert.equal(result?.path, path);
      assert.equal(result?.external, true);
    }
  }
});

test('other importers and static imports are never made external by the factory exception', () => {
  for (const importer of ['/repo/src/client/index.jsx', 'D:\\repo\\src\\client\\index.jsx', '/repo/vendor/opencu/lib/client.factory.mjs.bak', '/repo/not-vendor/opencu/lib/client.factory.mjs']) {
    for (const path of ['/api/opencu/rea-assets/chunk.js', './chunk.js']) assert.equal(resolve(path, importer), undefined);
  }
  for (const importer of ['/repo/vendor/opencu/lib/client.factory.mjs', 'D:\\repo\\vendor\\opencu\\lib\\client.factory.mjs']) {
    assert.equal(resolve('/api/opencu/rea-assets/chunk.js', importer, 'import-statement'), undefined);
    assert.equal(resolve('./chunk.js', importer, 'require-call'), undefined);
    assert.equal(resolve('/api/other/chunk.js', importer), undefined);
    assert.equal(resolve('some-package', importer), undefined);
  }
});
