// Retain the pinned native UI, shortcut, opener and permission checks; only
// replace its initial-cwd selectors with the live native cwd projection.
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { hostClientSource, replaceExactly, clientRegistration } from './host-build-contracts.mjs';
const root = new URL('../', import.meta.url);
let { pkg, version, source } = await hostClientSource(root, '@deepseek-ai/dsh-client-ui-open-in-app');
const hash = createHash('sha256').update(source).digest('hex');
if (pkg.version !== version || !['0.2.1-rc.3', '0.2.1-rc.5'].includes(version) || hash !== '7a3adda611ea8318322e474294cba4c5a36be30f879c98dc52a41b57363cd6dc') throw Error('Unreviewed native open-in-app client');
const replaceOnce = (before, after) => { source = replaceExactly(source, before, after, pkg.name); };
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
await mkdir(new URL('lib/host/', root), { recursive: true });
await writeFile(new URL('lib/host/open-in-app.factory.mjs', root),
  `// ${pkg.name} ${version}; upstream SHA-256 ${hash}\nexport function createOpenInApp(require) {\n${clientRegistration(source, pkg.name)}\nreturn registration.factory(require); }\n`);
