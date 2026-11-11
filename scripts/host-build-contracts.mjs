import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parse } from 'acorn';

const fail = message => { throw new Error('Host build contract: ' + message); };

// Resolve through the installed SDK, for both pnpm and hoisted/offline layouts.
// Never select an unrelated copy by searching package-manager internals.
export async function hostClientSource(root, name) {
  const parent = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const version = parent.devDependencies?.['@deepseek-ai/dsh'];
  const require = createRequire(new URL('package.json', root));
  const hostPath = require.resolve('@deepseek-ai/dsh/package.json');
  const host = JSON.parse(await readFile(hostPath, 'utf8'));
  if (!version || parent.engines?.dsh !== version || host.name !== '@deepseek-ai/dsh' || host.version !== version) fail('installed SDK does not match the declared host');
  const manifest = createRequire(hostPath).resolve(name + '/package.json');
  const pkg = JSON.parse(await readFile(manifest, 'utf8'));
  if (pkg.name !== name || pkg.version !== version) fail(`wrong component identity or version: ${name}`);
  const source = await readFile(new URL('lib/client.js', pathToFileURL(manifest)), 'utf8');
  return { pkg, version, source };
}

export function replaceExactly(source, before, after, label) {
  const found = source.split(before).length - 1;
  if (found !== 1) fail(`${label}: expected one replacement, found ${found}`);
  return source.replace(before, () => after);
}

export function ownClientStyles(source, { moduleId, owner, namespace, count }) {
  const escaped = moduleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tags = new RegExp('(?:const tagId(?:\\$\\d+)?\\s*=\\s*)["`]' + escaped + '/', 'g');
  const dataset = new RegExp('tag\\.dataset\\.plugin\\s*=\\s*(["`])' + escaped + '\\1', 'g');
  if (!Number.isSafeInteger(count) || count < 1 || [...source.matchAll(tags)].length !== count ||
    [...source.matchAll(dataset)].length !== count) fail(moduleId + ': style owner count changed');
  return source.replace(tags, match => match.replace(moduleId + '/', namespace + '/'))
    .replace(dataset, match => match.replace(moduleId, owner));
}

// Preserve comments and factory bytes while removing only the loader call.
// A changed module ID, extra statement or duplicate registration is an error.
export function clientRegistration(source, moduleId) {
  source = source.replace(/^\/\/# sourceMappingURL=.*\n?/gm, '');
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const statement = program.body[0], call = statement?.expression;
  const member = (node, name) => node?.type === 'MemberExpression' && !node.computed && node.property.name === name;
  if (program.body.length !== 1 || statement.type !== 'ExpressionStatement' || call?.type !== 'CallExpression'
      || !member(call.callee, 'load') || !member(call.callee.object, '__ModuleLoader__')
      || call.callee.object.object?.type !== 'Identifier' || call.callee.object.object.name !== 'window'
      || call.arguments.length !== 1 || call.arguments[0].type !== 'ObjectExpression') fail(`${moduleId}: expected one ModuleLoader registration`);
  const object = call.arguments[0], property = name => object.properties.filter(p => p.type === 'Property'
    && !p.computed && !p.method && p.kind === 'init' && (p.key.name ?? p.key.value) === name);
  const ids = property('id'), factories = property('factory');
  const id = ids[0]?.value;
  const staticId = id?.type === 'TemplateLiteral' && id.expressions.length === 0 ? id.quasis[0].value.cooked : id?.value;
  if (object.properties.length !== 2 || ids.length !== 1 || staticId !== moduleId
      || factories.length !== 1 || !['ArrowFunctionExpression', 'FunctionExpression'].includes(factories[0].value.type)) fail(`${moduleId}: unexpected module identity or factory`);
  return source.slice(0, statement.start) + 'const registration = ' + source.slice(object.start, object.end) + ';' + source.slice(statement.end);
}
