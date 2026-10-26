import { hash } from './evidence.mjs';
import { dataView, repeatedLines, protectedTool, textOf } from './reducers.mjs';

// Observe native dispatch ownership, never parse or rewrite user programs.
// A program's canonical value and nested results are never shortened here.
export class ProgramOutputs {
  constructor() { this.runs = new Map(); }
  observe(exec, result) {
    if (!exec.parent || !exec.agent) return;
    const key = exec.agent.session.id + ':' + exec.rootCallId;
    let run = this.runs.get(key);
    if (!run) { run = { blocked: false, calls: [] }; this.runs.set(key, run); }
    run.blocked ||= result.isError || exec.signal?.aborted || protectedTool(exec.name)
      || result.value?.aborted || result.value?.timedOut || result.value?.sandbox?.denied
      || (typeof result.value?.exitCode === 'number' && result.value.exitCode !== 0);
    if (run.blocked) return;
    // Store identities, not copies of potentially huge intermediate values.
    if (run.calls.length < 2048) run.calls.push([exec.name, hash(exec.arguments ?? {})]);
    else run.blocked = true;
  }
  take(exec) {
    const key = exec.agent.session.id + ':' + exec.callId;
    const run = this.runs.get(key); this.runs.delete(key);
    return run;
  }
  release(id) { for (const key of this.runs.keys()) if (id === undefined || key.startsWith(id + ':')) this.runs.delete(key); }
}
export function programView(exec, result, run) {
  if (run?.blocked || result.isError || result.value?.sandbox?.denied) return null;
  const text = textOf(result.content);
  if (text === null || /\b(?:error|warning|warn|failed|failure|denied|cancelled|canceled|truncated)\b|截断|错误|警告|失败/i.test(text)) return null;
  const views = [dataView(text), repeatedLines(text)].filter(Boolean);
  return { view: views.sort((a, b) => a.text.length - b.text.length)[0],
    // Exact complete output deltas are bound to the actual dispatch identities.
    // Re-running still executes; nothing is assumed from this key alone.
    readKey: JSON.stringify(['program-output', hash(exec.arguments?.code), run?.calls ?? []]) };
}
