import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parse } from 'acorn';

const fail = message => { throw new Error('Host build contract: ' + message); };

export function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) child.forEach(item => walkAst(item, visit));
    else if (child && typeof child === 'object') walkAst(child, visit);
  }
}

// Resolve through the installed SDK, for both pnpm and hoisted/offline layouts.
// Never select an unrelated copy by searching package-manager internals.
export async function hostClientSource(root, name) {
  const parent = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const version = parent.devDependencies?.['@deepseek-ai/dsh'];
  const require = createRequire(new URL('package.json', root));
  const hostPath = require.resolve('@deepseek-ai/dsh/package.json');
  const host = JSON.parse(await readFile(hostPath, 'utf8'));
  if (!version || host.name !== '@deepseek-ai/dsh' || host.version !== version) fail('installed SDK does not match the declared host');
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
  const edits = [], styleIds = new Set();
  let owners = 0;
  const literal = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value
    : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : null;
  const member = (node, name) => node?.type === 'MemberExpression' && !node.computed && node.property.name === name;
  const propertyName = node => node?.type === 'MemberExpression'
    ? node.computed ? literal(node.property) : node.property.name : null;
  function datasetTarget(assignment, key) {
    const left = assignment?.left;
    if (assignment?.type === 'AssignmentExpression' && assignment.operator === '=' && member(left, key)
      && member(left.object, 'dataset') && left.object.object.type === 'Identifier') return left.object.object.name;
  }
  walkAst(parse(source, { ecmaVersion: 'latest', sourceType: 'script' }), node => {
    if (datasetTarget(node, 'plugin') && literal(node.right) === moduleId) owners++;
    if (node.type !== 'BlockStatement' && node.type !== 'Program') return;
    // A CSS registration publishes its own module and the enclosing style ID on
    // the same element. Follow those bindings, including compiler-renamed locals.
    const bindings = new Map();
    for (const statement of node.body) {
      if (statement.type === 'VariableDeclaration' && statement.kind === 'const') {
        for (const { id, init } of statement.declarations) {
          if (id.type === 'Identifier' && literal(init)?.startsWith(moduleId + '/')) bindings.set(id.name, init);
        }
      }
      if (statement.type !== 'IfStatement' || statement.consequent.type !== 'BlockStatement') continue;
      const body = statement.consequent.body;
      const assignments = body.filter(s => s.type === 'ExpressionStatement').map(s => s.expression);
      const locals = body.filter(s => s.type === 'VariableDeclaration').flatMap(s => s.declarations);
      for (const assignment of assignments) {
        const target = datasetTarget(assignment, 'plugin');
        if (!target || literal(assignment.right) !== moduleId) continue;
        // A second direct or conditional write can override either tag after registration.
        const writes = new Set();
        walkAst(statement.consequent, other => {
          let left;
          if (other.type === 'AssignmentExpression') left = other.left;
          else if (other.type === 'UpdateExpression' || other.type === 'UnaryExpression' && other.operator === 'delete') left = other.argument;
          else return;
          if (propertyName(left.object) !== 'dataset' || left.object.object.name !== target) return;
          const key = propertyName(left);
          if (key === null || writes.has(key)) fail(moduleId + ': ambiguous style metadata');
          if (key === 'plugin' || key === 'pluginCss') writes.add(key);
        });
        const ids = assignments.filter(other => datasetTarget(other, 'pluginCss') === target);
        const binding = ids.length === 1 && ids[0].right.type === 'Identifier' && bindings.get(ids[0].right.name);
        const element = locals.find(decl => decl.id.type === 'Identifier' && decl.id.name === target)?.init;
        if (element?.type !== 'CallExpression' || !member(element.callee, 'createElement') || element.callee.object.name !== 'document' ||
            element.arguments.length !== 1 || literal(element.arguments[0]) !== 'style') fail(moduleId + ': unexpected style element');
        if (!binding || locals.some(decl => decl.id.name === ids[0].right.name) || styleIds.has(literal(binding))) fail(moduleId + ': ambiguous style ID');
        styleIds.add(literal(binding));
        edits.push({ node: binding, value: namespace + literal(binding).slice(moduleId.length) }, { node: assignment.right, value: owner });
      }
    }
  });
  if (!Number.isSafeInteger(count) || count < 1 || owners !== count || styleIds.size !== count) fail(moduleId + ': style owner count changed');
  for (const { node, value } of edits.sort((a, b) => b.node.start - a.node.start)) {
    source = source.slice(0, node.start) + JSON.stringify(value) + source.slice(node.end);
  }
  return source;
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
