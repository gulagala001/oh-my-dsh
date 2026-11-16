import { win32 } from 'node:path'

export class ShellUnavailableError extends Error {}

/** Resolve on the host, never from a cell's cwd or environment. Shared by Python and gates. */
export async function resolveShell(ctx, command, signal, { platform = process.platform, env = process.env } = {}) {
  signal?.throwIfAborted()
  const windows = platform === 'win32'
  const value = name => Object.entries(env).find(([key]) => windows ? key.toLowerCase() === name.toLowerCase() : key === name)?.[1]
  const unavailable = detail => new ShellUnavailableError(`${detail} Python remains available. For bash() and autonomous shell gates, ${windows ? 'install Git for Windows or ' : ''}set bashCommand to an existing absolute POSIX shell path${windows ? ' (for example C:/Program Files/Git/bin/bash.exe)' : ''}, then reset the Python kernel or start a new chat.`)
  const isLauncher = path => windows && /(?:^|[\\/])(?:WindowsApps|System32|SysWOW64|Sysnative)(?:[\\/]|$)/i.test(path)
  const lookup = async candidate => {
    signal?.throwIfAborted()
    if (isLauncher(candidate)) return undefined
    try {
      const path = await ctx.subprocess.resolveExecutable(candidate, undefined, signal)
      signal?.throwIfAborted()
      return isLauncher(path) ? undefined : path
    } catch (error) {
      signal?.throwIfAborted()
      if (error.name !== 'SubprocessExecutableNotFoundError') throw error
      return undefined
    }
  }
  // Preserve explicit selections: a typo must not silently select another shell.
  if (command !== 'bash' && command !== 'auto') {
    const path = await lookup(command)
    if (path) return path
    throw unavailable(`Configured bashCommand ${JSON.stringify(command)} is unavailable or is a Windows launcher.`)
  }
  if (!windows) {
    for (const candidate of ['bash', '/bin/bash', '/usr/bin/bash']) {
      const path = await lookup(candidate)
      if (path) return path
    }
    throw unavailable('Bash was not found on this host.')
  }
  // Optional public capability; do not require the peer plugin or replace its executor.
  const peer = ctx.get?.('gitBash')
  if (peer?.active) {
    const configured = peer.configured
    if (peer.ok !== false) {
      const candidate = peer.bashPath
      if (typeof candidate === 'string' && win32.isAbsolute(candidate)) {
        const path = await lookup(candidate)
        if (path) return path
      }
    }
    if (configured) throw unavailable('The Git Bash plugin could not resolve its configured shell.')
  }
  const candidates = new Set()
  const add = path => { if (typeof path === 'string' && win32.isAbsolute(path)) candidates.add(win32.normalize(path)) }
  for (const base of [value('ProgramW6432'), value('ProgramFiles'), value('ProgramFiles(x86)'), 'C:\\Program Files', 'C:\\Program Files (x86)']) {
    if (base && win32.isAbsolute(base)) add(win32.join(base, 'Git', 'bin', 'bash.exe'))
  }
  if (value('LOCALAPPDATA')) add(win32.join(value('LOCALAPPDATA'), 'Programs', 'Git', 'bin', 'bash.exe'))
  if (value('USERPROFILE')) add(win32.join(value('USERPROFILE'), 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe'))
  // Git's default PATH entry is Git/cmd, which contains git.exe but not bash.exe.
  // Enumerate every entry so a WSL launcher cannot hide a later native Bash.
  for (const raw of (value('PATH') || '').split(';')) {
    const directory = raw.trim().replace(/^"(.*)"$/, '$1')
    if (!win32.isAbsolute(directory)) continue
    add(win32.join(directory, 'bash.exe'))
    if (/^(?:cmd|bin)$/i.test(win32.basename(directory))) add(win32.join(directory, '..', 'bin', 'bash.exe'))
  }
  for (const candidate of candidates) {
    const path = await lookup(candidate)
    if (path) return path
  }
  throw unavailable('No native POSIX shell was found; WSL launchers are not supported by this Python runtime.')
}
