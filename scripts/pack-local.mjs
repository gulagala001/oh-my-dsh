import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativePackageModes } from './native-package-modes.mjs';
import { readFile } from 'node:fs/promises';
import { deliveryBaseline, verifyDeliveryArchive } from './check-opencu-delivery.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
if (!process.env.OMD_NPM_ENTRY) throw new Error('Set OMD_NPM_ENTRY to npm-cli.js; npm preserves the package manifest');
const directory = resolve(process.argv[2] ?? root);
const output = execFileSync(process.execPath, [process.env.OMD_NPM_ENTRY, 'pack', '--ignore-scripts', '--json', '--pack-destination', directory], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const packed = JSON.parse(output), filename = Array.isArray(packed) ? packed[0].filename : packed.filename;
await nativePackageModes(resolve(directory, filename));
console.log(JSON.stringify(verifyDeliveryArchive(await readFile(resolve(directory, filename)), await deliveryBaseline(root))));
