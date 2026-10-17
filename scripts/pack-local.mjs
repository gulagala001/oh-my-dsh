import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativePackageModes } from './native-package-modes.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
if (!process.env.OMD_PNPM_ENTRY) throw new Error('Set OMD_PNPM_ENTRY to the matching pnpm.mjs');
const directory = resolve(process.argv[2] ?? root);
const output = execFileSync(process.execPath, [process.env.OMD_PNPM_ENTRY, '--config.ignore-scripts=true', 'pack', '--json', '--pack-destination', directory], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const packed = JSON.parse(output), filename = Array.isArray(packed) ? packed[0].filename : packed.filename;
await nativePackageModes(resolve(directory, filename));
