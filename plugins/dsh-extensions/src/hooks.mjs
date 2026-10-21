import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { errorText, fail, kind, tilde, trimTo, writeAtomic } from './common.mjs';

export const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd'];
export const MATCHER_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse'];
const OUTPUT_LIMIT = 64 * 1024, MAX_STOP_CONTINUATIONS = 3, RUN_HISTORY = 50;

/** Exact names, `a|b` alternatives and regular expressions all match the whole value. */
export function matches(matcher, value) {
  if (!matcher || matcher === '*') return true;
  try { return new RegExp(`^(?:${matcher})$`).test(value ?? ''); } catch { return matcher === value; }
}

/** Read one finished run with the exit-code and JSON conventions common to coding-agent hooks. */
export function interpret(event, run) {
  const result = { block: false, halt: false, reason: '', context: '', permission: null };
  if (run.error || run.timedOut) return result;
  if (run.code === 2) return { ...result, block: true, reason: run.stderr.trim() };
  if (run.code !== 0) return result;
  const out = run.stdout.trim();
  let json = null;
  if (out.startsWith('{')) try { json = JSON.parse(out); } catch {}
  if (!json) return ['UserPromptSubmit', 'SessionStart'].includes(event) ? { ...result, context: out } : result;
  const specific = json.hookSpecificOutput && typeof json.hookSpecificOutput === 'object' ? json.hookSpecificOutput : {};
  if (json.decision === 'block') Object.assign(result, { block: true, reason: String(json.reason ?? '') });
  if (json.continue === false) Object.assign(result, { halt: true, reason: result.reason || String(json.stopReason ?? '') });
  if (['allow', 'deny', 'ask'].includes(specific.permissionDecision)) {
    result.permission = specific.permissionDecision;
    result.reason ||= String(specific.permissionDecisionReason ?? '');
  } else if (event === 'PreToolUse' && json.decision === 'approve') result.permission = 'allow';
  if (typeof specific.additionalContext === 'string') result.context = specific.additionalContext;
  return result;
}

const hookSource = event => ({ kind: 'extension-hook', form: 'notice', summary: `${event} hook` });
const contextMessage = (event, text) => createUserMessage({ source: hookSource(event),
  content: [{ type: 'text', text: `<system-reminder>\n${event} hook additional context:\n${text}\n</system-reminder>` }] });
const textOf = message => (message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
const subagent = agent => agent?.session?.header?.origin === 'subagent';
const valid = timeout => Number.isFinite(timeout) && timeout > 0 && timeout <= 600;

function execute(command, input, { cwd, timeout = 60, signal }) {
  return new Promise(resolve => {
    const started = Date.now(), windows = process.platform === 'win32';
    let stdout = '', stderr = '', timedOut = false, settled = false, child;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve({ stdout, stderr, timedOut, durationMs: Date.now() - started, ...value }); };
    const kill = () => { try { if (!windows && child?.pid) process.kill(-child.pid, 'SIGKILL'); else child?.kill('SIGKILL'); } catch {} };
    const abort = () => { kill(); finish({ code: null, error: 'aborted' }); };
    const timer = setTimeout(() => { timedOut = true; kill(); finish({ code: null }); }, timeout * 1000);
    try {
      child = spawn(command, { shell: true, cwd, windowsHide: true, detached: !windows, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, DSH_PROJECT_DIR: cwd, CLAUDE_PROJECT_DIR: cwd } });
    } catch (error) { finish({ code: null, error: errorText(error) }); return; }
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => { if (stdout.length < OUTPUT_LIMIT) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < OUTPUT_LIMIT) stderr += chunk; });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
    child.on('error', error => finish({ code: null, error: errorText(error) }));
    child.on('close', code => finish({ code }));
  });
}

/** Command hooks from `$DSH_HOME/hooks.json`, attached to DSH's native agent and tool events. */
export class Hooks {
  constructor(ctx, homes) {
    this.ctx = ctx; this.file = join(homes.dsh, 'hooks.json');
    this.cache = { mtime: undefined, document: { hooks: {} }, error: null };
    this.runs = []; this.stops = new WeakMap();
  }
  async load() {
    const mtime = await stat(this.file).then(info => info.mtimeMs, () => null);
    if (mtime === this.cache.mtime) return this.cache;
    let document = { hooks: {} }, error = null;
    if (mtime !== null) {
      try {
        document = JSON.parse(await readFile(this.file, 'utf8'));
        if (!document || typeof document !== 'object' || Array.isArray(document)) throw Error('hooks.json must contain an object');
        document.hooks ??= {};
        if (typeof document.hooks !== 'object' || Array.isArray(document.hooks)) throw Error('"hooks" must be an object');
      } catch (failure) { document = { hooks: {} }; error = errorText(failure); }
    }
    this.cache = { mtime, document, error };
    return this.cache;
  }
  async matching(event, value) {
    const { document } = await this.load();
    if (document.disableAllHooks === true) return [];
    const seen = new Set(), hooks = [];
    for (const group of Array.isArray(document.hooks[event]) ? document.hooks[event] : []) {
      if (MATCHER_EVENTS.includes(event) && !matches(group?.matcher, value)) continue;
      for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
        if (hook?.type !== 'command' || typeof hook.command !== 'string' || !hook.command.trim() || hook.enabled === false || seen.has(hook.command)) continue;
        seen.add(hook.command); hooks.push({ command: hook.command, timeout: valid(hook.timeout) ? hook.timeout : 60 });
      }
    }
    return hooks;
  }
  cwdOf(agent) { return (agent && (this.ctx.get('workingDirectory')?.get?.(agent.session) ?? agent.session?.header?.cwd)) || homedir(); }
  async run(event, hooks, fields, { agent, signal } = {}) {
    const cwd = this.cwdOf(agent);
    const workdir = await kind(cwd) === 'directory' ? cwd : homedir();
    const input = { session_id: agent?.session?.id ?? null, cwd, hook_event_name: event, agent_type: subagent(agent) ? 'subagent' : 'main', ...fields };
    return Promise.all(hooks.map(async hook => {
      const run = await execute(hook.command, input, { cwd: workdir, timeout: hook.timeout, signal });
      const result = interpret(event, run);
      const outcome = run.error ? 'error' : run.timedOut ? 'timeout' : result.block || result.halt || result.permission === 'deny' ? 'blocked' : run.code === 0 ? 'ok' : 'error';
      this.runs.unshift({ at: Date.now(), event, command: trimTo(hook.command, 200), code: run.code, durationMs: run.durationMs, outcome,
        detail: trimTo((run.error ?? result.reason ?? '') || run.stderr.trim(), 600), session: input.session_id });
      this.runs.length = Math.min(this.runs.length, RUN_HISTORY);
      return result;
    }));
  }
  start() {
    const guard = (event, task) => async (...args) => {
      try { return await task(...args); }
      catch (error) { this.ctx.logger?.warn?.(`dsh-extensions: ${event} hooks: ${errorText(error)}`); }
    };
    this.ctx.on('tools/pre-execute', async (exec, next) => {
      let hooks = [];
      try { hooks = await this.matching('PreToolUse', exec.name); } catch {}
      if (!hooks.length) return next();
      const results = await this.run('PreToolUse', hooks, { tool_name: exec.name, tool_input: exec.arguments ?? null, tool_use_id: exec.callId }, { agent: exec.agent, signal: exec.signal });
      const deny = results.find(result => result.block || result.halt || result.permission === 'deny');
      if (deny) return { kind: 'deny', reason: deny.reason || 'Blocked by a PreToolUse hook.' };
      const ask = results.find(result => result.permission === 'ask');
      if (ask) return { kind: 'ask', ...ask.reason ? { reason: ask.reason } : {} };
      // An allow answer never bypasses the host's own approval policy.
      return next();
    });
    this.ctx.on('tools/post-execute', async (exec, result, next) => {
      const decision = await next();
      if (decision.kind === 'block') return decision;
      let hooks = [];
      try { hooks = await this.matching('PostToolUse', exec.name); } catch {}
      if (!hooks.length) return decision;
      const response = result.isError ? { error: result.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? '' } : result.value ?? null;
      const results = await this.run('PostToolUse', hooks, { tool_name: exec.name, tool_input: exec.arguments ?? null, tool_use_id: exec.callId, tool_response: response }, { agent: exec.agent, signal: exec.signal });
      const notes = results.flatMap(item => [item.block && item.reason ? item.reason : '', item.context]).filter(Boolean);
      return notes.length ? { ...decision, additionalContexts: [...decision.additionalContexts ?? [], contextMessage('PostToolUse', notes.join('\n\n'))] } : decision;
    });
    this.ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next();
      if (decision.kind !== 'enter' || subagent(payload.agent)) return decision;
      const prompts = decision.messages.filter(message => message.source?.kind === 'user');
      if (!prompts.length) return decision;
      let hooks = [];
      try { hooks = await this.matching('UserPromptSubmit'); } catch {}
      if (!hooks.length) return decision;
      const results = await this.run('UserPromptSubmit', hooks, { prompt: prompts.map(textOf).join('\n\n') }, { agent: payload.agent, signal: payload.signal });
      if (results.some(result => result.block || result.halt)) return { kind: 'reject' };
      const context = results.map(result => result.context).filter(Boolean).join('\n\n');
      return context ? { ...decision, messages: [...decision.messages, contextMessage('UserPromptSubmit', context)] } : decision;
    });
    this.ctx.on('agent/created', guard('SessionStart', async ({ agent, source }) => {
      if (subagent(agent)) return;
      const hooks = await this.matching('SessionStart', source);
      if (!hooks.length) return;
      const results = await this.run('SessionStart', hooks, { source }, { agent });
      const context = results.map(result => result.context).filter(Boolean).join('\n\n');
      if (context) agent.inject(contextMessage('SessionStart', context));
    }));
    this.ctx.on('agent/turn-stopping', guard('Stop', async ({ agent, turn, signal }) => {
      if (subagent(agent)) return;
      const hooks = await this.matching('Stop');
      if (!hooks.length) return;
      const state = this.stops.get(agent), active = state?.turn === turn;
      if (active && state.count >= MAX_STOP_CONTINUATIONS) return;
      const results = await this.run('Stop', hooks, { stop_hook_active: active }, { agent, signal });
      const objection = results.find(result => result.block && !result.halt);
      if (!objection) { this.stops.delete(agent); return; }
      this.stops.set(agent, { turn, count: (active ? state.count : 0) + 1 });
      agent.steer(createUserMessage({ source: hookSource('Stop'), content: [{ type: 'text', text: objection.reason || 'A Stop hook asked you to continue before finishing.' }] }));
    }));
    this.ctx.on('agent/disposed', ({ agent }) => {
      if (subagent(agent)) return;
      void guard('SessionEnd', async () => {
        const hooks = await this.matching('SessionEnd');
        if (hooks.length) await this.run('SessionEnd', hooks, {}, { agent });
      })();
    });
  }
  // --- Management -----------------------------------------------------------
  async list() {
    const { document, error } = await this.load();
    const items = [];
    for (const event of Object.keys(document.hooks)) {
      (Array.isArray(document.hooks[event]) ? document.hooks[event] : []).forEach((group, groupIndex) => {
        (Array.isArray(group?.hooks) ? group.hooks : []).forEach((hook, hookIndex) => {
          if (hook?.type !== 'command') return;
          items.push({ id: `${event}/${groupIndex}/${hookIndex}`, event, supported: EVENTS.includes(event), matcher: group.matcher ?? '',
            command: String(hook.command ?? ''), timeout: valid(hook.timeout) ? hook.timeout : null, enabled: hook.enabled !== false });
        });
      });
    }
    return { file: tilde(this.file), error, enabled: document.disableAllHooks !== true, events: EVENTS, matcherEvents: MATCHER_EVENTS, hooks: items, runs: this.runs };
  }
  async edit(change) {
    const { error } = await this.load();
    if (error) fail('hooks-file-invalid', 'hooks.json cannot be parsed; fix or remove it first', { file: this.file });
    const document = structuredClone(this.cache.document);
    change(document);
    for (const event of Object.keys(document.hooks)) {
      const groups = (document.hooks[event] ?? []).filter(group => !Array.isArray(group?.hooks) || group.hooks.length);
      if (groups.length) document.hooks[event] = groups; else delete document.hooks[event];
    }
    await writeAtomic(this.file, JSON.stringify(document, null, 2) + '\n');
    this.cache.mtime = undefined;
  }
  static locate(document, id, expected) {
    const [event, group, hook] = String(id).split('/');
    const entry = document.hooks[event]?.[Number(group)]?.hooks?.[Number(hook)];
    if (!entry || (expected !== undefined && entry.command !== expected)) fail('hook-changed', 'hooks.json changed meanwhile; refresh and try again', {}, 409);
    return { event, group: Number(group), hook: Number(hook), entry };
  }
  static validate({ event, matcher, command, timeout }) {
    if (!EVENTS.includes(event)) fail('invalid-hook-event', 'Choose a supported event');
    if (typeof command !== 'string' || !command.trim()) fail('hook-command-required', 'A command is required');
    if (timeout !== undefined && timeout !== null && !valid(timeout)) fail('invalid-hook-timeout', 'Timeout must be between 1 and 600 seconds');
    if (matcher && MATCHER_EVENTS.includes(event)) try { new RegExp(matcher); } catch { fail('invalid-hook-matcher', 'The matcher is not a valid regular expression'); }
  }
  save({ id, expected, event, matcher = '', command, timeout, enabled = true }) {
    Hooks.validate({ event, matcher, command, timeout });
    const key = MATCHER_EVENTS.includes(event) ? matcher.trim() : '';
    return this.edit(document => {
      let hook = { type: 'command', command: command.trim() };
      if (id !== undefined) {
        const found = Hooks.locate(document, id, expected);
        hook = { ...found.entry, ...hook };
        document.hooks[found.event][found.group].hooks.splice(found.hook, 1);
      }
      if (timeout) hook.timeout = timeout; else delete hook.timeout;
      if (enabled === false) hook.enabled = false; else delete hook.enabled;
      const groups = document.hooks[event] ??= [];
      const group = groups.find(item => (item.matcher ?? '') === key && Array.isArray(item.hooks));
      if (group) group.hooks.push(hook); else groups.push({ ...key ? { matcher: key } : {}, hooks: [hook] });
    });
  }
  remove(id, expected) { return this.edit(document => { const found = Hooks.locate(document, id, expected); document.hooks[found.event][found.group].hooks.splice(found.hook, 1); }); }
  setEnabled(id, expected, enabled) {
    return this.edit(document => { const { entry } = Hooks.locate(document, id, expected); if (enabled) delete entry.enabled; else entry.enabled = false; });
  }
  setAll(enabled) { return this.edit(document => { if (enabled) delete document.disableAllHooks; else document.disableAllHooks = true; }); }
  /** Try a command with a representative input; nothing reaches a session. */
  async test({ event, command, timeout }) {
    Hooks.validate({ event, command, timeout });
    const samples = { SessionStart: { source: 'startup' }, UserPromptSubmit: { prompt: 'Example prompt' }, PreToolUse: { tool_name: 'bash', tool_input: { command: 'ls' }, tool_use_id: 'test' },
      PostToolUse: { tool_name: 'bash', tool_input: { command: 'ls' }, tool_use_id: 'test', tool_response: { stdout: '' } }, Stop: { stop_hook_active: false }, SessionEnd: {} };
    const input = { session_id: 'test', cwd: homedir(), hook_event_name: event, agent_type: 'main', ...samples[event] };
    const run = await execute(command.trim(), input, { cwd: homedir(), timeout: timeout || 60 });
    return { ...run, stdout: trimTo(run.stdout, 4000), stderr: trimTo(run.stderr, 4000), result: interpret(event, run) };
  }
}
