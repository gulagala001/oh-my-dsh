import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parse } from 'acorn';
import { assertSupportedJsonSchema, renderToolsSdk, renderToolsSdkPy } from '@deepseek-ai/dsh-tools';
import { installCatalog } from '../src/result-reduction/catalog.mjs';
import { registerContextViews } from '../src/result-reduction/views.mjs';
import { registerContextRecall } from '../src/context/recall.mjs';
import { registerRuntimeStatus } from '../src/runtime-state.mjs';
import { registerTasks } from '../src/tasks.mjs';

const definitions = [];
const ctx = { tools: { register: tool => { definitions.push(tool); return () => {}; } }, on() {}, sessionProjections: { register() {} } };
installCatalog(ctx, {}); registerContextViews(ctx, {}); registerContextRecall(ctx, {}); registerRuntimeStatus(ctx, {}); registerTasks(ctx, {});
export const ownedToolContracts = definitions;
for (const tool of definitions) {
  assert.equal(tool.parameters.type, 'object', `${tool.name}: Native parameter root`);
  assertSupportedJsonSchema(tool.parameters); assertSupportedJsonSchema(tool.output.schema);
}
const schemas = definitions.map(tool => ({ ...tool, output: tool.output.schema }));
for (const format of ['function-body', 'repl']) {
  const sdk = renderToolsSdk(schemas, format);
  for (const tool of definitions) assert.ok(!sdk.includes(`${tool.name}: unknown;`), `${tool.name}: missing SDK parameter contract`);
}
const python = renderToolsSdkPy(schemas);
for (const tool of definitions) assert.ok(!python.includes(`async def ${tool.name}(self, args: Any)`), `${tool.name}: missing Python SDK contract`);

// New owned literal registrations must use the shared assertion/validation.
// Imported provider definitions remain the responsibility of their native owner.
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'client') continue;
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (!entry.name.endsWith('.mjs')) continue;
    const ast = parse(await readFile(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CallExpression' && node.callee?.property?.name === 'register' && node.callee?.object?.property?.name === 'tools') {
        assert.notEqual(node.arguments[0]?.type, 'ObjectExpression', `${file.pathname}: owned tool must use checkedTool`);
      }
      if (node.type === 'CallExpression' && node.callee?.property?.name === 'append') {
        const type = node.arguments[0]?.value;
        assert.ok(typeof type !== 'string' || !type.startsWith('plugin:'), `${file.pathname}: plugin records must use appendPluginRecord`);
        assert.ok(!node.arguments[2]?.properties?.some(p => (p.key?.name ?? p.key?.value) === 'ignorable'),
          `${file.pathname}: Session.append does not accept ignorable`);
      }
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    };
    walk(ast);
  }
}
await scan(new URL('../src/', import.meta.url));
console.log(`Tool contracts: ${definitions.map(t=>t.name).join(', ')}; Native, TypeScript and Python checked.`);
