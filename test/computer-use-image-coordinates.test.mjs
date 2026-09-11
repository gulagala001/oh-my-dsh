import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ImageCoordinates, mapImagePoints } from '../src/computer-use/image-coordinates.mjs';
import { ComputerRuntime } from '../src/computer-use/runtime.mjs';
import sharp from 'sharp';

test('request coordinates follow the actual image version and remain isolated across concurrent model streams', async () => {
  const coordinates = new ImageCoordinates(), target = { kind: 'tab', id: 'one', browserId: 'browser' };
  const ref = { attachmentId: 'same-content', width: 1200, height: 750 };
  coordinates.remember('a', { target, width: 1600, height: 1000 }, ref);
  coordinates.remember('b', { target, width: 1600, height: 1000 }, ref);
  const attachments = { async readImageRequest(_ref, policy) { await delay(policy.wait); return { width: policy.width, height: policy.height, data: Buffer.from('unchanged') }; } };
  const original = attachments.readImageRequest, dispose = coordinates.watch(attachments);
  const run = async (session, width, height, wait) => {
    const stream = coordinates.stream(session, async function* () { yield await attachments.readImageRequest(ref, { width, height, wait }); });
    for await (const value of stream) assert.equal(value.data.toString(), 'unchanged');
  };
  try {
    await Promise.all([run('a', 800, 500, 20), run('b', 400, 250, 1)]);
    assert.deepEqual(mapImagePoints(coordinates.frames('a'), target, 'click', [[400, 250], { clickCount: 2 }]), [{ x: 800, y: 500 }, { clickCount: 2 }]);
    assert.deepEqual(mapImagePoints(coordinates.frames('b'), target, 'drag', [[100, 50], [200, 100]]), [{ x: 400, y: 200 }, { x: 800, y: 400 }]);
    assert.deepEqual(mapImagePoints(coordinates.frames('a'), target, 'click', [42]), [42], 'AX identifiers are not coordinates');
    assert.deepEqual(mapImagePoints(coordinates.frames('a'), { ...target, id: 'other' }, 'click', [[400, 250]]), [[400, 250]], 'unrelated targets are untouched');
    const prior = coordinates.frames('a');
    await attachments.readImageRequest(ref, { width: 10, height: 10, wait: 0 });
    assert.deepEqual(coordinates.frames('a'), prior, 'background image processing cannot change a main model frame');
    await run('a', 1000, 625, 0);
    assert.deepEqual(mapImagePoints(prior, target, 'click', [[400, 250]]), [{ x: 800, y: 500 }], 'a running tool retains the request it answered');
    assert.deepEqual(mapImagePoints(coordinates.frames('a'), target, 'click', [[400, 250]]), [{ x: 640, y: 400 }]);
    for await (const _ of coordinates.stream('a', async function* () { yield 'text-only'; })) {}
    assert.equal(coordinates.frames('a').size, 0, 'a request with no image projection does not silently retain a previous scale');
  } finally { dispose(); }
  assert.equal(attachments.readImageRequest, original, 'unload restores the original method descriptor');
});

test('projection errors and early stream closure retain host behavior and release the iterator', async () => {
  const coordinates = new ImageCoordinates(), failure = new Error('projection failed');
  const attachments = { async readImageRequest() { throw failure; } }, dispose = coordinates.watch(attachments);
  try { await assert.rejects(attachments.readImageRequest({}), error => error === failure); } finally { dispose(); }
  let closed = false;
  for await (const _ of coordinates.stream('a', async function* () { try { yield 1; yield 2; } finally { closed = true; } })) break;
  assert.equal(closed, true);
});

test('unloading during a projection stops observation without replacing a later service wrapper', async () => {
  const coordinates = new ImageCoordinates(), target = { kind: 'tab', id: 'one' }, ref = { attachmentId: 'image' };
  coordinates.remember('a', { target, width: 200, height: 100 }, ref);
  let release;
  const attachments = { readImageRequest: () => new Promise(resolve => { release = resolve; }) };
  const dispose = coordinates.watch(attachments), observer = attachments.readImageRequest;
  const later = (...args) => observer.apply(attachments, args); attachments.readImageRequest = later;
  const stream = coordinates.stream('a', async function* () { yield await attachments.readImageRequest(ref); });
  const pending = stream.next();
  dispose(); assert.equal(attachments.readImageRequest, later);
  release({ width: 100, height: 50 }); await pending; await stream.return();
  assert.equal(coordinates.frames('a').size, 0, 'an in-flight projection cannot publish after observer unload');
});

test('runtime marks only unchanged target screenshot bytes, including delayed explicit image output', async t => {
  const png = await sharp({ create: { width: 200, height: 100, channels: 4, background: '#123456' } }).png().toBuffer();
  const target = { kind: 'tab', id: 'one', browserId: 'browser' };
  const runtime = new ComputerRuntime(async (method, args) => method === 'getTab' ? target : args[1] === 'getAXState' ? { state: 'Canvas' } : { screenshot: png.toString('base64') });
  t.after(() => runtime.reset());
  assert.equal((await runtime.execute("const tab=await cua.getTab('one');const screenshot=await tab.getScreenshot({emit:false});")).blocks.some(b => b.type === 'image'), false);
  const result = await runtime.execute('await nodeRepl.emitImage(screenshot);');
  assert.equal(result.error, undefined);
  assert.deepEqual(result.blocks[0].capture, { target, width: 200, height: 100 });
  const changed = await runtime.execute('screenshot[screenshot.length-1]^=1;await nodeRepl.emitImage(screenshot);');
  assert.equal(changed.blocks[0].capture, undefined, 'modified bytes cannot borrow the original screenshot geometry');
});
