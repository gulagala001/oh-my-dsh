import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
export const languages = ['javascript', 'typescript', 'tsx', 'python', 'go', 'rust', 'java', 'cpp', 'c-sharp', 'ruby', 'php', 'bash', 'css', 'powershell', 'ini', 'regex'];
let initialized;
const registered = new Map();
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
  const api = await astRuntime(language), tree = api.parse(language, text), root = tree.root();
  try {
    if (tree.getInnerTree().rootNode.hasError) return { parseError: true, matches: [] };
    const matches = root.findAll(pattern).map(node => {
      const range = node.range(), start = range.start, end = range.end;
      try { return { range: { start: { line: start.line, column: start.column, index: start.index }, end: { line: end.line, column: end.column, index: end.index } }, text: node.text() }; }
      finally { start.free(); end.free(); range.free(); node.free(); }
    });
    signal?.throwIfAborted(); return { parseError: false, matches };
  } finally { root.free(); tree.getInnerTree().delete(); tree.free(); }
}
