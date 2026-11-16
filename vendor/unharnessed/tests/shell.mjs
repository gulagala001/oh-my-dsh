import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveShell, ShellUnavailableError } from '../lib/shell.js'
import { runGates } from '../lib/goals.js'
import { stat, access, mkdtemp, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, win32, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'

const missing = () => Object.assign(Error('fixture missing executable'), { name: 'SubprocessExecutableNotFoundError' })
function fixture(files = [], peer) {
  const tried = [], normalize = value => value.replaceAll('\\', '/').toLowerCase()
  return { tried, get: () => peer, subprocess: { async resolveExecutable(path, _env, signal) {
    signal?.throwIfAborted(); tried.push(path)
    if (files.some(file => normalize(file) === normalize(path))) return path
    throw missing()
  } } }
}
const windows = env => ({ platform: 'win32', env })
test('Windows default Git install works when PATH has only Git/cmd', async () => {
  const ctx = fixture(['C:/Program Files/Git/bin/bash.exe'])
  assert.equal(win32.normalize(await resolveShell(ctx, 'bash', undefined, windows({ Path: 'C:\\Program Files\\Git\\cmd' }))), 'C:\\Program Files\\Git\\bin\\bash.exe')
})
test('Windows custom Git/cmd, per-user and Scoop installs are discovered', async () => {
  for (const [file, env] of [
    ['D:/Tools/Git/bin/bash.exe', { Path: '"D:\\Tools\\Git\\cmd"' }],
    ['D:/用户/AppData/Local/Programs/Git/bin/bash.exe', { localappdata: 'D:/用户/AppData/Local' }],
    ['D:/User/scoop/apps/git/current/bin/bash.exe', { USERPROFILE: 'D:/User' }],
  ]) assert.equal(win32.normalize(await resolveShell(fixture([file]), 'bash', undefined, windows(env))), win32.normalize(file))
})
test('Windows peer capability is optional and explicit choices never silently fall back', async () => {
  const file = 'E:/Portable Git/bin/bash.exe', ctx = fixture([file], { active: true, ok: true, bashPath: file })
  assert.equal(await resolveShell(ctx, 'bash', undefined, windows({})), file)
  await assert.rejects(resolveShell(ctx, 'E:/missing/bash.exe', undefined, windows({})), ShellUnavailableError)
  await assert.rejects(resolveShell(fixture(['C:/Program Files/Git/bin/bash.exe'], { active: true, ok: false, configured: 'bad' }), 'bash', undefined, windows({})), /configured shell/)
})
test('WSL and WindowsApps launchers are skipped, including when first on PATH', async () => {
  const file = 'E:/msys64/usr/bin/bash.exe'
  const ctx = fixture(['C:/Windows/System32/bash.exe', file])
  assert.equal(win32.normalize(await resolveShell(ctx, 'bash', undefined, windows({ PATH: 'C:\\Windows\\System32;C:\\Users\\U\\AppData\\Local\\Microsoft\\WindowsApps;E:\\msys64\\usr\\bin' }))), win32.normalize(file))
  assert(!ctx.tried.some(path => /System32|WindowsApps/i.test(path)))
  await assert.rejects(resolveShell(ctx, 'C:/Windows/System32/bash.exe', undefined, windows({})), /launcher/)
})
test('missing shell, cancellation and provider failure remain distinguishable', async () => {
  await assert.rejects(resolveShell(fixture(), 'bash', undefined, windows({})), /Python remains available/)
  const controller = new AbortController(); controller.abort(Error('cancelled discovery'))
  await assert.rejects(resolveShell(fixture(), 'bash', controller.signal, windows({})), /cancelled discovery/)
  await assert.rejects(resolveShell({ subprocess: { resolveExecutable() { throw Error('service failed') } } }, 'bash', undefined, { platform: 'linux', env: {} }), /service failed/)
})
test('POSIX hosts find Bash and autonomous gates use the same explicit shell', async () => {
  const ctx = fixture(['/bin/bash'])
  assert.equal(await resolveShell(ctx, 'bash', undefined, { platform: 'linux', env: {} }), '/bin/bash')
  let argv
  Object.assign(ctx, { workingDirectory: { ensure: async () => '/fixture' }, sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) } })
  ctx.subprocess.spawn = spec => { argv = spec.argv; return { done: Promise.resolve({ exitCode: 0 }), collected: {} } }
  const result = await runGates(ctx, { session: {} }, ['printf gate'], { bashCommand: '/bin/bash', gateTimeoutMs: 500, interruptGraceMs: 100 }, new AbortController().signal)
  assert.equal(result.pass, true); assert.deepEqual(argv, ['/bin/bash', '-c', 'printf gate'])
  await assert.rejects(runGates(ctx, { session: {} }, ['printf gate'], { bashCommand: '/missing' }, new AbortController().signal), ShellUnavailableError)
})
test('native Python runs Bash in a spaced Unicode cwd; missing shell fails before spawning', async () => {
  const ctx = { subprocess: { async resolveExecutable(path) {
    if (!isAbsolute(path)) throw missing()
    try { if (!(await stat(path)).isFile()) throw missing(); await access(path, constants.X_OK); return path }
    catch { throw missing() }
  } } }
  const shell = await resolveShell(ctx, 'bash', new AbortController().signal)
  const root = fileURLToPath(new URL('../', import.meta.url)), dir = await mkdtemp(join(tmpdir(), 'unharnessed shell 空格 '))
  const script = `import sys, os, runpy, asyncio\nsys.path[:0] = [${JSON.stringify(join(root, 'vendor'))}, ${JSON.stringify(join(root, 'python'))}]\nns = runpy.run_path(${JSON.stringify(join(root, 'python/bootstrap.py'))})\nasync def check():\n    result = await ns['bash']('printf shell-ok')\n    assert result.exit_code == 0 and result.output == 'shell-ok', result\nasyncio.run(check())\nos.environ['UNHARNESSED_BASH_SHELL'] = ''\nos.environ['DSH_UNHARNESSED_SHELL_ERROR'] = 'fixture no shell'\ntry:\n    ns['bash']('printf must-not-run')\nexcept RuntimeError as error:\n    assert str(error) == 'fixture no shell'\nelse:\n    raise AssertionError('missing shell accepted')\nprint('native-shell-ok')`
  try {
    const python = process.env.TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
    const output = execFileSync(python, ['-B', '-c', script], { cwd: dir, env: { ...process.env, UNHARNESSED_BASH_SHELL: shell }, encoding: 'utf8', timeout: 20000 })
    assert.match(output, /native-shell-ok/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
