import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
export const languages = ['javascript', 'typescript', 'tsx', 'python', 'go', 'rust', 'java', 'cpp', 'c-sharp', 'ruby', 'php', 'bash', 'css', 'powershell', 'ini', 'regex'];
let initialized;
const registered = new Map();
const trees = new Map();
const CACHE_BYTES = 8 * 1024 * 1024, MAX_CACHED_SOURCE = 256 * 1024;
let retainedBytes = 0;
function releaseTree(entry) { entry.tree.getInnerTree().delete(); entry.tree.free(); }
export function clearAstCache() {
  for (const entry of trees.values()) releaseTree(entry);
  trees.clear(); retainedBytes = 0;
}
function parsedTree(api, text, language) {
  const weight = text.length * 16 + 4096;
  if (text.length > MAX_CACHED_SOURCE) return { tree: api.parse(language, text), retained: false };
  const key = language + ':' + createHash('sha256').update(text, 'utf16le').digest('hex');
  const existing = trees.get(key);
  if (existing?.text === text) { trees.delete(key); trees.set(key, existing); return { tree: existing.tree, retained: true }; }
  if (existing) { trees.delete(key); retainedBytes -= existing.weight; releaseTree(existing); }
  const tree = api.parse(language, text);
  while (trees.size && (trees.size >= 8 || retainedBytes + weight > CACHE_BYTES)) {
    const [oldKey, old] = trees.entries().next().value;
    trees.delete(oldKey); retainedBytes -= old.weight; releaseTree(old);
  }
  trees.set(key, { tree, text, weight }); retainedBytes += weight;
  return { tree, retained: true };
}
export async function astRuntime(language) {
  if (!languages.includes(language)) throw Error('支持的语法：' + languages.join(', '));
  initialized ??= (async () => {
    // Explicit instantiation also runs on Node 22 without experimental WASM
    // module flags. Use the package's own generated imports and WASM bytes.
    const root = dirname(require.resolve('@ast-grep/wasm'));
    const api = await import(pathToFileURL(join(root, 'wasm_bg.js')).href);
    const module = await WebAssembly.compile(await readFile(join(root, 'wasm_bg.wasm')));
    const instance = await WebAssembly.instantiate(module, { './wasm_bg.js': api });
    api.__wbg_set_wasm(instance.exports); instance.exports.__wbindgen_start();
    await api.initializeTreeSitter(); return api;
  })();
  const api = await initialized;
  if (!registered.has(language)) registered.set(language, api.registerDynamicLanguage({ [language]: {
    libraryPath: require.resolve(`@vscode/tree-sitter-wasm/wasm/tree-sitter-${language}.wasm`),
  } }));
  await registered.get(language); return api;
}
export async function structuralSearch(text, language, pattern, signal) {
  signal?.throwIfAborted();
  const api = await astRuntime(language);
  signal?.throwIfAborted();
  const { tree, retained } = parsedTree(api, text, language), root = tree.root();
  try {
    if (tree.getInnerTree().rootNode.hasError) return { parseError: true, matches: [] };
    const matches = root.findAll(pattern).map(node => {
      const range = node.range(), start = range.start, end = range.end;
      try { return { range: { start: { line: start.line, column: start.column, index: start.index }, end: { line: end.line, column: end.column, index: end.index } }, text: node.text() }; }
      finally { start.free(); end.free(); range.free(); node.free(); }
    });
    signal?.throwIfAborted(); return { parseError: false, matches };
  } finally { root.free(); if (!retained) releaseTree({ tree }); }
}
