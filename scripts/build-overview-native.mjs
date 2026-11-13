// Reuse the installed, version-pinned Team body and job rows without their
// header popovers. The original styles, task cards and behavior stay intact.
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { hostClientSource, replaceExactly, ownClientStyles, clientRegistration } from './host-build-contracts.mjs';
const root = new URL('../', import.meta.url);
function walk(node, callback) {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(item => walk(item, callback)); else if (value && typeof value === 'object') walk(value, callback);
}
const field = (node, name) => node?.properties?.find(p => p.key?.name === name || p.key?.value === name)?.value;
const sources = [];
const reviewed = {
  'dsh-client-ui-agent-team': '2efa878b397a8f1674f79ec1d60fa5c4e1be86b7833766135457fe9b277da328',
  'dsh-client-ui-jobs': 'a8604ef9338c337fa9d9fc8e89bee740faa23f0d73b72f1f499e3b36bac71724',
  'dsh-client-ui-workflow-run': 'c0f828af4c0093cc67a41eb9848992f7b322bf9a77a8d21fbce886b2c3e2b964',
};
for (const [name, exportName] of [['dsh-client-ui-agent-team', 'createTeamOverview'], ['dsh-client-ui-jobs', 'createJobsOverview'], ['dsh-client-ui-workflow-run', 'createWorkflowOverview']]) {
  let { source, version } = await hostClientSource(root, '@deepseek-ai/' + name);
  const hash = createHash('sha256').update(source).digest('hex');
  // Bind the extracted seats to this exact host build.
  if (version !== '0.2.2-rc.3' || hash !== reviewed[name]) throw Error(`Unreviewed native overview source: ${name} ${version}`);
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const functions = new Map(), duplicates = new Set();
  walk(ast, node => { if (node.type === 'FunctionDeclaration' && node.id) {
    if (functions.has(node.id.name)) duplicates.add(node.id.name);
    functions.set(node.id.name, node);
  } });
  const required = name.includes('agent-team') ? ['TeamBoard', 'TaskRow']
    : name.includes('workflow-run') ? ['WorkflowRunPanel', 'MemberRow', 'navigableMembers']
      : ['JobListAction', 'JobItem', 'isObservable', 'ordered', 'isLive'];
  for (const id of required) if (!functions.has(id) || duplicates.has(id)) throw Error(`Native ${name} must contain exactly one ${id}`);
  let extra;
  if (name.includes('agent-team')) {
    extra = 'exports.TeamPanel = TeamBoard; exports.locale = {zh,en};';
  } else if (name.includes('workflow-run')) {
    if (!functions.has('WorkflowRunPanel') || !functions.has('MemberRow')) throw Error('Native workflow panel changed');
    const row = functions.get('MemberRow');
    const before = source.slice(row.start, row.end);
    const bodyOffset = row.body.start - row.start + 1;
    let after = before.slice(0, bodyOffset) + '\nconst renderAvatar = react.useContext(OverviewAvatarContext);\n' + before.slice(bodyOffset);
    const icon = '(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot,{state:dotState(member.status)})';
    after = replaceExactly(after, icon, `(renderAvatar?.(member.childId) ?? ${icon})`, 'Workflow member icon');
    const nav = functions.get('navigableMembers');
    if (!nav) throw Error('Workflow navigation function missing');
    if (Math.max(row.start, nav.start) < Math.min(row.end, nav.end)) throw Error('Workflow edit boundaries overlap');
    const originalNav = source.slice(nav.start, nav.end);
    if (!originalNav.startsWith('function navigableMembers')) throw Error('Workflow navigation boundary changed');
    const navigation = `function navigableMembers(sessions, phases, parentId) {
      const catalog = sessions.projectionsBySession[parentId]?.values.subagentCatalog ?? [];
      const result = new Map();
      for (const phase of phases) for (const member of phase.members) {
        const child = catalog.find(entry => entry.id === member.childId);
        if (child && child.mode !== 'external') result.set(member.childId, sessions.projectionsBySession[member.childId]?.values.subagent?.mode ?? child.mode);
      }
      return result;
    }`;
    for (const [node, replacement] of [[row, after], [nav, navigation]].sort((a, b) => b[0].start - a[0].start))
      source = source.slice(0, node.start) + replacement + source.slice(node.end);
    extra = `const OverviewAvatarContext = react.createContext(null);
      exports.WorkflowPanel = function(props) { return react.createElement(OverviewAvatarContext.Provider, {value:props.renderAvatar}, react.createElement(WorkflowRunPanel, props)); };`;
  } else {
    const bodies = [];
    walk(functions.get('JobListAction'), node => {
      if (node.type === 'CallExpression' && source.slice(field(node.arguments?.[1], 'className')?.start, field(node.arguments?.[1], 'className')?.end) === 'JobListAction_module_css_default.menuBody') bodies.push(node);
    });
    const [body] = bodies;
    if (bodies.length !== 1) throw Error('Native job list changed');
    extra = `function JobsBody({liveRows, settledRows, item, settledExpanded, setSettledOpen, clearSettled, t}) { return ${source.slice(body.start, body.end)}; }
      exports.JobsBody = JobsBody; exports.JobItem = JobItem; exports.isObservable = isObservable;
      exports.ordered = ordered; exports.isLive = isLive; exports.styles = JobListAction_module_css_default; exports.locale = {zh,en};`;
  }
  source = replaceExactly(source, 'exports.apply=apply;', `${extra}\nexports.apply = apply;`, name + ' exports');
  // These components live in OMD. Native plugin reloads must only remove the
  // native plugin's styles, even when both copies use identical CSS classes.
  source = ownClientStyles(source, { moduleId: '@deepseek-ai/' + name, owner: 'oh-my-dsh', namespace: 'oh-my-dsh/overview/' + name, count: name.includes('agent-team') ? 4 : 1 });
  sources.push(`// ${name} ${version}; upstream SHA-256 ${hash}\nexport function ${exportName}(require) {\n${clientRegistration(source, '@deepseek-ai/' + name)}\nreturn registration.factory(require); }`);
}
await mkdir(new URL('lib/host/', root), { recursive: true });
await writeFile(new URL('lib/host/overview-native.factory.mjs', root), sources.join('\n'));
