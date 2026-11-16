import { bounded } from './kernel.js'
import { resolveShell } from './shell.js'

export const GATE_MARKER = '\n\n[unharnessed autonomous gates v1]\n'
export const refOf = goal => ({ id: goal.id, revision: goal.revision })

export function parseAutonomous(input) {
  const value = JSON.parse(input)
  if (!value || typeof value !== 'object' || typeof value.objective !== 'string' || !value.objective.trim()) {
    throw new Error('objective must be a non-empty string')
  }
  if (value.objective.includes(GATE_MARKER)) throw new Error('objective contains a reserved gate marker')
  if (!Array.isArray(value.gates) || value.gates.length < 1 || value.gates.length > 16
    || value.gates.some(x => typeof x !== 'string' || !x.trim() || x.length > 4096)) {
    throw new Error('gates must contain 1–16 non-empty shell commands, each at most 4096 characters')
  }
  const maxRounds = value.maxRounds ?? 12
  if (!Number.isSafeInteger(maxRounds) || maxRounds < 1 || maxRounds > 1000) throw new Error('maxRounds must be an integer from 1 to 1000')
  return { objective: value.objective.trim(), gates: value.gates, maxRounds }
}

export function gatesOf(goal) {
  if (!goal?.objective.includes(GATE_MARKER)) return undefined
  const index = goal.objective.lastIndexOf(GATE_MARKER)
  // Fail closed if a persisted gate specification is malformed.
  const spec = parseAutonomous(JSON.stringify({ objective: goal.objective.slice(0, index), gates: JSON.parse(goal.objective.slice(index + GATE_MARKER.length)) }))
  return spec.gates
}

/** Gate subprocesses are owned by DSH and use its current confinement policy. */
export async function runGates(ctx, agent, gates, config, signal) {
  const cwd = await ctx.workingDirectory.ensure(agent, signal)
  const shell = await resolveShell(ctx, config.bashCommand, signal)
  const results = []
  for (const command of gates) {
    signal.throwIfAborted()
    const policy = ctx.sandboxPolicy.resolve({ session: agent.session })
    let argv = [shell, '-c', command]
    if (policy.mode !== 'danger-full-access') argv = (await ctx.sandbox.confine(argv, policy, signal)).argv
    const deadline = new AbortController()
    const control = AbortSignal.any([signal, deadline.signal])
    const timer = setTimeout(() => deadline.abort(new Error('Gate timed out')), config.gateTimeoutMs)
    let handle
    try {
      handle = ctx.subprocess.spawn({ argv, cwd, signal: control, graceMs: config.interruptGraceMs,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 12000 }, stderr: { maxBytes: 12000 } } })
      const done = await handle.done
      signal.throwIfAborted()
      const text = (handle.collected.stdout?.readFrom(0).text ?? '') + (handle.collected.stderr?.readFrom(0).text ?? '')
      const pass = !deadline.signal.aborted && done.exitCode === 0
      results.push({ command, pass, exitCode: done.exitCode, timedOut: deadline.signal.aborted, output: bounded(text, 6000) })
    } finally {
      clearTimeout(timer)
      if (handle && control.aborted) { handle.terminate(); await handle.done.catch(() => {}) }
    }
  }
  return { pass: results.every(x => x.pass), results }
}
