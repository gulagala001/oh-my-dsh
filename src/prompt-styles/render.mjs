import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { piSections, zcodePrefix, zcodeIdentity, zcodeBehavior, zcodeContext, zcodeSession } from './builders.mjs';
import { renderTemplate } from './template.mjs';

// The OMD composition disables this native section globally. Restore its
// exact host text only for DSH style; check-prompt-styles verifies the owner.
export const DSH_IDENTITY = 'You are an AI agent powered by DeepSeek Harness.';

const originals = Object.fromEntries(['codex', 'cursor', 'grok'].map(id => [id,
  readFileSync(new URL(`./upstream/${id}/${id === 'codex' ? 'instructions_template' : 'prompt'}.md`, import.meta.url), 'utf8')]));

// Every substitution is anchored in the pinned source and reported to callers.
// Updating a source must therefore review its adaptations, not silently drop them.
function editor(text, changes) {
  return {
    replace(before, after, reason) {
      if (!text.includes(before)) throw Error('Prompt source changed: ' + before.slice(0, 80));
      if (before !== after) { text = text.replaceAll(before, after); changes.push({ reason, before, after }); }
      return this;
    },
    block(start, end, body, reason) {
      const from = text.indexOf(start), to = text.indexOf(end, from + start.length);
      if (from < 0 || to < 0) throw Error('Prompt block changed: ' + start);
      return this.replace(text.slice(from + start.length, to), '\n\n' + body + '\n\n', reason);
    },
    text: () => text,
  };
}

export function renderPromptStyle(style, { schemas = [], toolMode = 'native' } = {}) {
  const changes = [], names = new Set(schemas.map(tool => tool.name)), has = name => names.has(name);
  const shell = has('bash') ? 'bash' : has('pwsh') ? 'pwsh' : '';
  const tool = (name, fallback) => has(name) ? '`' + name + '`' : fallback;
  const nativeTools = 'Use the available tool declarations' + (toolMode !== 'native' ? ' and the current tools:sdk' : '')
    + ' for exact tool names, parameters and return contracts. Only the tools actually supplied in this request are callable.';
  let e;
  if (style === 'codex') {
    e = editor(originals.codex, changes);
    e.replace('You are Codex, an agent based on GPT-6.', 'You are an agent using the Codex system prompt style in OMD, powered by the model selected for this session.', 'host identity')
      .replace('As Codex, you are', 'As a coding assistant, you are', 'host identity')
      .replace('You share updates in the `commentary` channel.', 'You share updates in assistant text between tool calls.', 'host message transport')
      .replace('You yield back to the user and end your turn by sending a final message to the `final` channel.', 'You yield back to the user and end your turn with a final assistant text message, with no further tool calls.', 'host message transport')
      .replace('in the commentary channel', 'in assistant progress text', 'host message transport')
      .replace('in the final channel', 'in the final assistant message', 'host message transport')
      .replace('`commentary` channel', 'assistant progress text', 'host message transport')
      .replace('the `functions.request_user_input_async` tool', tool('ask_user_question', 'an available user-question tool'), 'native question tool')
      .replace('You can ask multiple questions in a single tool call.', 'You can ask multiple questions in a single tool call when its schema supports this. Follow its actual waiting behavior; continue independent work while waiting only if the tool returns before the answer arrives.', 'native question waiting behavior')
      .replace('because the tool only supports text input', 'unless its actual schema supports attachments', 'native question contract')
      .replace('Batch independent searches and reads in one functions.exec using await Promise.allSettled([...]); inspect every result.',
        toolMode === 'native' ? 'Batch independent searches and reads using parallel tool calls when available; inspect every result.' : 'Batch independent searches and reads in run_code using the current SDK’s concurrency syntax; inspect every result.', 'native tool transport')
      .replace('When calling `functions.exec`, parallelize independent tool calls by awaiting Promises.',
        toolMode === 'native' ? 'Parallelize independent tool calls when the host supports it.' : 'When calling `run_code`, parallelize independent tool calls using the current SDK’s concurrency syntax.', 'native tool transport')
      .replace('exec_command calls', shell ? shell + ' calls' : 'shell tool calls', 'native shell tool')
      .replace('the `cmd` argument', 'the actual command argument', 'native shell parameters')
      .replace('orchestrator skills should be discovered by calling `skills.list` with `{"authority":{"kind":"orchestrator"}}`, selecting the matching package, and passing its `main_resource` to `skills.read`.',
        'provider-backed skills should be accessed using the discovery and reading tools actually supplied by that provider.', 'available skill providers')
      .replace('For orchestrator skills, pass the exact referenced resource identifier with the same authority and package to `skills.read`; do not treat `skill://` identifiers as filesystem paths.',
        'For provider-backed skills, pass the exact referenced resource identifier to the available provider reader; do not treat skill resource identifiers as filesystem paths.', 'available skill providers')
      .replace('An app is equivalent to a set of MCP tools within the `codex_apps` MCP.', 'An app is a set of connected tools supplied by the host.', 'host connector discovery')
      .replace('An installed app\'s MCP tools are either provided to you already, or can be lazy-loaded through the `tool_search` tool. If `tool_search` is available, the apps that are searchable by `tools_search` will be listed by it.',
        'An installed app’s tools are provided by the host. Use discovery tools only when they are actually supplied, and follow their registered schemas.', 'host connector discovery');
  } else if (style === 'cursor') {
    e = editor(originals.cursor, changes);
    const tag = (name, body, reason) => e.block('`<' + name + '>`', '`</' + name + '>`', body, reason);
    e.replace('{model_name}', 'the model selected for this session', 'host model identity')
      .replace('You operate in Cursor.', 'You use the Cursor system prompt style in OMD.', 'host identity')
      .replace('in the Cursor IDE', 'in the shared workspace', 'host surface')
      .replace('such as what files they have open, where their cursor is, recently viewed files, edit history in their session so far, linter errors, and more', 'such as the workspace, attached files, and context actually supplied by the host', 'available editor context')
      .replace('which are denoted by the `<user_query>` tag', 'in the current conversation', 'host message format')
      .replace('The system may attach additional context to user messages (e.g. `<system_reminder>`, `<attached_files>`, and `<system_notification>`). Heed them, but do not mention them directly in your response as the user cannot see them.',
        'The system may attach additional context to user messages. Use the host-supplied context when relevant, respecting its actual provenance; do not narrate internal context labels.', 'host context provenance')
      .replace('Never use tools like Shell or code comments', 'Never use shell tools or code comments', 'native tool names')
      .replace('You MUST use the Read tool at least once before editing.', 'You MUST read the file with ' + tool('read', 'an available file-reading tool') + ' at least once before editing.', 'native reader');
    tag('citing_code', 'When citing existing code, provide the actual file path and verified line number using the host’s supported Markdown links. Show code in standard fenced blocks with a language tag.\n\nInclude at least 1 line of actual code. You may truncate long sections with comments like `// ... more code ...`, add clarifying comments, and show edited versions of the code.\n\nFor proposed code, use standard Markdown code blocks with only the language tag. Never include line numbers in code content. Never indent triple backticks, even inside lists. Always add a newline before code fences.', 'host code-reference renderer');
    tag('terminal_files_information', [has('job_list') ? 'Before starting a dev server or a long-running process that should not be duplicated, use `job_list` to check existing jobs.' : 'Check actual running processes before starting a dev server or long-running command that should not be duplicated.',
      has('job_output') ? 'Use `job_output` with the returned job id to inspect status and output. Follow the actual waiting parameters; a wait timeout does not finish the job.' : 'Use the actual shell result to inspect process output and completion.'].join('\n\n'), 'native jobs instead of IDE terminal files');
    if (!has('todo_write')) tag('task_management', 'Keep track of complex tasks, and skip task bookkeeping for simple work requiring only 1–2 steps.\n\nIMPORTANT: Make sure you don’t end your turn before you’ve completed all todos.', 'task tool unavailable');
    tag('mcp_file_system', 'You have access to the connected tools actually supplied by the host.\n\nMANDATORY — Always check each tool’s current description and schema before calling it. Follow the exact required parameters and their types. Use resource listing, fetching or authentication only when those tools are actually registered. Do not infer a descriptor filesystem or authentication tool from a server name. Authenticate one server at a time when its actual tool requires this.', 'native MCP discovery and schemas');
    tag('mode_selection', 'Choose the best interaction mode for the user’s current goal before proceeding. Reassess when the goal changes or you’re stuck.\n\n- **Plan**: user asks for a plan, or the task is large/ambiguous or has meaningful trade-offs.\n\n' + (has('enter_plan_mode') ? 'Use `enter_plan_mode` to enter the host’s planning mode, and `exit_plan_mode` only if available and according to its current schema. ' : '') + 'Follow the current host mode and its permissions; a textual claim does not switch modes.', 'native planning modes');
    let shellGuidance = '';
    if (shell) {
      const originalShell = originals.cursor.slice(originals.cursor.indexOf('### Shell'), originals.cursor.indexOf('### Glob'));
      const command = editor(originalShell, changes);
      command.replace('### Shell', '### ' + shell, 'native shell name')
        .replace('list the terminals folder to check if they are already running in existing terminals.',
          has('job_list') ? 'use `job_list` to check if they are already running.' : 'check the actual running processes.', 'native process observation')
        .replace('The shell starts in the workspace root and is stateful across sequential calls. Current working directory and environment variables persist between calls.',
          'Set the working directory explicitly when needed. Each shell call starts a new process; directory and environment changes do not persist between calls.', 'native shell lifetime')
        .replace('Commands that don\'t complete within `block_until_ms` (default 30000ms / 30 seconds) are moved to background. Set `block_until_ms: 0` to immediately background.',
          'Use the actual timeout and background parameters from the shell schema. A background receipt identifies running work; collect its actual result before claiming completion.', 'native background parameters')
        .replace('Shell tool calls', shell + ' tool calls', 'native shell name')
        .replace('a single Shell call', 'a single ' + shell + ' call', 'native shell name');
      shellGuidance = '\n\n' + command.text();
    }
    e.block('## Available Tools', '## Git Operations', nativeTools + shellGuidance, 'live tool contracts replace incompatible IDE tool schemas; retain shell work rules')
      .replace('Agent transcripts (past chats) are stored as JSONL files and can be referenced by UUID.', 'Use past chats only through history actually supplied by the host or an available recall tool; do not infer transcript paths or identifiers.', 'native history');
  } else if (style === 'grok') {
    const text = renderTemplate(originals.grok, {
      system_prompt_label: 'Grok Build', is_non_interactive: false, memory_v2_enabled: false,
      include_browser_verification: has('computer_use'), system_reminders_enabled: false,
      scratch_dir: join(tmpdir(), 'omd-scratch') + sep,
      'tools.by_kind.task': has('subagent') ? 'subagent' : '', 'tools.by_kind.execute': shell,
    });
    e = editor(text, changes);
    e.replace('You are Grok Build released by xAI.', 'You use the Grok Build system prompt style in OMD.', 'host identity')
      .replace('an interactive CLI tool', 'an interactive coding assistant', 'host surface')
      .replace("the user's request, denoted within the <user_query> tag", "the user's request in the current conversation", 'host message format')
      .replace('stored as `.md` files in `~/.grok/docs/user-guide/`', 'published at https://github.com/xai-org/grok-build/tree/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide', 'public docs instead of absent local TUI')
      .replace('read the relevant file from that directory.', 'read the relevant published file with an available retrieval tool.', 'public docs access');
    if (shell) e.replace('as a background command in `' + shell + '`, then continue independent work.',
      'in `' + shell + '` using its actual background parameters when available, then continue independent work. ' + (has('job_output') ? 'Collect its result with `job_output` when the shell returns a job id.' : 'Wait for the actual shell result before claiming completion.'), 'native background contract');
  } else if (style === 'pi') {
    const selectedTools = schemas.map(t => t.name === 'pwsh' ? 'powershell' : t.name);
    const toolSnippets = Object.fromEntries(schemas.map(t => [t.name === 'pwsh' ? 'powershell' : t.name, (t.description ?? '').split('\n')[0]]));
    const { cwd: _cwd, ...sections } = piSections({ cwd: '', selectedTools, toolSnippets });
    e = editor(Object.values(sections).join('\n\n'), changes);
    e.replace('operating inside pi, a coding agent harness', 'using the Pi system prompt style inside OMD', 'host identity');
    if (has('pwsh')) e.replace('- powershell:', '- pwsh:', 'native shell name');
  } else if (style === 'zcode') {
    e = editor([zcodePrefix(), zcodeIdentity(), zcodeBehavior(), zcodeSession([...names]), zcodeContext()]
      .filter(Boolean).map(section => section.content).join('\n\n'), changes);
    e.replace('You are ZCode, an interactive coding agent', 'You use the ZCode system prompt style, as an interactive coding agent in OMD', 'host identity')
      .replace('You are an interactive ZCode agent', 'You are an interactive coding agent', 'host identity')
      .replace('markdown in a terminal.', 'markdown in the current interface.', 'host surface')
      .replace('The user is not watching in real time and cannot answer questions mid-task,', 'The user may not be watching in real time,', 'interactive host can accept questions');
  } else if (style === 'dsh') return { text: '', changes };
  else throw Error('No upstream renderer for prompt style: ' + style);
  return { text: e.text(), changes };
}
