import { parse } from 'acorn';
import { readFile, writeFile } from 'node:fs/promises';

// Keep import() lazy while routing it through the owning DSH Loader tree.
// Lowering it to require() makes the factory preload platform-only native addons.
export async function finishHostFactory(result, file) {
  const code = await readFile(file, 'utf8');
  const imports = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ImportExpression') imports.push(node.start);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(parse(code, { ecmaVersion: 'latest', sourceType: 'module' }));
  let output = code;
  for (const offset of imports.sort((a, b) => b - a)) {
    if (code.slice(offset, offset + 6) !== 'import') throw Error('Unexpected dynamic import output');
    output = output.slice(0, offset) + 'importHostModule' + output.slice(offset + 6);
  }
  if (output !== code) await writeFile(file, output);
  return [...new Set(Object.values(result.metafile.outputs).flatMap(output =>
    output.imports.filter(item => item.external && item.kind !== 'dynamic-import').map(item => item.path)))];
}
