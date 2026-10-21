import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = new URL('../../dsh-persona-plugin/', import.meta.url), target = new URL('../plugins/persona/', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', source), 'utf8'));
if (pkg.name !== '@gulagala001/dsh-persona-plugin') throw Error('Unexpected Persona source package');
await mkdir(target, { recursive: true });
for (const path of ['src', 'lib', 'scripts', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md'])
  await cp(fileURLToPath(new URL(path, source)), fileURLToPath(new URL(path, target)), { recursive: true });
