import { glob } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
const requireHost = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const { default: Persistence } = await import(pathToFileURL(requireHost.resolve('@deepseek-ai/dsh-session-persistence-jsonl')).href);

// Read with the unmodified host backend, independently of OMD's live Session.
export async function restoreFixtureLog(home, sessionId) {
  let file;
  for await (const candidate of glob(join(home, '**', 'session.v4.jsonl.zstd'))) {
    if (dirname(candidate).endsWith(sessionId)) { file = candidate; break; }
  }
  if (!file) throw Error('No durable log for ' + sessionId);
  const ctx = new Context();
  try {
    await ctx.plugin(Persistence, { root: dirname(dirname(dirname(file))), compression: 'zstd' });
    const handle = await ctx.sessionPersistence.open(sessionId, 'read');
    try { return await handle.read(); } finally { await handle.close(); }
  } finally { await ctx.fiber.dispose(); }
}
