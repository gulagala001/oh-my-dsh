import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const source = new URL('../../dsh-persona-plugin/', import.meta.url), target = new URL('../plugins/persona/', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', source), 'utf8'));
if (pkg.name !== '@gulagala001/dsh-persona-plugin') throw Error('Unexpected Persona source package');
const host = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (pkg.engines.dsh !== host.engines.dsh) throw Error('Persona build target does not match OMD');
// The package's actual distribution is authoritative, including its documentation
// and check inputs. A second, partial directory list drifts as the product grows.
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--dry-run'],
  { cwd: fileURLToPath(source), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
const paths = new Set(packed.files.map(file => file.path));
for (const path of ['src/index.mjs', 'src/client/index.jsx', 'lib/client.js', 'lib/host/permission-native.factory.mjs'])
  if (!paths.has(path)) throw Error('Complete Persona build required: missing ' + path);
for (const { path } of packed.files) {
  const destination = fileURLToPath(new URL(path, target));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(new URL(path, source), destination);
}
execFileSync(process.execPath, [fileURLToPath(new URL('./build-credits.mjs', import.meta.url)), '--write'], { stdio: 'inherit' });
