import { createHash } from 'node:crypto';

const reviewedSource = {
  commits: ['1600d8a1e140dcde43a1a0941940a0480712c011', '687f282e8625c6b8d11ff58211a90524be2e4317', '1f81c047fc48fa190a683e469daa699857e9afe8'],
  sha256: '5345409ad105881250939dbb478f8cb01f5a14dad94b0aa446b4280b80427f55',
};
const before = '.EvIC1a_column:has(>.EvIC1a_older)>[data-slot="conversation.chat.flow"]>';
const after = '.EvIC1a_column>.EvIC1a_older~[data-slot="conversation.chat.flow"]>';
const empty = '.EvIC1a_flowItem:is(:empty,:has(>[data-slot="conversation.chat.node"]:empty))';
const count = (source, text) => source.split(text).length - 1;
const gate = (condition, message) => { if (!condition) throw new Error(`Chat style adapter format gate: ${message}`); };

/**
 * ChatView renders its optional older button before its only flow slot. Use
 * that sibling relationship to avoid column-wide :has() invalidations while
 * retaining the selector's specificity, declarations and empty predicates.
 */
export function adaptChatStyleFactory(client) {
  gate(typeof client === 'string' && client.startsWith('window.__ModuleLoader__.load({') && client.trimEnd().endsWith('});'), 'expected an upstream-built browser factory');
  gate(client.slice(0, 150).includes('id: "@deepseek-ai/dsh-client-ui-chat"'), 'unexpected upstream module identity');
  const cssPattern = /^(\s*const (css(?:\$\d+)?) = )("(?:[^"\\]|\\.)*")(?=;\n\s*const tagId(?:\$\d+)? = "@deepseek-ai\/dsh-client-ui-chat\/ChatView\.module\.css";)/gm;
  const matches = [...client.matchAll(cssPattern)];
  gate(matches.length === 1, `expected one ChatView CSS string, found ${matches.length}`);
  const maps = [...client.matchAll(/var ChatView_module_css_default = \{([\s\S]*?)\n\s*\};/g)];
  gate(maps.length === 1, `expected one ChatView CSS module map, found ${maps.length}`);
  for (const [key, value] of Object.entries({ column: 'EvIC1a_column', older: 'EvIC1a_older', flowItem: 'EvIC1a_flowItem' })) {
    gate(count(maps[0][1], `"${key}": "${value}"`) === 1, `unexpected reviewed rc.2 ${key} class`);
  }
  const match = matches[0], css = JSON.parse(match[3]);
  gate(JSON.stringify(css) === match[3], 'ChatView CSS is not in the reviewed JSON literal format');
  gate(count(css, before) === 1 && count(css, after) === 0, 'expected exactly one unadapted rc.2 older selector');
  gate(count(css, empty) === 7, 'expected all seven original empty predicates');
  const adaptedCSS = css.replace(before, after);
  gate(count(adaptedCSS, after) === 1 && adaptedCSS.replace(after, before) === css, 'CSS changed outside the older selector');
  const literalStart = match.index + match[1].length;
  const adaptedLiteral = JSON.stringify(adaptedCSS);
  const code = client.slice(0, literalStart) + adaptedLiteral + client.slice(literalStart + match[3].length);
  gate(code.slice(0, literalStart) + match[3] + code.slice(literalStart + adaptedLiteral.length) === client, 'factory changed outside the ChatView CSS literal');
  return { code, stats: { cssStrings: 1, selectorReplacements: 1, emptyPredicates: 7 } };
}

/** Shared by the host build and an isolated ui-chat factory rebuild. */
export function buildChatStyleFactory(rawClient, source) {
  gate(reviewedSource.commits.includes(source?.commit) && source?.sha256 === reviewedSource.sha256, 'unsupported upstream source; only the reviewed rc.1 / rc.2 / rc.3 factory is supported');
  gate(createHash('sha256').update(rawClient).digest('hex') === source.sha256, 'upstream ui-chat lib SHA-256 differs from the snapshot');
  const adapted = adaptChatStyleFactory(rawClient.replace(/^\/\/# sourceMappingURL=.*\n?/gm, ''));
  const tagPattern = /(const tagId(?:\$\d+)? = )"@deepseek-ai\/dsh-client-ui-chat\//g;
  const dataset = 'tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat"';
  const tags = [...adapted.code.matchAll(tagPattern)].length, datasets = count(adapted.code, dataset);
  gate(tags === 18 && datasets === 18, `expected 18 style-owner tags/datasets, found ${tags}/${datasets}`);
  const owned = adapted.code.replace(tagPattern, '$1"oh-my-dsh/chat/').replaceAll(dataset, 'tag.dataset.plugin = "oh-my-dsh/chat"')
    .replace(/^([ \t]*\/\/#region \\0dsh-css:)[^\r\n]*?\/(packages\/[^\r\n]+)$/gm, '$1$2');
  const registration = owned.trimEnd().replace('window.__ModuleLoader__.load(', 'const registration = ').replace(/\);$/, ';');
  const code = registration + `\nexport function createChat(require) { const component = registration.factory(require); Object.defineProperty(component, Symbol.for('omd.ui-chat.source.v1'), { value: ${JSON.stringify(source)} }); return component; }\n`;
  return { code, stats: { ...adapted.stats, styleOwnerTags: tags, styleOwnerDatasets: datasets } };
}
