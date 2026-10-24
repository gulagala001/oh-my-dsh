import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { mkdir, rename, stat, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/** A failure the page can localize by code; `message` is the English fallback. */
export class ExtensionError extends Error {
  constructor(code, message, params = {}, status = 400) {
    super(message);
    this.code = code; this.params = params; this.status = status;
  }
}
export const fail = (code, message, params, status) => { throw new ExtensionError(code, message, params, status); };

export function homes() {
  const home = homedir();
  return {
    dsh: resolve(process.env.DSH_HOME || join(home, '.dsh')),
    agents: resolve(process.env.DSH_AGENTS_HOME || join(home, '.agents')),
  };
}

export const inside = (root, path) => {
  const child = relative(root, path);
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
};

export async function kind(path) {
  try { const info = await stat(path); return info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other'; }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null; throw error; }
}

/** Same rule as DSH's instruction and skill loaders: the nearest ancestor holding a marker, else cwd. */
export async function findProjectRoot(cwd, markers = ['.git']) {
  let dir = resolve(cwd);
  for (;;) {
    for (const marker of markers) if (await kind(join(dir, marker))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
}

export async function writeAtomic(path, text, beforeCommit) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try { await writeFile(temporary, text, { mode: 0o600 }); await beforeCommit?.(); await rename(temporary, path); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

/** Home-relative display form of a path. */
export const tilde = path => path && inside(homedir(), path) && path !== homedir() ? '~/' + relative(homedir(), path) : path;
export const errorText = error => error instanceof Error ? error.message : String(error);
export const trimTo = (text, max) => text.length > max ? text.slice(0, max) + '…' : text;
