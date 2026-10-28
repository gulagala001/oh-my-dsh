// Keep the pinned host picker, including its permission confirmation flow.
// Expose only a Menu component seam for OMD's independent memory scope group.
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { hostClientSource, replaceExactly, ownClientStyles, clientRegistration } from './host-build-contracts.mjs';
const root = new URL('../', import.meta.url);
let { pkg, version, source } = await hostClientSource(root, '@deepseek-ai/dsh-client-ui-permission-presets');
const hash = createHash('sha256').update(source).digest('hex');
if (pkg.name !== '@deepseek-ai/dsh-client-ui-permission-presets' || pkg.version !== version
    || !['0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3'].includes(version) || hash !== '0c5d7757b657615b3f34a5712d73e30af6726e5fb48d5947881533e6fdbdfcdd') {
  throw Error(`Unreviewed native permission picker: ${pkg.version}`);
}
const replaceOnce = (before, after) => { source = replaceExactly(source, before, after, pkg.name); };
replaceOnce('function PermissionSelect({ locked, select, usePermissionCatalog, useProjection, t })',
  'function PermissionSelect({ locked, select, usePermissionCatalog, useProjection, t, MenuComponent = _deepseek_ai_dsh_client_ui_primitives.Menu })');
replaceOnce('children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {',
  'children: [(0, react_jsx_runtime.jsx)(MenuComponent, {');
replaceOnce('exports.apply = apply;', 'exports.PermissionSelect = PermissionSelect;');
source = ownClientStyles(source, { moduleId: pkg.name, owner: 'oh-my-dsh', namespace: 'oh-my-dsh/permission', count: 2 });
await mkdir(new URL('lib/host/', root), { recursive: true });
await writeFile(new URL('lib/host/permission-native.factory.mjs', root),
  `// ${pkg.name} ${version}; upstream SHA-256 ${hash}\nexport function createPermissionPicker(require) {\n${clientRegistration(source, pkg.name)}\nreturn registration.factory(require).PermissionSelect; }\n`);
