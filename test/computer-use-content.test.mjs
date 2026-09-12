import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { contentFixture } from './fixtures/computer-use/content.mjs';

for (const backend of ['managed', 'extension']) test(`${backend}: page assets and content export use real loaded bytes and survive turn cleanup`, { timeout: 45000, skip: backend === 'extension' && process.platform === 'win32' }, async t => {
  const fixture = await contentFixture(); t.after(() => fixture.close());
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-content-test-')), artifacts = new Set();
  const env = backend === 'extension' ? await extensionFixture(t, { fixture }) : null;
  const manager = new ComputerUseManager(root, { ...(env ? { extensionHub: env.hub } : {}), native: { binary: join(root, 'missing') } });
  t.after(async () => { await manager.close(); await Promise.all([root, ...artifacts].map(path => rm(path, { recursive: true, force: true }))); });
  const run = async code => { const r = await manager.execute('test', code); assert.equal(r.error, undefined, r.error?.message); return r; };
  const json = async code => JSON.parse((await run(code)).blocks.filter(block => block.type === 'text').at(-1).text);
  await run(`var tab = await cua.createBrowserTab(${JSON.stringify(env?.browser.id ?? 'browser')}, ${JSON.stringify(fixture.url)}); await tab.playwright.waitForLoadState('load'); var assets = await tab.capabilities.get('pageAssets');`);
  const inventory = await json('var inventory = await assets.list(); nodeRepl.write(JSON.stringify(inventory));');
  assert.equal(inventory.pageUrl, fixture.url + '/');
  const picture = inventory.assets.find(asset => asset.url.endsWith('/picture.png'));
  assert.ok(picture);
  assert.equal(inventory.assets.filter(asset => asset.url.endsWith('/picture.png')).length, 1, 'resource, DOM and shadow references deduplicate');
  assert.ok(picture.sources.some(source => source.kind === 'attribute'));
  assert.ok(inventory.assets.some(asset => asset.url.endsWith('/background.png') && asset.sources.some(source => source.kind === 'computedStyle')));
  assert.equal(inventory.assets.some(asset => asset.url.endsWith('/lazy.png')), false);
  assert.match(inventory.inlineSvgs[0].markup, /circle/);
  const bundle = await json("nodeRepl.write(JSON.stringify(await assets.bundle({inventoryId:inventory.id,kinds:['image','stylesheet']}))); ");
  artifacts.add(bundle.directoryPath);
  assert.equal(bundle.summary.requestedCount, 4);
  assert.equal(bundle.summary.downloadedCount, 3);
  assert.equal(bundle.summary.failedCount, 1);
  assert.match(bundle.failures[0].url, /missing\.png$/);
  for (const item of bundle.assets) {
    // Windows exposes synthesized mode bits, not POSIX per-user permissions.
    if (process.platform !== 'win32') assert.equal((await stat(item.path)).mode & 0o777, 0o600);
    if (item.kind === 'image') assert.deepEqual(await readFile(item.path), fixture.image);
    else assert.equal(await readFile(item.path, 'utf8'), fixture.stylesheet);
  }
  assert.equal(JSON.parse(await readFile(bundle.manifestPath, 'utf8')).summary.failedCount, 1);
  const invalid = await manager.execute('test', "await assets.bundle({inventoryId:inventory.id,assetIds:['invented']});");
  assert.match(invalid.error?.message, /absent from this inventory/);
  await run("await tab.playwright.getByRole('button',{name:'加载素材'}).click(); await tab.playwright.locator('#lazy').evaluate(el=>el.decode());");
  const next = await json('var nextInventory = await assets.list(); nodeRepl.write(JSON.stringify(nextInventory));');
  assert.ok(next.assets.some(asset => asset.url.endsWith('/lazy.png')));
  assert.match((await manager.execute('test', 'await assets.bundle({inventoryId:inventory.id});')).error?.message, /inventory changed/);
  const subset = await json(`nodeRepl.write(JSON.stringify(await assets.bundle({inventoryId:nextInventory.id,assetIds:[${JSON.stringify(next.assets.find(asset => asset.url.endsWith('/lazy.png')).id)}]})));`);
  artifacts.add(subset.directoryPath); assert.equal(subset.assets.length, 1); assert.equal(subset.failures.length, 0);
  await run("await tab.playwright.getByRole('button',{name:'更新页面'}).click();");
  const path = (await run('nodeRepl.write(await tab.content.export());')).blocks.at(-1).text;
  artifacts.add(dirname(path));
  const snapshot = await readFile(path, 'utf8');
  assert.match(snapshot, /MIME-Version:/);
  assert.match(snapshot, /picture\.png/);
  assert.ok(snapshot.includes('已更新的页面内容') || snapshot.includes('=E5=B7=B2'), 'MHTML contains the current DOM state');
  await run('await tab.reload();');
  assert.match((await manager.execute('test', 'await assets.bundle({inventoryId:nextInventory.id});')).error?.message, /inventory changed/);
  // Cancellation while the backend is reading a real resource must remove
  // partially exported files and leave no completed artifact path behind.
  await json('inventory=await assets.list();nodeRepl.write(JSON.stringify(inventory));');
  const target = manager.status('test').target;
  const host = manager.browserForTab(target.id, target.browserId), record = await host.target('test', target.id);
  const send = record.cdp.send.bind(record.cdp);
  let entered, release;
  const reading = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  record.cdp.send = async (method, args) => {
    const result = await send(method, args);
    if (method === 'Page.getResourceContent') { entered(); await gate; }
    return result;
  };
  const before = new Set((await readdir(tmpdir())).filter(name => name.startsWith('trisoul-cu-assets-')));
  const controller = new AbortController();
  const cancelling = manager.execute('test', "await assets.bundle({inventoryId:inventory.id,kinds:['image']});", { signal: controller.signal });
  await reading; controller.abort(new Error('Fixture cancelled export')); release();
  const cancelled = await cancelling;
  assert.match(cancelled.error?.message, /Fixture cancelled export/);
  assert.equal(cancelled.blocks.some(block => block.text?.includes('directoryPath')), false);
  assert.deepEqual((await readdir(tmpdir())).filter(name => name.startsWith('trisoul-cu-assets-') && !before.has(name)), []);
  await manager.endTurn('test');
  assert.deepEqual(await readFile(bundle.assets.find(asset => asset.kind === 'image').path), fixture.image, 'delivered files remain after control ends');
  assert.equal((await stat(path)).size, Buffer.byteLength(snapshot));
});
