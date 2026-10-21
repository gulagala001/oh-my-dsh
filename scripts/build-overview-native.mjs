// Reuse the installed, version-pinned Team body and job rows without their
// header popovers. The original styles, task cards and behavior stay intact.
import { readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
const root = new URL('../', import.meta.url);
const version = JSON.parse(await readFile(new URL('package.json', root))).devDependencies['@deepseek-ai/dsh'];
const pnpm = new URL('node_modules/.pnpm/', root);
function walk(node, callback) {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(item => walk(item, callback)); else if (value && typeof value === 'object') walk(value, callback);
}
const field = (node, name) => node?.properties?.find(p => p.key?.name === name || p.key?.value === name)?.value;
const sources = [];
const reviewed = {
  'dsh-experimental-client-ui-agent-team': '5740a0ab636520ee318e052146fa64cb5019f7fb98cda4344fd1266521b99cdb',
  'dsh-client-ui-jobs': 'ad8f57b1b5b9adcd09b197b97ced17e3da4b9dcd0615d25a07f1282beba89fc8',
  'dsh-client-ui-workflow-run': 'c0e08d98885bfc4733c470c80520a460798060ccb9d08778bbef3dfc8011cbcf',
};
async function overviewSource(name) {
  const candidates = new Map();
  // pnpm shortens virtual-store directory names on Windows. Resolve package
  // identity instead, deduplicating dependency links to the same installation.
  for (const entry of await readdir(pnpm, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const base = new URL(`${encodeURIComponent(entry.name)}/node_modules/@deepseek-ai/${name}/`, pnpm);
    const manifest = new URL('package.json', base);
    let pkg;
    try { pkg = JSON.parse(await readFile(manifest, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (pkg.name === `@deepseek-ai/${name}` && pkg.version === version) candidates.set(await realpath(manifest), base);
  }
  if (candidates.size !== 1) throw Error(`Ambiguous overview source: ${name} (${candidates.size} matching installations)`);
  return candidates.values().next().value;
}
for (const [name, exportName] of [['dsh-experimental-client-ui-agent-team', 'createTeamOverview'], ['dsh-client-ui-jobs', 'createJobsOverview'], ['dsh-client-ui-workflow-run', 'createWorkflowOverview']]) {
  const base = await overviewSource(name);
  if (JSON.parse(await readFile(new URL('package.json', base))).version !== version) throw Error('Overview SDK mismatch');
  let source = await readFile(new URL('lib/client.js', base), 'utf8');
  const hash = createHash('sha256').update(source).digest('hex');
  // The pinned rc.1 and rc.2 packages contain byte-identical overview sources.
  if (!['0.2.1-rc.1', '0.2.1-rc.2'].includes(version) || hash !== reviewed[name]) throw Error(`Unreviewed native overview source: ${name} ${version}`);
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const functions = new Map();
  walk(ast, node => { if (node.type === 'FunctionDeclaration') functions.set(node.id.name, node); });
  let extra;
  if (name.includes('agent-team')) {
    const action = functions.get('TeamAction');
    let body;
    walk(action, node => {
      if (node.type === 'CallExpression' && source.slice(field(node.arguments?.[1], 'className')?.start, field(node.arguments?.[1], 'className')?.end) === 'TeamAction_module_css_default.body') body = node;
    });
    if (!body || !functions.has('TeamMemberRow') || !functions.has('TaskCard')) throw Error('Native Team body changed');
    let bodySource = source.slice(body.start, body.end).replace('member,\n', 'member, renderAvatar,\n');
    extra = `function TeamPanel({sessionId, team, useSessions, useSessionStatus, openTeammate, renderAvatar, t}) {
      const [error,setError] = react.useState(null); const opening = false, listing = false;
      return ${bodySource};
    }\nexports.TeamPanel = TeamPanel; exports.locale = {zh,en};`;
    const member = functions.get('TeamMemberRow');
    let text = source.slice(member.start, member.end), icon;
    walk(member, node => {
      if (node.type === 'ObjectExpression' && source.slice(field(node, 'className')?.start, field(node, 'className')?.end) === 'TeamAction_module_css_default.memberDot') icon = field(node, 'children');
    });
    if (!icon) throw Error('Native Team member icon changed');
    text = text.slice(0, icon.start - member.start) + `(renderAvatar?.(member.id) ?? (${source.slice(icon.start, icon.end)}))` + text.slice(icon.end - member.start);
    text = text.replace('openTeammate, onError, t }', 'openTeammate, onError, renderAvatar, t }');
    source = source.slice(0, member.start) + text + source.slice(member.end);
  } else if (name.includes('workflow-run')) {
    if (!functions.has('WorkflowRunPanel') || !functions.has('MemberRow')) throw Error('Native workflow panel changed');
    const row = functions.get('MemberRow');
    const before = source.slice(row.start, row.end);
    let after = before.replace('{\n', '{\nconst renderAvatar = react.useContext(OverviewAvatarContext);\n');
    const icon = '(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: dotState(member.status) })';
    if (!after.includes(icon)) throw Error('Workflow member icon changed');
    after = after.replace(icon, `(renderAvatar?.(member.childId) ?? ${icon})`);
    source = source.slice(0, row.start) + after + source.slice(row.end);
    const nav = functions.get('navigableMembers');
    const originalNav = source.slice(nav.start, nav.end);
    if (!originalNav.startsWith('function navigableMembers')) throw Error('Workflow navigation boundary changed');
    source = source.slice(0, nav.start) + `function navigableMembers(sessions, phases, parentId) {
      const catalog = sessions.projectionsBySession[parentId]?.values.subagentCatalog ?? [];
      const result = new Map();
      for (const phase of phases) for (const member of phase.members) {
        const child = catalog.find(entry => entry.id === member.childId);
        if (child && child.mode !== 'external') result.set(member.childId, sessions.projectionsBySession[member.childId]?.values.subagent?.mode ?? child.mode);
      }
      return result;
    }` + source.slice(nav.end);
    extra = `const OverviewAvatarContext = react.createContext(null);
      exports.WorkflowPanel = function(props) { return react.createElement(OverviewAvatarContext.Provider, {value:props.renderAvatar}, react.createElement(WorkflowRunPanel, props)); };`;
  } else {
    let body;
    walk(functions.get('JobListAction'), node => {
      if (node.type === 'CallExpression' && source.slice(field(node.arguments?.[1], 'className')?.start, field(node.arguments?.[1], 'className')?.end) === 'JobListAction_module_css_default.menuBody') body = node;
    });
    if (!body || !functions.has('JobItem') || !functions.has('isObservable') || !functions.has('ordered') || !functions.has('isLive')) throw Error('Native job list changed');
    extra = `function JobsBody({liveRows, settledRows, item, settledExpanded, setSettledOpen, clearSettled, t}) { return ${source.slice(body.start, body.end)}; }
      exports.JobsBody = JobsBody; exports.JobItem = JobItem; exports.isObservable = isObservable;
      exports.ordered = ordered; exports.isLive = isLive; exports.styles = JobListAction_module_css_default; exports.locale = {zh,en};`;
  }
  if (!source.includes('exports.apply = apply;')) throw Error('Native factory changed');
  source = source.replace('exports.apply = apply;', `${extra}\nexports.apply = apply;`);
  // These components live in OMD. Native plugin reloads must only remove the
  // native plugin's styles, even when both copies use identical CSS classes.
  const tagPattern = new RegExp(`(const tagId(?:\\$\\d+)? = )"@deepseek-ai/${name}/`, 'g');
  const dataset = `tag.dataset.plugin = "@deepseek-ai/${name}"`;
  const tags = [...source.matchAll(tagPattern)].length, owners = source.split(dataset).length - 1;
  if (!tags || tags !== owners) throw Error(`Native overview style ownership changed: ${name} ${tags}/${owners}`);
  source = source.replace(tagPattern, `$1"oh-my-dsh/overview/${name}/`).replaceAll(dataset, 'tag.dataset.plugin = "oh-my-dsh"');
  source = source.replace(/\/\/# sourceMappingURL=.*$/m, '');
  sources.push(`// ${name} ${version}; upstream SHA-256 ${hash}\nexport function ${exportName}(require) { let record; const window = {__ModuleLoader__: {load(value) { record=value; }}};\n${source}\nreturn record.factory(require); }`);
}
await writeFile(new URL('lib/host/overview-native.factory.mjs', root), sources.join('\n'));
