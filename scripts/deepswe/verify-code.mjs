import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function verifyCode(manifestPath, modulesDirectory) {
  const files = Object.entries(JSON.parse(await readFile(manifestPath, 'utf8')));
  const root = resolve(modulesDirectory);
  for (let offset = 0; offset < files.length; offset += 32) {
    await Promise.all(files.slice(offset, offset + 32).map(async ([name, expected]) => {
      const file = resolve(root, name);
      if (!file.startsWith(root + '/')) throw Error('Invalid plugin manifest path');
      const actual = createHash('sha256').update(await readFile(file)).digest('hex');
      if (actual !== expected) throw Error('Installed plugin snapshot mismatch: ' + name);
    }));
  }
  return files.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify({ verifiedFiles: await verifyCode(process.argv[2], process.argv[3]) }));
}
