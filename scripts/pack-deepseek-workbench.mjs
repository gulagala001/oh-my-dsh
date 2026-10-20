/** Build the standalone source with its own exact dependencies and public-file gate. */
import { parseArgs } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const { values } = parseArgs({ options: { 'host-version': { type: 'string' }, 'cordis-version': { type: 'string' }, out: { type: 'string' } } });
const source = fileURLToPath(new URL('../../deepseek-workbench/', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
if (values['host-version'] && values['host-version'] !== manifest.engines.dsh || values['cordis-version'] && values['cordis-version'] !== manifest.peerDependencies['@deepseek-ai/cordis']) throw Error('Requested host does not match the standalone source and lockfile');
const output = resolve(values.out || fileURLToPath(new URL('../../.local/deepseek-workbench-packages/', import.meta.url)));
await mkdir(output, { recursive: true });
const result = spawnSync('npm', ['pack', '--json', '--pack-destination', output], { cwd: source, stdio: 'inherit' });
if (result.status !== 0) throw Error('Standalone Workbench packaging failed');
