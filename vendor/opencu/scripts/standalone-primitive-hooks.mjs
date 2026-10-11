import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { analyze } from 'eslint-scope';

const require = createRequire(import.meta.url);
const packageName = '@deepseek-ai/dsh-client-ui-primitives';
const hostPackageName = '@deepseek-ai/dsh';
const reviewedSources = new Map([
  ['0.2.1-alpha.2', { version: '0.2.1-alpha.2', sha256: 'c954d31fce29ba4cb2d7ed752ec2d4c45a24724bc3af4e45039420f7e3d2f75f' }],
  ['0.2.0-rc.2', { version: '0.2.0-rc.2', sha256: '6b551f0039ae2632704aab24011fad333fa46181129623e786629358f9494523' }],
]);
const hookNames = ['useAnchoredPosition', 'useAnchoredMaxHeight', 'useDismissOnOutsidePointer'];
const declarationNames = new Set([...hookNames, 'MARGIN', 'overlayTopMargin']);
const browserGlobals = new Set(['window', 'document', 'getComputedStyle', 'Math', 'Number', 'Node', 'ResizeObserver']);
const digest = source => createHash('sha256').update(source).digest('hex');
const parseModule = source => parse(source, { ecmaVersion: 2022, sourceType: 'module', ranges: true });
const freeIdentifiers = source => analyze(parseModule(source), { ecmaVersion: 2022, sourceType: 'module' }).globalScope.through.map(reference => reference.identifier.name);

export async function extractStandalonePrimitiveHooks() {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const hostVersion = manifest.devDependencies?.[hostPackageName];
  const reviewedSource = reviewedSources.get(hostVersion);
  if (!reviewedSource || manifest.devDependencies?.[packageName] !== reviewedSource.version) {
    throw new Error('The standalone primitive hook source must match the declared exact reviewed host and primitive versions.');
  }
  const hostMetadata = JSON.parse(await readFile(require.resolve(`${hostPackageName}/package.json`), 'utf8'));
  if (hostMetadata.name !== hostPackageName || hostMetadata.version !== hostVersion) {
    throw new Error('The installed DSH SDK does not match the declared standalone primitive hook host version.');
  }
  const sourceVersion = reviewedSource.version, sourceSha256 = reviewedSource.sha256;
  const metadata = JSON.parse(await readFile(require.resolve(`${packageName}/package.json`), 'utf8'));
  const sourcePath = require.resolve(packageName);
  const source = await readFile(sourcePath, 'utf8');
  if (metadata.version !== sourceVersion || metadata.name !== packageName || digest(source) !== sourceSha256 || metadata.license !== 'MIT') {
    throw new Error('The standalone primitive hook source does not match its reviewed package/version/hash/license.');
  }
  const declarations = new Map(), imports = new Map();
  for (const node of parseModule(source).body) {
    if (node.type === 'ImportDeclaration') for (const specifier of node.specifiers) imports.set(specifier.local.name, node);
    if (node.type === 'FunctionDeclaration' && node.id) declarations.set(node.id.name, node);
    if (node.type === 'VariableDeclaration' && node.declarations.length === 1 && node.declarations[0].id.type === 'Identifier') {
      declarations.set(node.declarations[0].id.name, node);
    }
  }
  const selected = new Map(), selectedImports = new Set();
  const visit = name => {
    if (selected.has(name)) return;
    const declaration = declarations.get(name);
    if (!declarationNames.has(name) || !declaration) throw new Error(`Unreviewed standalone primitive declaration: ${name}`);
    selected.set(name, declaration);
    for (const dependency of freeIdentifiers(source.slice(declaration.start, declaration.end))) {
      if (browserGlobals.has(dependency)) continue;
      const imported = imports.get(dependency);
      if (imported) {
        if (imported.source.value !== 'react') throw new Error(`Unreviewed standalone primitive import: ${dependency}`);
        selectedImports.add(imported);
      } else visit(dependency);
    }
  };
  hookNames.forEach(visit);
  const nodes = [...selectedImports, ...selected.values()].sort((a, b) => a.start - b.start);
  const extracted = nodes.map(node => source.slice(node.start, node.end)).join('\n\n') + `\nexport { ${hookNames.join(', ')} };\n`;
  const unknown = [...new Set(freeIdentifiers(extracted))].filter(name => !browserGlobals.has(name));
  if (unknown.length) throw new Error(`Standalone primitive dependencies are not closed: ${unknown.join(', ')}`);
  const license = await readFile(new URL('../vendor/dsh-chat/LICENSE', import.meta.url), 'utf8');
  if (!license.startsWith('MIT License\n\nCopyright (c) 2026 DeepSeek\n')) throw new Error('Unexpected DSH source license.');
  const provenance = {
    package: packageName, version: sourceVersion, hostVersion, source: metadata.repository?.url,
    sourceFile: 'lib/index.js', sourceSha256, extractedSha256: digest(extracted),
    declarations: [...selected.keys()], imports: ['react'], browserGlobals: [...new Set(freeIdentifiers(extracted))].sort(), license: 'MIT',
  };
  const contents = `/*! @license ${packageName}@${sourceVersion}\nSource SHA256: ${sourceSha256}\n${license}*/\n${extracted}`;
  return { contents, license, provenance };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/standalone-primitive-hooks.mjs');
  console.log(JSON.stringify((await extractStandalonePrimitiveHooks()).provenance, null, 2));
}
