/** Focused semantic check of the guest boundary, plus syntax checks of all patched TypeScript. */
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const [source, sdk, mode] = process.argv.slice(2);
if (mode !== undefined && mode !== '--syntax-only') throw Error('Unknown check mode');
if (!source || !sdk) throw Error('Usage: node desktop/check-host.mjs /absolute/patched-dsh-source /absolute/toolchain-with-node_modules');
const root = await realpath(resolve(source)), toolchain = await realpath(resolve(sdk));
for (const [file, version] of [['package.json', '0.2.1-rc.2']]) {
  if (JSON.parse(await readFile(join(root, file))).version !== version) throw Error('Expected DSH 0.2.1-rc.2');
}
for (const [name, version] of [['typescript', '6.0.3'], ['electron', '44.7.0']]) {
  if (JSON.parse(await readFile(join(toolchain, 'node_modules', name, 'package.json'))).version !== version) throw Error(`Expected ${name} ${version}`);
}
const ts = createRequire(join(toolchain, 'package.json'))('typescript');
const config = ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile);
if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const files = ['apps/desktop/src/browser-guests.ts', 'apps/desktop/src/preload-browser.ts', 'apps/desktop/src/deepseek-browser-policy.ts', 'apps/desktop/src/ipc.ts', 'apps/desktop/src/main.ts', 'apps/desktop/src/preload-app.ts', 'apps/desktop/src/platform-view.ts', 'packages/client/ui-sidebar-browser/src/types.ts'];
const syntax = [];
for (const file of files) {
  const text = await readFile(join(root, file), 'utf8');
  const result = ts.transpileModule(text, { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true } });
  syntax.push(...(result.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error));
}
if (mode === '--syntax-only') {
  if (syntax.length) throw Error(ts.formatDiagnosticsWithColorAndContext(syntax, { getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
  console.log(JSON.stringify({ status: 'passed', host: '0.2.1-rc.2', syntax: files, scope: 'Adapter TypeScript syntax only; no semantic typecheck or desktop build' }, null, 2));
  process.exit(0);
}
const parsed = ts.parseJsonConfigFileContent({ compilerOptions: config.config.compilerOptions }, ts.sys, root);
const options = { ...parsed.options, noEmit: true, composite: false, incremental: false, declaration: false, declarationMap: false,
  typeRoots: [join(toolchain, 'node_modules/@types')],
  paths: Object.fromEntries(Object.entries(parsed.options.paths).map(([name, values]) => [name, values.map(value => resolve(root, value))])),
};
options.paths.electron = [join(toolchain, 'node_modules/electron/electron.d.ts')];
const semanticFiles = files.filter(file => ['browser-guests.ts', 'preload-browser.ts', 'deepseek-browser-policy.ts'].some(name => file.endsWith('/' + name)));
const program = ts.createProgram(semanticFiles.map(file => join(root, file)), options);
const diagnostics = [...syntax, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
  process.exitCode = 1;
} else console.log(JSON.stringify({ status: 'passed', host: '0.2.1-rc.2', typescript: '6.0.3', electron: '44.7.0', semantic: semanticFiles, syntax: files, scope: 'Guest boundary semantic check and adapter source syntax; not a complete desktop build' }, null, 2));
