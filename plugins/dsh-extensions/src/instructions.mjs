import { readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fail, findProjectRoot, tilde, writeAtomic } from './common.mjs';

const INSTRUCTIONS_MODULE = '@deepseek-ai/dsh-agent-instructions';
const DEFAULTS = { projectRootMarkers: ['.git'], instructionFileCandidates: ['AGENTS.md', 'CLAUDE.md'], localInstructionFileCandidates: ['AGENTS.local.md', 'CLAUDE.local.md'] };
const MAX_BYTES = 1024 * 1024;

/** The files DSH's instruction loader reads, located with its active configuration. */
export class Instructions {
  constructor(ctx, homes) { this.ctx = ctx; this.homes = homes; }
  config() {
    try {
      const found = (this.ctx.get('configEditor')?.configuration() ?? []).find(item => item.entry?.options?.name === INSTRUCTIONS_MODULE);
      const value = found ? { ...found.inherited, ...found.override } : {};
      const list = (key) => Array.isArray(value[key]) && value[key].every(item => typeof item === 'string') ? value[key] : DEFAULTS[key];
      return { projectRootMarkers: list('projectRootMarkers'), instructionFileCandidates: list('instructionFileCandidates'), localInstructionFileCandidates: list('localInstructionFileCandidates') };
    } catch { return DEFAULTS; }
  }
  async describe(path, extra) {
    const info = await stat(path).catch(() => null);
    return { path, exists: !!info?.isFile(), size: info?.isFile() ? info.size : 0, modifiedAt: info?.isFile() ? info.mtimeMs : null, tooLarge: (info?.size ?? 0) > MAX_BYTES, ...extra };
  }
  async candidates(scope) {
    const config = this.config();
    const files = [await this.describe(join(this.homes.dsh, 'AGENTS.md'), { group: 'user', display: tilde(join(this.homes.dsh, 'AGENTS.md')), creatable: true })];
    const shared = await this.describe(join(this.homes.agents, 'AGENTS.md'), { group: 'user', display: tilde(join(this.homes.agents, 'AGENTS.md')), creatable: false });
    if (shared.exists) files.push(shared);
    if (!scope.cwd) return { files, config };
    const cwd = resolve(scope.cwd), root = await findProjectRoot(cwd, config.projectRootMarkers);
    const chain = [];
    for (let dir = cwd; ; dir = dirname(dir)) { chain.unshift(dir); if (dir === root || dirname(dir) === dir) break; }
    for (const dir of chain) {
      for (const [names, local] of [[config.instructionFileCandidates, false], [config.localInstructionFileCandidates, true]]) {
        for (const name of names) {
          const path = join(dir, name), display = relative(root, path) || name;
          const creatable = dir === cwd && !local && name === names[0];
          const file = await this.describe(path, { group: 'project', display, local, creatable });
          if (file.exists || creatable) files.push(file);
        }
      }
    }
    return { files, config, projectRoot: root };
  }
  async list(scope) {
    const { files, config, projectRoot } = await this.candidates(scope);
    return { files, candidates: config.instructionFileCandidates, localCandidates: config.localInstructionFileCandidates, projectRoot: projectRoot ? tilde(projectRoot) : null };
  }
  async allowed(scope, path) {
    const file = (await this.candidates(scope)).files.find(item => item.path === path);
    if (!file) fail('instruction-path', 'This file is not an instruction file DSH reads here', {}, 403);
    return file;
  }
  async read(scope, path) {
    const file = await this.allowed(scope, path);
    if (!file.exists) return { ...file, content: '' };
    if (file.tooLarge) fail('instruction-too-large', 'The file is larger than DSH loads (1 MiB)');
    return { ...file, content: await readFile(path, 'utf8') };
  }
  async save(scope, path, content) {
    await this.allowed(scope, path);
    if (typeof content !== 'string') fail('content-required', 'Content is required');
    if (Buffer.byteLength(content) > MAX_BYTES) fail('instruction-too-large', 'The file is larger than DSH loads (1 MiB)');
    await writeAtomic(path, content);
  }
  async remove(scope, path) {
    const file = await this.allowed(scope, path);
    if (file.exists) await rm(path);
  }
}
