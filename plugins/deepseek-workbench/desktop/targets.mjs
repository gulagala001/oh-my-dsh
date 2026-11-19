import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function readHostTarget(root) {
  const { name, version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (name !== '@deepseek-ai/dsh-root') throw new Error('Workbench needs a DSH source checkout');
  return version;
}
