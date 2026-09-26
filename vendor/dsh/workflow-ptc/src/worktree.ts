/** Git owns registration/removal; changed, committed, or uncertain checkouts are retained. */
import { execFile } from 'node:child_process'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, relative, resolve, sep, isAbsolute } from 'node:path'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type { ConfinedArgv, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'

type Confine = (argv: readonly string[], policy: SandboxPolicy, signal?: AbortSignal) => Promise<ConfinedArgv>
type Git = (cwd: string, args: string[], signal?: AbortSignal) => Promise<string>

async function git(cwd: string, args: string[], policy: SandboxExecutionPolicy, confine: Confine | undefined, overrides: string[], signal?: AbortSignal): Promise<string> {
  const original = ['git', '-c', 'core.hooksPath=', '-c', 'core.fsmonitor=false', ...overrides, ...args]
  if (policy.mode !== 'danger-full-access' && !confine) throw new Error('Worktree operations require the native sandbox provider in confined mode')
  const argv = policy.mode === 'danger-full-access' ? original : (await confine!(original, { ...policy, mode: policy.mode }, signal)).argv
  signal?.throwIfAborted()
  return new Promise((accept, reject) => {
    // Worktree setup must not execute repository hooks as a side effect.
    execFile(argv[0], argv.slice(1), {
      cwd, signal, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120_000,
      windowsHide: true,
      // Inherited GIT_DIR/INDEX_FILE/config injections must not redirect an
      // operation away from the caller's validated checkout.
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_TERMINAL_PROMPT: '0' },
    }, (error, stdout, stderr) => error ? reject(new Error(`git ${args[0]} failed: ${stderr.trim() || error.message}`, { cause: error })) : accept(stdout.replace(/\r?\n$/, '')))
  })
}

export interface WorktreeArtifact {
  path: string
  cwd: string
  repository: string
  base: string
  head?: string
  retained: boolean
  reason?: string
}

export class WorkflowWorktree {
  private settlement?: Promise<WorktreeArtifact>
  private constructor(readonly artifact: WorktreeArtifact, private readonly receiptPath: string, private readonly git: Git) {}

  static async create(cwd: string, stateDirectory: string, policy: SandboxExecutionPolicy, signal?: AbortSignal, confine?: Confine): Promise<WorkflowWorktree> {
    signal?.throwIfAborted()
    if (policy.mode === 'read-only') throw new Error('Worktree isolation requires a writable workspace')
    const overrides: string[] = []
    const runGit: Git = (cwd, args, signal) => git(cwd, args, policy, confine, overrides, signal)
    const repository = await realpath(await runGit(cwd, ['rev-parse', '--show-toplevel'], signal))
    // A checkout may otherwise execute a configured smudge/process filter.
    let filterKeys = ''
    try { filterKeys = await runGit(cwd, ['config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(smudge|process|required)$'], signal) }
    catch (error) { if ((error as any).cause?.code !== 1) throw error }
    for (const key of filterKeys.split('\0').filter(Boolean)) overrides.push('-c', key + (key.endsWith('.required') ? '=false' : '='))
    const sourceCwd = await realpath(cwd)
    const subdirectory = relative(repository, sourceCwd)
    if (subdirectory === '..' || subdirectory.startsWith('..' + sep) || isAbsolute(subdirectory) || resolve(repository, subdirectory) !== sourceCwd) throw new Error('Workflow cwd is not inside the repository')
    const base = await runGit(repository, ['rev-parse', '--verify', 'HEAD^{commit}'], signal)
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 })
    const canonicalState = await realpath(stateDirectory)
    const id = randomUUID(), path = join(canonicalState, id), receiptPath = join(canonicalState, id + '.json')
    const artifact: WorktreeArtifact = { path, cwd: join(path, subdirectory), repository, base, retained: true, reason: 'starting' }
    await writeFile(receiptPath, JSON.stringify(artifact) + '\n', { flag: 'wx', mode: 0o600 })
    const worktree = new WorkflowWorktree(artifact, receiptPath, runGit)
    try {
      await runGit(repository, ['worktree', 'add', '--detach', '--', path, base], signal)
      signal?.throwIfAborted()
      artifact.reason = 'running'
      await worktree.save()
      return worktree
    } catch (error) {
      // No recursive delete on a failed add: Git may have published a checkout
      // while cancellation was racing it. Its receipt remains discoverable.
      artifact.reason = `setup failed: ${String(error)}`
      await worktree.save()
      throw new Error(`Worktree setup failed; inspect ${path}: ${String(error)}`, { cause: error })
    }
  }

  private async save(): Promise<void> {
    await writeFile(this.receiptPath, JSON.stringify(this.artifact) + '\n', { mode: 0o600 })
  }

  /** Only the holder calls this, after native child disposal has completed. */
  settle(): Promise<WorktreeArtifact> {
    this.settlement ??= (async () => {
      try {
        const head = await this.git(this.artifact.path, ['rev-parse', '--verify', 'HEAD^{commit}'])
        this.artifact.head = head
        const status = await this.git(this.artifact.path, ['status', '--porcelain=v1', '--untracked-files=all', '--ignored', '--ignore-submodules=none'])
        if (head !== this.artifact.base) this.artifact.reason = 'contains new commits'
        else if (status) this.artifact.reason = 'contains changed, untracked, or ignored files'
        else {
          // Without --force, Git provides a final dirty/locked checkout check.
          await this.git(this.artifact.repository, ['worktree', 'remove', '--', this.artifact.path])
          this.artifact.retained = false
          this.artifact.reason = 'unchanged'
        }
      } catch (error) {
        this.artifact.reason = `cleanup could not prove the checkout unchanged: ${String(error)}`
      }
      await this.save()
      return { ...this.artifact }
    })()
    return this.settlement
  }
}
