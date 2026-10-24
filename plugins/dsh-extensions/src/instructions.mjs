import { createReadStream } from 'node:fs';
import { lstat, realpath, rm, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fail, findProjectRoot, tilde, writeAtomic } from './common.mjs';

const INSTRUCTIONS_MODULE = '@deepseek-ai/dsh-agent-instructions';
export const MAX_INSTRUCTION_BYTES = 1024 * 1024;
// Only creation needs a candidate that does not exist yet. Keep it in the
// current directory, as required by the native discovery API.
const names = values => values.filter(name => name && name !== '.' && name !== '..' && !/[\\/]/.test(name));
const missing = error => error.code === 'ENOENT' || error.code === 'ENOTDIR';

/** Edit native instruction candidates using the active, validated preset configs. */
export class Instructions {
  constructor(ctx, homes) {
    this.ctx = ctx; this.homes = homes; this.pending = Promise.resolve(); this.controller = new AbortController();
    ctx.effect(() => () => { this.controller.abort(Error('The instruction editor is stopped')); return this.pending; });
  }
  async describe(path, extra) {
    const entry = await lstat(path).catch(error => { if (missing(error)) return null; throw error; });
    const info = entry?.isSymbolicLink() ? await stat(path) : entry;
    if (info && !info.isFile()) fail('instruction-path', 'The instruction path is not a regular file', {}, 403);
    return { path, exists: !!info, size: info?.size ?? 0, modifiedAt: info?.mtimeMs ?? null, ...extra };
  }
  async withFiles(scope, use, requestSignal) {
    const signal = requestSignal ? AbortSignal.any([this.controller.signal, requestSignal]) : this.controller.signal;
    signal.throwIfAborted();
    const loader = this.ctx.get('loader');
    if (!loader?.import) fail('service-missing', 'The native instruction loader is unavailable', {}, 503);
    const [native, routing] = await Promise.all([loader.import(INSTRUCTIONS_MODULE), loader.import('@deepseek-ai/dsh-scope')]);
    const presets = this.ctx.get('agentPresets'), defaultId = presets?.defaultId;
    const lease = presets && await presets.acquireScope(defaultId);
    try {
      const keys = new Set([undefined, ...routing.scopeChainOf(lease?.key)]), views = [];
      for (const agent of scope.cwd ? this.ctx.get('agents')?.list?.() ?? [] : []) {
        const cwd = this.ctx.get('workingDirectory')?.get?.(agent.session) ?? agent.session?.header?.cwd;
        if (agent.session?.header?.origin !== 'subagent' && cwd && resolve(cwd) === resolve(scope.cwd)) {
          const chain = routing.scopeChainOf(routing.scopeOf(agent.ctx));
          views.push({ agent, chain });
          for (const key of chain) keys.add(key);
        }
      }
      const policies = [...this.ctx.registry.get(native)?.fibers ?? []]
        .filter(fiber => fiber.state === 2 && keys.has(routing.scopeOf(fiber.ctx)) && Number.isFinite(fiber.config.maxBytes) && fiber.config.maxBytes > 0)
        .map(fiber => ({ fiber, config: fiber.config }));
      const check = async () => {
        signal.throwIfAborted();
        let changed = presets?.defaultId !== defaultId || policies.some(({ fiber, config }) => fiber.state !== 2 || fiber.config !== config)
          || views.some(({ agent, chain }) => {
            const current = routing.scopeChainOf(routing.scopeOf(agent.ctx));
            return current.length !== chain.length || current.some((key, index) => key !== chain[index]);
          });
        if (presets && !changed) {
          const current = await presets.acquireScope(defaultId);
          try { changed = current.key !== lease.key; } finally { await current[Symbol.asyncDispose](); }
        }
        signal.throwIfAborted();
        if (changed)
          fail('instruction-changed', 'The instruction preset changed; refresh and try again', {}, 409);
      };
      const rows = new Map(), roots = new Set(), candidates = new Set(), localCandidates = new Set();
      const personal = join(this.homes.dsh, 'AGENTS.md'), shared = join(this.homes.agents, 'AGENTS.md');
      for (const { config } of policies) {
        const primary = names(config.instructionFileCandidates), local = names(config.localInstructionFileCandidates);
        primary.forEach(name => candidates.add(name)); local.forEach(name => localCandidates.add(name));
        const cwd = resolve(scope.cwd ?? this.homes.dsh);
        const root = scope.cwd ? await findProjectRoot(cwd, config.projectRootMarkers) : cwd;
        if (scope.cwd) roots.add(root);
        const discovered = await native.discoverBaselineInstructionFiles({ ...config, cwd, projectRoot: root,
          ...scope.cwd ? {} : { instructionFileCandidates: [], localInstructionFileCandidates: [] },
          dshHome: this.homes.dsh, agentsHome: this.homes.agents, signal });
        const paths = new Map(discovered.map(file => [file.absolutePath, file.displayPath]));
        paths.set(personal, tilde(personal));
        if (scope.cwd && primary[0]) paths.set(join(cwd, primary[0]), relative(root, join(cwd, primary[0])));
        for (const [path, display] of paths) {
          const group = path === personal || path === shared ? 'user' : 'project';
          const creatable = path === personal || group === 'project' && path === join(cwd, primary[0] ?? '');
          let row = rows.get(path);
          if (!row) {
            row = await this.describe(path, { group, display, local: group === 'project' && local.includes(basename(path)), creatable, sourceLimits: [] });
            rows.set(path, row);
          }
          row.creatable ||= creatable;
          if (!row.sourceLimits.includes(config.maxSourceBytes)) row.sourceLimits.push(config.maxSourceBytes);
        }
      }
      for (const row of rows.values()) {
        row.maxBytes = Math.min(MAX_INSTRUCTION_BYTES, Math.max(...row.sourceLimits));
        row.tooLarge = row.size > row.maxBytes;
        row.partiallyLimited = row.size > Math.min(...row.sourceLimits) && !row.tooLarge;
      }
      await check();
      return await use({ files: [...rows.values()], active: policies.length > 0, candidates: [...candidates],
        localCandidates: [...localCandidates], projectRoot: roots.size === 1 ? tilde([...roots][0]) : null }, check, signal);
    } finally { await lease?.[Symbol.asyncDispose](); }
  }
  list(scope, signal) { return this.withFiles(scope, value => value, signal); }
  allowed(files, path) {
    const file = files.find(item => item.path === path);
    if (!file) fail('instruction-path', 'This file is not an instruction file DSH reads here', {}, 403);
    return file;
  }
  checkSize(file, size) {
    if (size > file.maxBytes) fail('instruction-too-large', 'The file exceeds the instruction editing limit', { limit: file.maxBytes });
  }
  read(scope, path, signal) {
    return this.withFiles(scope, async ({ files }, check, readSignal) => {
      const file = this.allowed(files, path);
      if (!file.exists) return { ...file, content: '' };
      this.checkSize(file, file.size);
      let content = '', size = 0;
      for await (const chunk of createReadStream(path, { encoding: 'utf8', signal: readSignal })) {
        size += Buffer.byteLength(chunk); this.checkSize(file, size); content += chunk;
      }
      await check(); return { ...file, content };
    }, signal);
  }
  mutate(scope, action, signal) {
    const task = this.pending.then(() => this.withFiles(scope, action, signal));
    this.pending = task.catch(() => {}); return task;
  }
  save(scope, path, content, signal) {
    return this.mutate(scope, async ({ files }, check) => {
      const file = this.allowed(files, path);
      if (typeof content !== 'string') fail('content-required', 'Content is required');
      this.checkSize(file, Buffer.byteLength(content));
      const target = file.exists ? await realpath(path) : path;
      await writeAtomic(target, content, check);
    }, signal);
  }
  remove(scope, path, signal) {
    return this.mutate(scope, async ({ files }, check) => {
      const file = this.allowed(files, path); await check();
      if (file.exists) await rm(path);
    }, signal);
  }
}
