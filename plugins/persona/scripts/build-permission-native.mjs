// Keep the pinned host picker, including its permission confirmation flow.
// Expose a Menu component seam for independently owned menu groups.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const hostRequire = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
const manifest = hostRequire.resolve('@deepseek-ai/dsh-client-ui-permission-presets/package.json');
const pkg = JSON.parse(await readFile(manifest, 'utf8'));
const version = JSON.parse(await readFile(new URL('package.json', root), 'utf8')).devDependencies['@deepseek-ai/dsh'];
let source = await readFile(new URL('lib/client.js', pathToFileURL(manifest)), 'utf8');
const hash = createHash('sha256').update(source).digest('hex');
if (pkg.name !== '@deepseek-ai/dsh-client-ui-permission-presets' || pkg.version !== version
    || !['0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3'].includes(version) || hash !== '0c5d7757b657615b3f34a5712d73e30af6726e5fb48d5947881533e6fdbdfcdd') {
  throw Error(`Unreviewed native permission picker: ${pkg.version}`);
}
const replaceOnce = (before, after) => {
  if (source.split(before).length !== 2) throw Error('Native permission picker boundary changed');
  source = source.replace(before, after);
};
replaceOnce('function PermissionSelect({ locked, select, usePermissionCatalog, useProjection, t })',
  'function PermissionSelect({ locked, select, usePermissionCatalog, useProjection, t, MenuComponent = _deepseek_ai_dsh_client_ui_primitives.Menu })');
replaceOnce('children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {',
  'children: [(0, react_jsx_runtime.jsx)(MenuComponent, {');
replaceOnce('exports.apply = apply;', 'exports.PermissionSelect = PermissionSelect;');
source = source.replace(/(const tagId(?:\$\d+)? = )"@deepseek-ai\/dsh-client-ui-permission-presets\//g, '$1"dsh-persona-plugin/permission/')
  .replaceAll('tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-permission-presets"', 'tag.dataset.plugin = "dsh-persona-plugin"')
  .replace(/^\/\/# sourceMappingURL=.*\n?/gm, '');
await mkdir(new URL('lib/host/', root), { recursive: true });
await writeFile(new URL('lib/host/permission-native.factory.mjs', root),
  `// ${pkg.name} ${version}; upstream SHA-256 ${hash}\nexport function createPermissionPicker(require) { let record; const window = {__ModuleLoader__: {load(value) { record = value; }}};\n${source}\nreturn record.factory(require).PermissionSelect; }\n`);
