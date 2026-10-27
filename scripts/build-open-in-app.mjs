// Retain the pinned native UI, shortcut, opener and permission checks; only
// replace its initial-cwd selectors with the live native cwd projection.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const hostRequire = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
const manifest = hostRequire.resolve('@deepseek-ai/dsh-client-ui-open-in-app/package.json');
const pkg = JSON.parse(await readFile(manifest, 'utf8'));
const version = JSON.parse(await readFile(new URL('package.json', root), 'utf8')).devDependencies['@deepseek-ai/dsh'];
let source = await readFile(new URL('lib/client.js', pathToFileURL(manifest)), 'utf8');
const hash = createHash('sha256').update(source).digest('hex');
if (pkg.version !== version || version !== '0.2.1-rc.3' || hash !== '7a3adda611ea8318322e474294cba4c5a36be30f879c98dc52a41b57363cd6dc') throw Error('Unreviewed native open-in-app client');
const replaceOnce = (before, after) => {
  if (source.split(before).length !== 2) throw Error('Native open-in-app boundary changed');
  source = source.replace(before, after);
};
replaceOnce('const target = () => {', `const emptyDirectory = { subscribe: () => () => {}, getSnapshot: () => undefined };
      const directoryStore = id => ctx.sessions.binding(id)?.session.projections.faceOf('workingDirectory') ?? emptyDirectory;
      const target = () => {`);
replaceOnce('return session?.cwd && appId !== void 0 ? {\n\t\t\t\t\tappId,\n\t\t\t\t\tpath: session.cwd', `const cwd = session && (directoryStore(session.id).getSnapshot() ?? session.cwd);
        return cwd && appId !== void 0 ? {
          appId,
          path: cwd`);
replaceOnce('const cwd = useSessions((state) => state.byId[sessionId]?.cwd);', `const initial = useSessions((state) => state.byId[sessionId]?.cwd);
        const store = directoryStore(sessionId);
        const cwd = react.useSyncExternalStore(fn => store.subscribe(fn), () => store.getSnapshot()) ?? initial;`);
source = source.replace(/^\/\/# sourceMappingURL=.*\n?/gm, '');
await mkdir(new URL('lib/host/', root), { recursive: true });
await writeFile(new URL('lib/host/open-in-app.factory.mjs', root),
  `// ${pkg.name} ${version}; upstream SHA-256 ${hash}\nexport function createOpenInApp(require) { let record; const window = {__ModuleLoader__: {load(value) { record = value; }}};\n${source}\nreturn record.factory(require); }\n`);
