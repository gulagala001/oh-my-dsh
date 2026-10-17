import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const manifestUrl = new URL('./host-const-enums.json', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Host const enums: ${message}`); };

// The SDK source root is an explicit build input, not a transitive .pnpm lookup.
// A standalone build can instead declare TypeScript directly in devDependencies.
export async function loadHostTypeScript(root, pin, sourceRoot = process.env.OMD_HOST_SDK_SOURCE) {
  let owner = join(root, 'package.json');
  const parent = JSON.parse(await readFile(owner, 'utf8'));
  if (!parent.devDependencies?.typescript) {
    if (!sourceRoot) fail('declare typescript as a build dependency or set OMD_HOST_SDK_SOURCE to the matching SDK development source');
    owner = join(await realpath(sourceRoot), 'package.json');
    const bytes = await readFile(owner);
    if (sha256(bytes) !== pin.sdkSourcePackageSha256) fail('SDK development package.json does not match the reviewed official source');
    const sdk = JSON.parse(bytes.toString('utf8'));
    if (sdk.name !== '@deepseek-ai/dsh-root' || sdk.version !== pin.version || !sdk.devDependencies?.typescript) fail('OMD_HOST_SDK_SOURCE is not the matching SDK with a declared TypeScript dependency');
  }
  const require = createRequire(owner);
  const ts = require('typescript');
  if (ts.version !== pin.typescript) fail(`TypeScript ${ts.version} does not match reviewed ${pin.typescript}`);
  return ts;
}

function parse(ts, filename, text) {
  const kind = /\.[cm]?tsx?$/.test(filename) ? ts.ScriptKind.TS : /\.jsx$/.test(filename) ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : kind);
  if (source.parseDiagnostics.length) fail(`${filename}: ${ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, '\n')}`);
  return source;
}

export function createHostEnumProgram(ts, roots, sources = new Map(), resolveImport) {
  const options = { allowJs: true, checkJs: false, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, allowImportingTsExtensions: true };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host), exists = host.fileExists.bind(host);
  host.readFile = path => sources.get(resolve(path)) ?? read(path);
  host.fileExists = path => sources.has(resolve(path)) || exists(path);
  host.getSourceFile = (path, languageVersion, onError) => {
    const text = host.readFile(path);
    if (text === undefined) { onError?.(`Missing source: ${path}`); return undefined; }
    return parse(ts, path, text);
  };
  host.resolveModuleNames = (names, importer) => names.map(name => {
    const aliased = resolveImport?.(name, importer);
    if (aliased) return { resolvedFileName: aliased, extension: aliased.endsWith('.d.ts') ? ts.Extension.Dts : aliased.endsWith('.tsx') ? ts.Extension.Tsx : ts.Extension.Ts };
    return ts.resolveModuleName(name, importer, options, host).resolvedModule;
  });
  return ts.createProgram(roots, options, host);
}

function unalias(ts, checker, symbol) {
  const seen = new Set();
  while (symbol && symbol.flags & ts.SymbolFlags.Alias) {
    if (seen.has(symbol)) fail('cyclic enum alias');
    seen.add(symbol);
    symbol = checker.getAliasedSymbol(symbol);
  }
  return symbol;
}

function enumValues(ts, checker, node) {
  if (!ts.isEnumDeclaration(node) || !node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ConstKeyword)) fail(`${node.name.text} is not a const enum`);
  const values = new Map();
  for (const member of node.members) {
    if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) fail(`unsupported computed enum declaration in ${node.name.text}`);
    const name = member.name.text;
    const value = checker.getConstantValue(member);
    if (values.has(name) || !(typeof value === 'string' || typeof value === 'number' && Number.isFinite(value))) fail(`uncomputed or duplicate enum member ${node.name.text}.${name}`);
    values.set(name, value);
  }
  if (!values.size) fail(`empty const enum ${node.name.text}`);
  return values;
}

const sameValues = (left, right) => left.size === right.size && [...left].every(([name, value]) => right.has(name) && Object.is(right.get(name), value));

// Read the shipped official source without vendoring or bundling a second Cordis.
// Hashes bind the full source, not just ACTIVE or a manually mirrored value map.
export async function loadHostEnumPins(ts, root, snapshot, manifest) {
  manifest ??= JSON.parse(await readFile(manifestUrl, 'utf8'));
  if (manifest.schema !== 1 || manifest.repository !== snapshot.repository || manifest.commit !== snapshot.commit || manifest.tag !== snapshot.tag || manifest.version !== snapshot.version) fail('enum manifest does not match the official DSH snapshot');
  const require = createRequire(join(root, 'package.json'));
  const pins = new Map();
  for (const pkg of manifest.packages) {
    const owner = require.resolve(pkg.name + '/package.json');
    const installed = JSON.parse(await readFile(owner, 'utf8'));
    if (installed.name !== pkg.name || installed.version !== pkg.version) fail(`wrong installed version of ${pkg.name}`);
    for (const item of pkg.sources) {
      const path = join(dirname(owner), item.path);
      const bytes = await readFile(path);
      if (sha256(bytes) !== item.sha256) fail(`source checksum mismatch: ${item.officialPath}`);
      const program = createHostEnumProgram(ts, [path]);
      const source = program.getSourceFile(path), checker = program.getTypeChecker();
      const declarations = source.statements.filter(ts.isEnumDeclaration);
      if (declarations.length !== item.enums.length || declarations.some(node => !item.enums.includes(node.name.text))) fail(`changed complete enum inventory: ${item.officialPath}`);
      for (const node of declarations) {
        if (!node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) fail(`enum is no longer exported: ${node.name.text}`);
        const values = enumValues(ts, checker, node);
        const declarationPath = join(dirname(owner), 'lib/types', item.path.slice('src/'.length).replace(/\.ts$/, '.d.ts'));
        const declarationsProgram = createHostEnumProgram(ts, [declarationPath]);
        const declarationsSource = declarationsProgram.getSourceFile(declarationPath);
        const emitted = declarationsSource?.statements.find(item => ts.isEnumDeclaration(item) && item.name.text === node.name.text);
        if (!emitted || !sameValues(enumValues(ts, declarationsProgram.getTypeChecker(), emitted), values)) fail(`complete declaration/source mismatch: ${node.name.text}`);
        const key = resolve(declarationPath) + ':' + node.name.text;
        pins.set(key, { package: pkg.name, name: node.name.text, values, source: resolve(path), declaration: resolve(declarationPath) });
      }
    }
  }
  return pins;
}

function typePosition(ts, node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isTypeNode(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent) || ts.isJSDoc(parent)) return true;
    if (ts.isExpressionStatement(parent) || ts.isStatement(parent)) return false;
  }
  return false;
}

function unwrap(ts, expression) {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression)) expression = expression.expression;
  return expression;
}

function literal(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  return `(${Object.is(value, -0) ? '-0' : String(value)})`;
}

// Binding comes from TypeScript's checker: namespace imports, import aliases,
// re-export chains and every lexical shadow retain their actual symbol identity.
export function transformHostConstEnums(ts, program, source, pins) {
  const checker = program.getTypeChecker();
  const edits = [], references = [], validated = new Map();
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const at = (node, message) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    fail(`${source.fileName}:${line + 1}:${character + 1}: ${message}`);
  };
  const symbolOf = node => {
    node = unwrap(ts, node);
    const symbol = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node) ?? (ts.isElementAccessExpression(node) && (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
        ? checker.getPropertyOfType(checker.getTypeAtLocation(node.expression), node.argumentExpression.text) : undefined);
    return unalias(ts, checker, symbol);
  };
  const enumOf = node => {
    const symbol = symbolOf(node);
    const declaration = symbol?.declarations?.find(ts.isEnumDeclaration);
    if (!declaration) return undefined;
    if (validated.has(declaration)) return validated.get(declaration);
    const filename = resolve(declaration.getSourceFile().fileName);
    const pin = [...pins.values()].find(pin => pin.name === declaration.name.text && [pin.source, pin.declaration].includes(filename));
    if (!declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ConstKeyword)) {
      if (pin) at(node, `reviewed declaration is no longer a const enum: ${pin.name}`);
      return undefined;
    }
    if (!pin) at(node, `unreviewed erased const enum ${declaration.name.text} (${filename})`);
    const values = enumValues(ts, checker, declaration);
    if (!sameValues(values, pin.values)) at(node, `declaration/source member mismatch: ${pin.name}`);
    validated.set(declaration, pin);
    return pin;
  };
  const edit = (node, text) => edits.push({ start: node.getStart(source), end: node.end, text });
  const print = node => printer.printNode(ts.EmitHint.Unspecified, node, source);
  const rewriteImport = node => {
    const clause = node.importClause;
    if (clause && !clause.isTypeOnly && [...pins.values()].some(pin => pin.package === node.moduleSpecifier.text) && !checker.getSymbolAtLocation(node.moduleSpecifier)) at(node, 'cannot bind the reviewed external enum module');
    if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
    let changed = false;
    const typescript = /\.[cm]?tsx?$/.test(source.fileName);
    const elements = clause.namedBindings.elements.flatMap(item => {
      if (item.isTypeOnly || !enumOf(item.name)) return [item];
      changed = true;
      return typescript ? [ts.factory.updateImportSpecifier(item, true, item.propertyName, item.name)] : [];
    });
    if (!changed) return;
    if (!elements.length && !clause.name) { edit(node, ''); return; }
    const bindings = elements.length ? ts.factory.updateNamedImports(clause.namedBindings, elements) : undefined;
    edit(node, print(ts.factory.updateImportDeclaration(node, node.modifiers, ts.factory.updateImportClause(clause, false, clause.name, bindings), node.moduleSpecifier, node.attributes)));
  };
  const rewriteExport = node => {
    if (node.isTypeOnly || !node.exportClause || !ts.isNamedExports(node.exportClause)) return;
    const elements = node.exportClause.elements.filter(item => item.isTypeOnly || !enumOf(item.name));
    if (elements.length === node.exportClause.elements.length) return;
    // The source graph still carries its types. Esbuild never emits a value
    // re-export of an enum which the real external runtime deliberately erased.
    const removed = node.exportClause.elements.filter(item => !elements.includes(item));
    const typeExport = /\.[cm]?tsx?$/.test(source.fileName) ? print(ts.factory.updateExportDeclaration(node, node.modifiers, true, ts.factory.updateNamedExports(node.exportClause, removed), node.moduleSpecifier, node.attributes)) : '';
    const valueExport = elements.length ? print(ts.factory.updateExportDeclaration(node, node.modifiers, false, ts.factory.updateNamedExports(node.exportClause, elements), node.moduleSpecifier, node.attributes)) : '';
    edit(node, [valueExport, typeExport].filter(Boolean).join('\n'));
  };
  const namespaceEnums = node => {
    const symbol = symbolOf(node);
    if (!symbol || !(symbol.flags & ts.SymbolFlags.Module)) return [];
    return checker.getExportsOfModule(symbol).filter(item => unalias(ts, checker, item)?.declarations?.some(declaration => ts.isEnumDeclaration(declaration) && declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ConstKeyword)));
  };
  const visit = node => {
    if (ts.isEnumDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ConstKeyword)) enumOf(node.name);
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
      const erased = namespaceEnums(node.initializer).map(item => item.name);
      for (const item of node.name.elements) {
        if (item.dotDotDotToken && erased.length || erased.includes((item.propertyName ?? item.name).text)) at(item, 'cannot destructure an erased const enum from its namespace');
      }
    }
    if (ts.isElementAccessExpression(node) && !ts.isStringLiteral(node.argumentExpression) && !ts.isNoSubstitutionTemplateLiteral(node.argumentExpression) && namespaceEnums(node.expression).length) at(node, 'dynamic namespace lookup may access an erased const enum');
    if (ts.isImportDeclaration(node)) { rewriteImport(node); return; }
    if (ts.isExportDeclaration(node)) { rewriteExport(node); return; }
    if (ts.isImportEqualsDeclaration(node)) {
      if (enumOf(node.name)) edit(node, print(ts.factory.updateImportEqualsDeclaration(node, node.modifiers, true, node.name, node.moduleReference)));
      return;
    }
    if (typePosition(ts, node)) return;
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const pin = enumOf(node.expression);
      if (pin) {
        const name = ts.isPropertyAccessExpression(node) ? node.name.text : ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined;
        if (name === undefined || !pin.values.has(name)) at(node, `unknown or dynamic enum member: ${pin.name}.${name ?? '[computed]'}`);
        if (node.questionDotToken) at(node, `optional enum access: ${pin.name}`);
        let target = node;
        while (target.parent && (ts.isParenthesizedExpression(target.parent) || ts.isAsExpression(target.parent) || ts.isNonNullExpression(target.parent))) target = target.parent;
        const parent = target.parent;
        if ((ts.isBinaryExpression(parent) && parent.left === target && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) || (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator) || ts.isDeleteExpression(parent)) at(node, `const enum member is not writable: ${pin.name}.${name}`);
        edit(node, literal(pin.values.get(name)));
        references.push({ enum: pin.name, member: name, value: pin.values.get(name), start: node.getStart(source) });
        return;
      }
      if (enumOf(node)) at(node, 'const enum used as a runtime object');
    }
    if (ts.isIdentifier(node) && enumOf(node)) at(node, 'const enum used as a runtime object');
    ts.forEachChild(node, visit);
  };
  visit(source);
  let contents = source.text;
  for (const item of edits.sort((a, b) => b.start - a.start)) contents = contents.slice(0, item.start) + item.text + contents.slice(item.end);
  return { contents, references };
}

export function assertHostEnumOutput(ts, text, filename, pins) {
  const path = resolve(filename), program = createHostEnumProgram(ts, [path], new Map([[path, text]]));
  const source = program.getSourceFile(path), checker = program.getTypeChecker();
  const packages = new Map();
  for (const pin of pins.values()) {
    if (!packages.has(pin.package)) packages.set(pin.package, new Set());
    packages.get(pin.package).add(pin.name);
  }
  const namespaces = new Map();
  const requiredPackage = node => {
    if (!node) return undefined;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) return node.arguments[0].text;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['__toESM', '__toCommonJS'].includes(node.expression.text)) return requiredPackage(node.arguments[0]);
  };
  const collect = node => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const pkg = requiredPackage(node.initializer);
      if (packages.has(pkg)) {
        if (!ts.isIdentifier(node.name)) fail(`enum namespace destructuring in ${filename}`);
        namespaces.set(checker.getSymbolAtLocation(node.name), pkg);
      }
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && packages.has(node.moduleSpecifier.text)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.set(checker.getSymbolAtLocation(bindings.name), node.moduleSpecifier.text);
      if (bindings && ts.isNamedImports(bindings) && bindings.elements.some(item => packages.get(node.moduleSpecifier.text).has((item.propertyName ?? item.name).text))) fail(`runtime enum import in ${filename}`);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  const visit = node => {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const expression = unwrap(ts, node.expression);
      const pkg = namespaces.get(checker.getSymbolAtLocation(expression)) ?? requiredPackage(expression);
      const name = ts.isPropertyAccessExpression(node) ? node.name.text : ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined;
      if (packages.has(pkg) && (name === undefined || packages.get(pkg).has(name))) fail(`runtime erased enum reference in ${filename}: ${pkg}.${name ?? '[computed]'}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

export async function createHostConstEnums({ root, snapshot, entryPoints, resolveImport, ts, manifest }) {
  manifest ??= JSON.parse(await readFile(manifestUrl, 'utf8'));
  ts ??= await loadHostTypeScript(root, manifest);
  const pins = await loadHostEnumPins(ts, root, snapshot, manifest);
  const require = createRequire(join(root, 'package.json'));
  const sdkOwner = require.resolve('@deepseek-ai/dsh/package.json');
  const typeOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
  const resolveGraphImport = (specifier, importer) => {
    const local = resolveImport?.(specifier, importer);
    if (local) return local;
    if (!specifier.startsWith('.') && !specifier.startsWith('node:') && !specifier.startsWith('/')) {
      return ts.resolveModuleName(specifier, importer, typeOptions, ts.sys).resolvedModule?.resolvedFileName
        ?? ts.resolveModuleName(specifier, sdkOwner, typeOptions, ts.sys).resolvedModule?.resolvedFileName;
    }
  };
  const canonical = (path, base = root) => {
    const absolute = resolve(base, path);
    try { return realpathSync(absolute); }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; return absolute; }
  };
  const runtimeRoots = new Set([...pins.values()].map(pin => canonical(dirname(dirname(pin.source)))));
  const runtimePackages = new Set([...pins.values()].map(pin => sep + join('node_modules', pin.package)));
  const inside = (path, directory) => {
    const local = relative(directory, path);
    return local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local);
  };
  const graphDirectories = new WeakMap();
  const roots = new Set(entryPoints.map(path => resolve(root, path))), sources = new Map(), transformed = new Map();
  let program = createHostEnumProgram(ts, [...roots], sources, resolveGraphImport);
  const plugin = { name: 'host-const-enums', setup(build) {
    const workingDir = build.initialOptions.absWorkingDir ?? process.cwd();
    build.onEnd(result => { graphDirectories.set(result, workingDir); });
    // This covers every source loaded by all host entries, not a tool-name list.
    build.onLoad({ filter: /\.[cm]?[jt]sx?$/, namespace: 'file' }, async args => {
      const path = resolve(args.path), text = await readFile(path, 'utf8');
      const cached = transformed.get(path);
      if (cached?.source === text) return cached.output;
      if (!program.getSourceFile(path) || program.getSourceFile(path).text !== text) {
        roots.add(path); sources.set(path, text);
        program = createHostEnumProgram(ts, [...roots], sources, resolveGraphImport);
      }
      const source = program.getSourceFile(path);
      const result = transformHostConstEnums(ts, program, source, pins);
      const extension = extname(path).slice(1);
      const output = { contents: result.contents, loader: ['tsx', 'jsx'].includes(extension) ? extension : extension.endsWith('ts') ? 'ts' : 'js', resolveDir: dirname(path) };
      transformed.set(path, { source: text, output, references: result.references });
      return output;
    });
  } };
  return { plugin, ts, pins, references: () => [...transformed].flatMap(([path, value]) => value.references.map(item => ({ path, ...item }))),
    assertExternal(result) {
      const workingDir = graphDirectories.get(result) ?? root;
      for (const output of Object.values(result.metafile.outputs)) {
        for (const [path, input] of Object.entries(output.inputs)) {
          if (!(input.bytesInOutput > 0)) continue;
          const absolute = canonical(path, workingDir);
          const duplicate = [...runtimePackages].some(pkg => absolute.endsWith(pkg) || absolute.includes(pkg + sep));
          if (duplicate || [...runtimeRoots].some(directory => inside(absolute, directory))) fail('a second Cordis was bundled into the host graph');
        }
      }
    },
    async assertOutput(result) {
      const workingDir = graphDirectories.get(result) ?? root;
      for (const path of Object.keys(result.metafile.outputs)) {
        if (!/\.[cm]?js$/.test(path) && path !== '<stdout>') continue;
        const absolute = resolve(workingDir, path);
        const file = result.outputFiles?.find(file => file.path === '<stdout>' || resolve(workingDir, file.path) === absolute);
        assertHostEnumOutput(ts, file?.text ?? await readFile(absolute, 'utf8'), absolute, pins);
      }
    } };
}
