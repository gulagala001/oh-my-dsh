import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function meteringVersion() {
  const hash=createHash('sha256');
  const files=(await readdir(root+'src/metering')).filter(f=>f.endsWith('.mjs')).sort();
  for(const file of files)hash.update(file+'\0').update(await readFile(root+'src/metering/'+file));
  hash.update(await readFile(root+'src/metering/native/source.json'));
  return parseInt(hash.digest('hex').slice(0,12),16);
}
