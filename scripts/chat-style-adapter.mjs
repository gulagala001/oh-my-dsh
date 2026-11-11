import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { ownClientStyles, clientRegistration } from './host-build-contracts.mjs';

const reviewedSource = {
  commits: ['1600d8a1e140dcde43a1a0941940a0480712c011', '687f282e8625c6b8d11ff58211a90524be2e4317', '1f81c047fc48fa190a683e469daa699857e9afe8'],
  sha256: '5345409ad105881250939dbb478f8cb01f5a14dad94b0aa446b4280b80427f55',
};
const reviewedFactories = new Map(reviewedSource.commits.map(commit => [commit, reviewedSource.sha256]));
reviewedFactories.set('f3803c96974ad4a94195fb97e5c637e9c2a3afe3', '7671998cd4560381656c42aafa427d761a4a7105c823bd6a857730c6b59298e6');
reviewedFactories.set('05b1cae8db6e674c5685101494d4eec24652424a', '31fee6f283a3187b10a4aac465890cc0bc52553c0ebc3c92d5558fbd1db88526');
reviewedFactories.set('ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c', '41ba7801797f1dfbeedcfc0a64dfc4553ea45f513a947815176f8f0bb341fdee');
const before = '.EvIC1a_column:has(>.EvIC1a_older)>[data-slot="conversation.chat.flow"]>';
const after = '.EvIC1a_column>.EvIC1a_older~[data-slot="conversation.chat.flow"]>';
const empty = '.EvIC1a_flowItem:is(:empty,:has(>[data-slot="conversation.chat.node"]:empty))';
const count = (source, text) => source.split(text).length - 1;
const gate = (condition, message) => { if (!condition) throw new Error(`Chat style adapter format gate: ${message}`); };

// Read actual registrations, not text that happens to resemble a slot. Keep
// the supported UI contract explicit when reviewing a new upstream snapshot.
export function readComposerStats(client) {
  const ast = parse(client, { ecmaVersion: 'latest', sourceType: 'script' });
  const entries = [], key = node => node?.type === 'Identifier' ? node.name : node?.value;
  const member = (node, name) => node?.type === 'MemberExpression'
    && (!node.computed || node.property.type === 'Literal') && key(node.property) === name;
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && member(node.callee, 'register') && member(node.callee.object, 'slots')) {
      const object = node.arguments[0];
      if (object?.type === 'ObjectExpression' && object.properties.some(p => key(p.key) === 'name' && p.value?.value === 'conversation.composer.dock')) {
        gate(object.properties.every(p => p.type === 'Property' && !p.method && p.kind === 'init'
          && (!p.computed || p.key.type === 'Literal')), 'unsupported composer registration properties');
        const field = name => {
          const values = object.properties.filter(p => key(p.key) === name);
          gate(values.length === 1, `expected one composer ${name} property`);
          return values[0].value;
        };
        const name = field('name'), id = field('id'), order = field('order');
        gate(name.type === 'Literal' && name.value === 'conversation.composer.dock', 'invalid composer slot name');
        gate(id.type === 'Literal' && ['activity', 'usage'].includes(id.value), 'unsupported composer statistic id');
        const value = order.type === 'Literal' ? order.value : order.type === 'UnaryExpression'
          && ['-', '+'].includes(order.operator) && order.argument.type === 'Literal'
          && typeof order.argument.value === 'number' ? (order.operator === '-' ? -1 : 1) * order.argument.value : undefined;
        gate(Number.isSafeInteger(value), `invalid composer order for ${id.value}`);
        entries.push({ id: id.value, order: value });
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(ast);
  gate(entries.length === 2 && new Set(entries.map(entry => entry.id)).size === 2,
    'expected exactly one activity and one usage composer registration');
  return entries;
}

function adaptProcessHeader(client) {
  const pattern = /^(\s*const css(?:\$\d+)? = )("(?:[^"\\]|\\.)*")(?=;\n\s*const tagId(?:\$\d+)? = "@deepseek-ai\/dsh-client-ui-chat\/ChatGroupSeat\.module\.css";)/gm;
  const matches = [...client.matchAll(pattern)];
  gate(matches.length === 1, 'expected one native process-header CSS owner');
  for (const marker of ['count', 'failures', 'stopped']) gate(count(client, `"data-process-${marker}": true`) === 1, `unexpected process ${marker} marker`);
  const match = matches[0], css = JSON.parse(match[2]);
  // This is structural layout, not a skin. Put it in the native component's
  // stylesheet so default theme and optional-enhancement failures also get it.
  // At narrow widths badges move as whole units instead of breaking words.
  const layout = '.tx-cu-group-toggle{width:100%;min-width:0;flex-wrap:wrap;row-gap:4px}'
    + '.tx-cu-group-toggle>:nth-child(2){flex:1;min-width:0;overflow:hidden}'
    + '.tx-cu-group-toggle>:is([data-process-count],[data-process-failures],[data-process-stopped]){flex:none;white-space:nowrap}';
  gate(!css.includes('.tx-cu-group-toggle'), 'process header layout is already adapted');
  const start = match.index + match[1].length;
  return client.slice(0, start) + JSON.stringify(css + layout) + client.slice(start + match[2].length);
}

/** Resolve only reviewed native package assets and constant CSS concatenations. */
export function inlineFactoryAssets(client, assets) {
  const ast = parse(client, { ecmaVersion: 'latest', sourceType: 'script' }), edits = [];
  const value = node => {
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
    if (node.type === 'BinaryExpression' && node.operator === '+') return value(node.left) + value(node.right);
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
      && node.callee.object.name === 'require' && node.callee.property.name === 'asset'
      && node.arguments.length === 1 && node.arguments[0].type === 'Literal') {
      const path = node.arguments[0].value;
      gate(Object.hasOwn(assets, path), 'missing native asset: ' + path);
      return assets[path];
    }
    throw Error('Unsupported native CSS asset expression');
  };
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && /^css(?:\$\d+)?$/.test(node.id.name) && node.init.type !== 'Literal')
      edits.push([node.init.start, node.init.end, JSON.stringify(value(node.init))]);
    for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(walk); else if (child && typeof child === 'object') walk(child);
  };
  walk(ast);
  for (const [start, end, replacement] of edits.sort((a,b) => b[0]-a[0])) client = client.slice(0,start)+replacement+client.slice(end);
  return client;
}

/** Alpha's native sibling selector already avoids the former broad :has(). */
export function adaptChatStyleFactory(client) {
  gate(client.trimStart().startsWith('window.__ModuleLoader__.load({') && client.trimEnd().endsWith('});'), 'expected native browser factory');
  const pattern = /^(\s*const css(?:\$\d+)? = )("(?:[^"\\]|\\.)*")(?=;\n\s*const tagId(?:\$\d+)? = "@deepseek-ai\/dsh-client-ui-chat\/ChatView\.module\.css";)/gm;
  const matches = [...client.matchAll(pattern)];
  gate(matches.length === 1, 'expected one native ChatView stylesheet');
  const css = JSON.parse(matches[0][2]);
  gate(count(css, before) === 0 && count(css, '.EvIC1a_column>.EvIC1a_older+[data-slot="conversation.chat.flow"]>') === 1, 'native sibling layout changed');
  gate(count(css, empty) === 8, 'native empty/quote predicates changed');
  return { code: adaptProcessHeader(client), stats: { cssStrings: 2, selectorReplacements: 0, emptyPredicates: 8, processHeaderLayouts: 1 } };
}

/** Shared by the host build and an isolated ui-chat factory rebuild. */
export function buildChatStyleFactory(rawClient, source, assets = {}) {
  gate(reviewedFactories.has(source?.commit) && source?.sha256 === reviewedFactories.get(source.commit), 'unsupported upstream source; use the exact reviewed host factory');
  gate(createHash('sha256').update(rawClient).digest('hex') === source.sha256, 'upstream ui-chat lib SHA-256 differs from the snapshot');
  const composerStats = readComposerStats(rawClient);
  const adapted = adaptChatStyleFactory(inlineFactoryAssets(rawClient.replace(/^\/\/# sourceMappingURL=.*\n?/gm, ''), assets));
  const owned = ownClientStyles(adapted.code, { moduleId: '@deepseek-ai/dsh-client-ui-chat', owner: 'oh-my-dsh/chat', namespace: 'oh-my-dsh/chat', count: 18 })
    .replace(/^([ \t]*\/\/#region \\0dsh-css:)[^\r\n]*?\/(packages\/[^\r\n]+)$/gm, '$1$2');
  const registration = clientRegistration(owned, '@deepseek-ai/dsh-client-ui-chat');
  const code = registration + `\nexport const composerStats = ${JSON.stringify(composerStats)};\nexport function createChat(require) { const component = registration.factory(require); Object.defineProperty(component, Symbol.for('omd.ui-chat.source.v1'), { value: ${JSON.stringify(source)} }); return component; }\n`;
  return { code, stats: { ...adapted.stats, styleOwnerTags: 18, styleOwnerDatasets: 18 } };
}
