// These DSH tools operate on observations or session state. Match the resolved
// declaration as well as its name so a different preset tool stays protected.
const nativeDescriptions = new Map(Object.entries({
  read: 'Read a UTF-8 text file and return line-numbered content.',
  read_image: 'Read a PNG/JPEG/WebP/GIF file and return the image itself.',
  glob: 'Find files, not directories, whose paths match a glob pattern',
  grep: 'Search file contents with a ripgrep regular expression.',
  wait_agent: 'Wait for input at your next step',
  list_agents: 'List your entire subagent tree:',
  send_message: 'Send a message to an agent.',
  interrupt_agent: 'Ask a subagent to stop its current work.',
  team_task_get: 'Read the complete latest value of one shared task',
  team_task_list: 'List shared tasks, including readiness',
  team_task_create: 'Create one unowned pending task on the shared Team task board.',
  team_task_update: 'Compare-and-set a shared task action',
}));
const independent = Symbol.for('dsh-rewind-plus.workspace-independent');
function workspaceIndependent(tool) {
  if (!tool) return false;
  if (tool[independent] !== undefined) return tool[independent] === true;
  const prefix = nativeDescriptions.get(tool.name);
  return prefix !== undefined && tool.description?.startsWith(prefix) === true;
}

// A run_code program can write files directly. Only a single SDK call with a
// flat record of literal arguments can take the same path as a direct tool.
// More complex programs retain their before/after snapshots.
function literalCall(program) {
  if (typeof program !== 'string' || program.length > 16384) return;
  let source = program.trim().replace(/;$/, '').trim();
  for (const wrapper of ['console.log', 'print']) {
    if (source.startsWith(wrapper + '(') && source.endsWith(')')) {
      source = source.slice(wrapper.length + 1, -1).trim();
      break;
    }
  }
  const call = /^(?:return\s+)?await\s+tools\.([a-z_]+)\(\s*([\s\S]*?)\s*\)$/.exec(source);
  if (!call) return;
  const args = call[2];
  if (args) {
    if (!args.startsWith('{') || !args.endsWith('}')) return;
    const fields = args.slice(1, -1).trim();
    const field = /(?:\w+|"\w+"|'\w+')\s*:\s*(?:"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|-?\d+(?:\.\d+)?|true|false|null|True|False|None)\s*(?:,\s*|$)/y;
    while (field.lastIndex < fields.length) {
      if (!field.test(fields)) return;
    }
  }
  return call[1];
}

export function tracksWorkspaceTool(exec, tools) {
  if (!exec.agent || exec.parent !== undefined) return false;
  // Retained REPL/script bindings may have been reassigned in an earlier call.
  if (exec.name === 'run_code' && exec.agent.ctx?.get?.('ptcRuntime')?.programFormat !== 'function-body') return true;
  const target = exec.name === 'run_code' ? literalCall(exec.arguments?.code) : exec.name;
  return !target || !workspaceIndependent(tools?.get(target, exec.agent, exec.toolSet));
}
