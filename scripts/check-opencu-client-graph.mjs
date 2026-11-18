import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entryPattern = /\bimport\(\s*["']\/api\/opencu\/rea-assets\/(opencu-client-[A-Z0-9]{8}\.js)["']\s*\)/g;

// The root client and vendor bytes can each match their own baseline yet
// belong to different builds. Follow the actual import into the served graph.
export function checkClientGraph(client, readAsset) {
  const records = JSON.parse(readAsset('manifest.json'));
  const entries = records.filter(row => /^opencu-client-[A-Z0-9]{8}\.js$/.test(row.file));
  const imports = [...new Set(Array.from(client.toString().matchAll(entryPattern), match => match[1]))];
  assert.equal(entries.length, 1, 'Expected one packaged OpenCU runtime entry');
  assert.deepEqual(imports, [entries[0].file], 'OMD client import differs from the served OpenCU runtime');
  const assets = new Map(records.map(row => [row.file, row]));
  for (const row of records.filter(row => row.source === 'opencu-client-build')) {
    const bytes = readAsset(row.asset ?? row.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, 'OpenCU runtime hash mismatch: ' + row.file);
    for (const [, part] of bytes.toString().matchAll(/["']\.\/(opencu-chunk-[A-Z0-9]{8}\.js)["']/g)) {
      assert(assets.has(part), 'Missing OpenCU chunk in served manifest: ' + part);
    }
  }
  return entries[0].file;
}
export function checkBuiltClient() {
  return checkClientGraph(readFileSync(join(root, 'lib/client.js')), file => readFileSync(join(root, 'vendor/opencu/lib/rea-assets', file)));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(checkBuiltClient());
