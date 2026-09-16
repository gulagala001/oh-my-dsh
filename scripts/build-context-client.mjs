import { readFile, writeFile } from 'node:fs/promises';
import { updateContextClientBundle } from './context-client-bundle.mjs';
const target = new URL('../lib/client.js', import.meta.url);
const source = await readFile(new URL('../src/client/context-client.mjs', import.meta.url), 'utf8');
const before = await readFile(target, 'utf8');
const after = updateContextClientBundle(before, source);
if (after !== before) await writeFile(target, after);
