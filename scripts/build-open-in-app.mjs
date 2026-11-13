// Retain the pinned native UI, shortcut, opener and permission checks; only
// replace its initial-cwd selectors with the live native cwd projection.
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { hostClientSource, replaceExactly, clientRegistration } from './host-build-contracts.mjs';
const root = new URL('../', import.meta.url);
let { pkg, version, source } = await hostClientSource(root, '@deepseek-ai/dsh-client-ui-open-in-app');
const hash = createHash('sha256').update(source).digest('hex');
if (pkg.version !== version || version !== '0.2.2-rc.3' || hash !== '8d8b4a6519483402119ce2a9901f3d26bfb51b8743ed2246453b19a285277825') throw Error('Unreviewed native open-in-app client');
const replaceOnce = (before, after) => { source = replaceExactly(source, before, after, pkg.name); };
replaceOnce('function registerSessionOpenWith(ctx,', `function currentDirectory(ctx, sessionId) {
  return ctx.sessions.binding(sessionId)?.session.projections.faceOf('workingDirectory')?.getSnapshot()
    ?? ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd;
}function registerSessionOpenWith(ctx,`);
replaceOnce('const directory=ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd', 'const directory=currentDirectory(ctx,sessionId)');
replaceOnce('return session?.cwd&&appId!==void 0?{appId,path:session.cwd}', 'const cwd=session&&currentDirectory(ctx,session.id);return cwd&&appId!==void 0?{appId,path:cwd}');
await mkdir(new URL('lib/host/', root), { recursive: true });
await writeFile(new URL('lib/host/open-in-app.factory.mjs', root),
  `// ${pkg.name} ${version}; upstream SHA-256 ${hash}\nexport function createOpenInApp(require) {\n${clientRegistration(source, pkg.name)}\nreturn registration.factory(require); }\n`);
