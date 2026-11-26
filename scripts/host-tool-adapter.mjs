import { PTC_CONTROL_NAMES, REWIND_WORKSPACE_INDEPENDENT } from '../src/ptc-control-compat.mjs';

function unique(ts, scope, predicate, label) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(scope);
  if (matches.length !== 1) throw Error(`Host tool contract: ${label}: expected one match, found ${matches.length}`);
  return matches[0];
}

// Adapt the reviewed operations in their native owner. Only the matched
// argument/expression changes; formatting, comments and sibling calls survive.
export function adaptHostTool(ts, name, text) {
  const identifier = (node, name) => Boolean(node && ts.isIdentifier(node) && node.text === name);
  const property = (node, name) => Boolean(node && ts.isPropertyAccessExpression(node) && !node.questionDotToken && identifier(node.name, name));
  const call = (node, count) => Boolean(node && ts.isCallExpression(node) && !node.questionDotToken && !node.typeArguments && node.arguments.length === count);

  const file = ts.createSourceFile(name + '.ts', text, ts.ScriptTarget.Latest, true);
  if (file.parseDiagnostics.length) throw Error(`Host tool contract: invalid TypeScript in ${name}`);
  const edits = [];
  const edit = (node, value) => edits.push({ start: node.getStart(file), end: node.end, value });
  const waitAborted = node => call(node, 0) && identifier(node.expression, 'waitAborted');
  if (name === 'jobs-local') {
    const wait = unique(ts, file, node => ts.isMethodDeclaration(node) && identifier(node.name, 'waitJob'), 'waitJob');
    const preflight = unique(ts, wait, node => ts.isIfStatement(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.questionDotToken && identifier(node.expression.expression, 'signal') && identifier(node.expression.name, 'aborted'), 'waitJob abort check');
    const then = preflight.thenStatement;
    const direct = ts.isBlock(then) && then.statements.length === 1 ? then.statements[0] : then;
    if (!ts.isThrowStatement(direct) || !waitAborted(direct.expression)) throw Error('Host tool contract: unexpected waitJob abort exception');
    edit(direct.expression, 'signal.reason ?? ' + direct.expression.getText(file));
    const onAbort = unique(ts, wait, node => ts.isVariableDeclaration(node) && identifier(node.name, 'onAbort'), 'waitJob abort handler');
    const rejection = unique(ts, onAbort, node => call(node, 1) && identifier(node.expression, 'reject') && waitAborted(node.arguments[0]), 'waitJob abort rejection');
    edit(rejection.arguments[0], 'signal?.reason ?? ' + rejection.arguments[0].getText(file));
  } else if (name === 'tool-jobs') {
    const apply = unique(ts, file, node => ts.isFunctionDeclaration(node) && identifier(node.name, 'apply'), 'tool-jobs apply');
    for (const control of PTC_CONTROL_NAMES.filter(name => name.startsWith('job_'))) {
      const registration = unique(ts, apply, node => {
        if (!call(node, 1) || !property(node.expression, 'register') || !property(node.expression.expression, 'tools')
          || !identifier(node.expression.expression.expression, 'ctx')) return false;
        const definition = node.arguments[0];
        if (!call(definition, 1) || !identifier(definition.expression, 'defineTool') || !ts.isObjectLiteralExpression(definition.arguments[0])) return false;
        const properties = definition.arguments[0].properties;
        if (properties.some(field => ts.isSpreadAssignment(field) || ts.isComputedPropertyName(field.name))) return false;
        const names = properties.filter(field => identifier(field.name, 'name') || ts.isStringLiteral(field.name) && field.name.text === 'name');
        return names.length === 1 && ts.isPropertyAssignment(names[0]) && ts.isStringLiteralLike(names[0].initializer) && names[0].initializer.text === control;
      }, control + ' registration');
      const definition = registration.arguments[0];
      edit(definition, `Object.assign(${definition.getText(file)}, { [Symbol.for(${JSON.stringify(REWIND_WORKSPACE_INDEPENDENT)})]: true })`);
    }
  } else if (name === 'tool-bash' || name === 'tool-pwsh') {
    const wait = unique(ts, file, node => ts.isVariableDeclaration(node) && identifier(node.name, 'waitOnJob'), name + ' waitOnJob');
    const stop = unique(ts, wait, node => ts.isVariableDeclaration(node) && identifier(node.name, 'stop'), name + ' stop');
    const settled = unique(ts, stop, node => {
      if (!ts.isVariableDeclaration(node) || !(node.parent.flags & ts.NodeFlags.Const) || !identifier(node.name, 'settled') || !node.initializer || !ts.isAwaitExpression(node.initializer)) return false;
      const invocation = node.initializer.expression;
      if (!call(invocation, 3) || !property(invocation.expression, 'wait') || !identifier(invocation.expression.expression, 'registry')) return false;
      const [id, timeout, owner] = invocation.arguments;
      return property(id, 'id') && identifier(id.expression, 'attached') && identifier(timeout, 'timeoutMs') && identifier(owner, 'owner');
    }, name + ' settlement wait');
    // The registry retains ownership of processes still stopping after this grace.
    edit(settled.initializer.expression.arguments[1], '1000');
  } else throw Error('Unknown host tool ' + name);
  for (const { start, end, value } of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, start) + value + text.slice(end);
  return text;
}
