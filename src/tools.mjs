import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { textOf } from './store.mjs';
import { NOTE_GUIDE } from './prompts.mjs';

const str = (description) => ({ type: 'string', description });
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const tool = (name, description, parameters) => ({ name, description, parameters, constrainedSampling: false });
export const TOOLS = [
  tool('read', 'Read a UTF-8 text file and return line-numbered content. Use the read tool — not shell commands like cat — to inspect text files. Results include line numbers. Use offset and limit to continue reading large files.', obj({ file_path: str('Path to read, resolved by the filesystem backend.'), offset: { type: 'integer', description: '1-based first line to return. Defaults to 1.' }, limit: { type: 'integer', description: 'Maximum number of lines to return. Omit to read to the end.' } }, ['file_path'])),
  tool('write', 'Create or fully replace a UTF-8 text file. Use the write tool to create files or completely replace file contents. Existing files are overwritten, so read an existing file first and prefer edit for targeted changes.', obj({ file_path: str('Path to write, resolved by the filesystem backend.'), content: str('Full UTF-8 text content to write.') })),
  tool('edit', 'Edit an existing UTF-8 text file by replacing literal text. Use the edit tool for targeted changes to existing UTF-8 text files. It replaces literal old_string with new_string; by default old_string must appear exactly once. If old_string appears multiple times, provide a more specific old_string or set replace_all to true. Read the file first, unless you just created or edited it in this session.', obj({ file_path: str('Path to edit, resolved by the filesystem backend.'), old_string: str('Literal text to replace. Must match exactly.'), new_string: str('Literal replacement text. Use an empty string to delete the match.'), replace_all: { type: 'boolean', description: 'Replace all matches. Defaults to false; when false, old_string must appear exactly once.' } }, ['file_path', 'old_string', 'new_string'])),
  tool('bash', 'Execute a bash command (`bash -c`) and return its stdout/stderr. Each call runs in a fresh shell: no state (cwd, variables, functions) persists between calls — pass `workdir` instead of using `cd`. Non-zero exits are reported as `[exit code: N]`.', obj({ command: str('The bash command to execute.'), workdir: str('Working directory for this command. Defaults to the session workspace; a relative path is resolved against it.') }, ['command'])),
  tool('web_fetch', 'Fetch the content of a specific HTTP(S) URL and return it decoded to text. Cite the URL as a markdown link when you use its content.', obj({ url: str('The HTTP(S) URL to fetch.') })),
  tool('tasks', "A clear, complete todo list greatly raises the completion rate in medium-to-large tasks. Use it when the task takes three or more distinct steps, when the user lists several things at once, or when new instructions arrive mid-task — capture them right away. Skip it for single-step work and plain conversation — a list there is overhead, not help. Supply the complete current list in items. Decide how a task will be verified before building it, and check it off the moment it is fully done — one at a time, as you go, not all of them at the end. Never check off a task while its tests are failing, the implementation is partial, or an error on it is unresolved; when several are checked together, that must hold for every one of them. Uncheck a task that turns out not to be done. Remove a task only when it no longer belongs on the list — irrelevant, impossible, or overtaken by newer instructions — never because it is hard; say why in your reply.", obj({ items: { type: 'array', items: obj({ text: str('One line stating what the task requires'), done: { type: 'boolean' } }) } })),
  tool('note', NOTE_GUIDE, obj({ text: str('Note content') })),
  tool('recall', 'Search your long-term memory, or retrieve the verbatim text behind a condensed work record. ' +
    '(1) Recall: pass query (natural language) to get related memories (scoped to what this project can see: global + cross-project + this project); optionally narrow with scope. ' +
    '(2) Retrieve originals: condensed records in the context are tagged with "seq a..b" — when you need the original content that was condensed away, pass {from:a,to:b} to get the raw event text of that span verbatim (no model rewriting).', obj({ query: str('What to recall (natural language); when retrieving originals, state the purpose'), scope: { type: 'string', enum: ['all', 'global', 'cross', 'project'], description: 'Memory layer: all (default, everything visible to this project) / global / cross (cross-project) / project (this project)' }, from: { type: 'integer', description: 'First event sequence to retrieve' }, to: { type: 'integer', description: 'Last event sequence to retrieve' } }, ['query'])),
];

export function runCommand(command, cwd, signal, onOutput = () => {}) {
  return new Promise((done, reject) => {
    signal?.throwIfAborted();
    const child = spawn('bash', ['-c', command], { cwd, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let output = '', killTimer;
    const append = (data) => { const text = data.toString(); output += text; onOutput(text); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const kill = (sig) => {
      try { process.platform === 'win32' ? child.kill(sig) : process.kill(-child.pid, sig); } catch (error) { if (error.code !== 'ESRCH') reject(error); }
    };
    const abort = () => { kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 1000); killTimer.unref(); };
    signal?.addEventListener('abort', abort, { once: true });
    const clean = () => { clearTimeout(killTimer); signal?.removeEventListener('abort', abort); };
    child.on('error', error => { clean(); reject(error); });
    child.on('close', (code, sig) => {
      clean();
      done({ text: `${output || '(no output)'}${code === 0 ? '' : `\n[exit code: ${code ?? sig}]`}`, isError: code !== 0, aborted: signal?.aborted === true });
    });
  });
}

export async function executeTool(call, { store, session, signal, onOutput }) {
  const a = call.arguments;
  const cwd = session.events[0].cwd;
  const file = () => resolve(cwd, a.file_path);
  switch (call.name) {
    case 'read': {
      const text = await readFile(file(), 'utf8');
      const lines = text.split('\n');
      const start = a.offset ?? 1, end = a.limit === undefined ? lines.length : start - 1 + a.limit;
      return { text: lines.slice(start - 1, end).map((line, i) => `${start + i}: ${line}`).join('\n') };
    }
    case 'write':
      await mkdir(dirname(file()), { recursive: true });
      await writeFile(file(), a.content, 'utf8');
      return { text: `Written ${a.file_path} (${a.content.length} characters)` };
    case 'edit': {
      const before = await readFile(file(), 'utf8');
      if (!a.old_string || !before.includes(a.old_string) || (!a.replace_all && before.split(a.old_string).length !== 2)) throw new Error('old_string must match exactly once unless replace_all is true; read the file and provide a unique fragment.');
      const after = a.replace_all ? before.split(a.old_string).join(a.new_string) : before.replace(a.old_string, () => a.new_string);
      await writeFile(file(), after, 'utf8');
      return { text: `Updated ${a.file_path}` };
    }
    case 'bash': return runCommand(a.command, a.workdir ? resolve(cwd, a.workdir) : cwd, signal, onOutput);
    case 'web_fetch': {
      const response = await fetch(a.url, { signal });
      const text = await response.text();
      return { text: `${response.status} ${response.url}\n${text}`, isError: !response.ok };
    }
    case 'tasks':
      store.append(session, 'tasks', { items: a.items });
      return { text: a.items.map(x => `${x.done ? '[x]' : '[ ]'} ${x.text}`).join('\n') || 'Task list cleared.' };
    case 'note':
      store.append(session, 'note', { text: a.text });
      return { text: a.text };
    case 'recall': {
      if (Number.isInteger(a.from) && Number.isInteger(a.to)) {
        return { text: session.events.filter(e => e.seq >= a.from && e.seq <= a.to && (e.type === 'message' || e.type === 'note')).map(e => `[${e.seq} ${e.message?.role ?? e.type}] ${e.message ? textOf(e.message) : e.text}`).join('\n') || 'No messages in this range.' };
      }
      const words = (a.query.toLowerCase().match(/[a-z0-9_-]+|[\p{Script=Han}]/gu) ?? []);
      const memories = store.memories(session.events[0].project).filter(m => !a.scope || a.scope === 'all' || m.scope === a.scope).map(m => ({ ...m, score: words.reduce((n, w) => n + Number(`${m.key} ${m.text}`.toLowerCase().includes(w)), 0) })).filter(m => m.score).sort((a, b) => b.score - a.score);
      return { text: memories.map(m => `[${m.scope} · ${m.key}] ${m.text}`).join('\n') || 'No related memories.' };
    }
    default: throw new Error(`Unknown tool: ${call.name}`);
  }
}
