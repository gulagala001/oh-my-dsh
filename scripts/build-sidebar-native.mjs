import { reviewedNativeClients } from './prepare-host-sdk.mjs';
// Preserve the host's rows, menus, search, directory flow and ordering owner.
// Expose its render seats so OMD can arrange three sections without forking data.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { hostClientSource, replaceExactly, ownClientStyles, clientRegistration } from './host-build-contracts.mjs';
const root = new URL('../', import.meta.url), name = '@deepseek-ai/dsh-client-ui-workspace';
let { source, version } = await hostClientSource(root, name);
const hash = createHash('sha256').update(source).digest('hex');
if (!reviewedNativeClients.has(version) || !['229b22697f611468b1bc5bb10aff187b3b8bbce63c96fcb0f9cb7cde9e1e1cac', 'a5719367e4b1913dfc5d92f375eeed50403dc992cef329f3227d053bfe671aec'].includes(hash)) throw Error('Unreviewed native workspace browser');
const walk = (node, visit) => { if (!node || typeof node !== 'object') return; visit(node); for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(item => walk(item, visit)); else if (value && typeof value === 'object') walk(value, visit); };
const functions = new Map();
walk(parse(source, {ecmaVersion:'latest',sourceType:'script'}), node => {if(node.type==='FunctionDeclaration'&&node.id) {if(functions.has(node.id.name)) throw Error('Duplicate native function');functions.set(node.id.name,node);}});
const edits = [], replaceNode = (node, value) => edits.push({start:node.start,end:node.end,value});
const body = functions.get('WorkspaceBrowser'), result = body.body.body.at(-1);
if (result.type !== 'ReturnStatement') throw Error('Native workspace return changed');
const calls = new Map();
walk(result.argument, node => {if(node.type==='CallExpression'&&['FlatList','SessionTree'].includes(node.arguments[0]?.name)) {if(calls.has(node.arguments[0].name)) throw Error('Native seat duplicated');calls.set(node.arguments[0].name,node);}});
if(calls.size!==2)throw Error('Native workspace seats changed');
replaceNode(result, `const omdElement=${source.slice(result.argument.start,result.argument.end)};
return omdRender ? omdRender(omdElement, {
  wide,list,rowState,groupBy,orderBy,orderedWorkspaces,orderedFlatSessionIds,saveSessionOrder,
  recentSessionIds:pinCurrentBlank(orderByRecency(flatMemberIds,list.byId),currentBlank),
  searchExpanded,normalizedQuery,requestSearch,focusSearch,startSession,
  currentSessionId:mainSessionId,revealSessionId,
  renderTree:overrides=>react.cloneElement(${source.slice(calls.get('SessionTree').start,calls.get('SessionTree').end)},overrides),
  renderFlat:overrides=>react.cloneElement(${source.slice(calls.get('FlatList').start,calls.get('FlatList').end)},overrides)
}) : omdElement;`);
// These are presentation-only projections. Stored workspace membership and
// complete order accounts remain untouched in WorkspaceBrowser above.
const derive = functions.get('deriveGroups'), groupsReturn = derive.body.body.at(-1);
if(groupsReturn.argument.name!=='groups')throw Error('Native group derivation changed');
replaceNode(groupsReturn, 'return groups.filter(group=>group.workspaceId!==undefined).map(group=>({...group,sessions:group.sessions.filter(row=>!row.pinned)}));');
const flat = functions.get('FlatList');
walk(flat, node => {if(node.type==='CallExpression'&&node.arguments[0]?.name==='SessionNodeItem') {const drag=node.arguments[1].properties.find(p=>p.key.name==='drag');if(!drag)throw Error('Native row drag missing');replaceNode(drag.value, `omdAllowReorder===false?undefined:(${source.slice(drag.value.start,drag.value.end)})`);}});
const options = functions.get('ViewOptionsMenu');
let menus=0;
walk(options, node=>{if(node.type==='Property'&&node.key?.name==='items'&&node.value.type==='ArrayExpression'){menus++;replaceNode(node.value,`(${source.slice(node.value.start,node.value.end)}).filter(item=>!omdSection || (item.id!=='flat' && (omdSection==='workspaces' || !['group-by','workspace','workspace-tree','order-by-separator'].includes(item.id)) && (omdSection!=='recent' || !['order-by','manual','updated','archived-filter-separator'].includes(item.id))))`);}});
if(menus!==1)throw Error('Native view options changed');
for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.value+source.slice(edit.end);
source=replaceExactly(source,'function WorkspaceBrowser({','function WorkspaceBrowser({omdRender,','workspace section renderer');
source=replaceExactly(source,'function FlatList({','function FlatList({omdAllowReorder,','flat row ordering');
source=replaceExactly(source,'function ViewOptionsMenu({','function ViewOptionsMenu({omdSection,','section view options');
source=replaceExactly(source,'exports.apply=apply;','exports.WorkspaceBrowser=WorkspaceBrowser;exports.styles=WorkspaceBrowser_module_css_default;exports.ViewOptionsMenu=ViewOptionsMenu;exports.visibleSessionIds=visibleSessionIds;exports.apply=apply;','workspace exports');
source=ownClientStyles(source,{moduleId:name,owner:'oh-my-dsh',namespace:'oh-my-dsh/sidebar',count:3});
await mkdir(new URL('lib/host/',root),{recursive:true});
await writeFile(new URL('lib/host/sidebar-native.factory.mjs',root),`// ${name} ${version}; upstream SHA-256 ${hash}\nexport function createSidebarNative(require){\n${clientRegistration(source,name)}\nreturn registration.factory(require); }\n`);
