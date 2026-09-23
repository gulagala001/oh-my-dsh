import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { restoreFixtureLog } from './fixtures/restore-log.mjs';
import sharp from 'sharp';
import { frontendFixture, until } from './fixtures/frontend.mjs';

function imageLengths(value, result = []) {
  if (!value || typeof value !== 'object') return result;
  if (value.type === 'image_url') { result.push(value.image_url.url.split(',')[1].length); return result; }
  for (const item of Object.values(value)) if (typeof item === 'object') imageLengths(item, result);
  return result;
}

test('actual DSH loop batches old screenshots, logs native offload and never duplicates provider requests', { timeout: 90000 }, async t => {
  const pixels = Buffer.alloc(64 * 64 * 3); let seed = 20260916;
  for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels[i] = seed >>> 24; }
  const png = await sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
  const limit = 4 * Math.ceil(png.length / 3) * 10;
  const f = await frontendFixture(t, { headless: true, imageBudget: limit }), path = join(f.root, 'budget-fixture.png');
  await writeFile(path, png);
  const requests = []; let rounds = 0;
  f.replyWith(payload => {
    const lengths = imageLengths(payload.messages); requests.push(lengths);
    if (++rounds <= 6) return { delta: { role: 'assistant', tool_calls: [0, 1].map(index => ({ index, id: `batch-${rounds}-${index}`, type: 'function', function: { name: 'read_image', arguments: JSON.stringify({ file_path: path }) } })) }, finish_reason: 'tool_calls' };
    return { delta: { role: 'assistant', content: 'Image batch verification finished.' }, finish_reason: 'stop' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: 'Inspect the fixture screenshots and finish.' }] });
  await until(async () => rounds === 7 && (await f.api('/state?session='+f.sessionId)).running === 'idle',45000).catch(async error=>{console.error({rounds, requests, state:await f.api('/state?session='+f.sessionId),log:f.log()});throw error;});
  assert.deepEqual(requests.map(lengths => lengths.length), [0, 2, 4, 6, 8, 6, 8]);
  assert.ok(requests.every(lengths => lengths.reduce((a, b) => a + b, 0) <= limit));
  const {events} = await restoreFixtureLog(f.home,f.sessionId);
  const offloads = events.filter(e => e.type === 'image/offload'); assert.equal(offloads.length, 1);
  assert.equal(offloads[0].data.targets.reduce((sum, item) => sum + item.imageIndexes.length, 0), 4);
  assert.deepEqual(await readFile(path), png, 'source images remain byte-for-byte unchanged');
  const failures = events.filter(e => e.type === 'assistant/attempt').flatMap(e => e.data.stream || []).map(e => e.chunk?.reason?.failure).filter(Boolean);
  assert.ok(failures.some(e => /Image budget preflight/.test(e.message)), 'the installed plugin, not only the stock hard limit, ran');
  assert.equal(f.errors.length, 0);
});
