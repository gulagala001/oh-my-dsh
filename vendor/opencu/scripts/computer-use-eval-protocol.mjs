// Conformance checks for isolated evaluations, not product tool restrictions.
const allowed = new Set(['computer_use', 'computer_use_reset', 'todo_write', 'verify_link']);

export function visualTaskOrder(events) {
  if (!Array.isArray(events)) return false;
  const hit = events.findIndex(event => event.type === 'red-hit'), drag = events.findIndex(event => event.type === 'drag-start'), dropped = events.findIndex(event => event.type === 'drag-complete');
  return hit >= 0 && drag > hit && dropped > drag;
}

export function unexpectedEvalTool(name, argumentsText) {
  if (!allowed.has(name)) return { name: name || '<missing>' };
  if (name === 'verify_link') {
    let args; try { args = JSON.parse(argumentsText); } catch { return { name, operation: 'invalid-arguments' }; }
    if (args?.op === 'run') return { name, operation: 'run' };
    if (args?.links?.some?.(link => link?.kind === 'test' || link?.cmd)) return { name, operation: 'test-command' };
  }
  return null;
}

export function unexpectedResponseTools(body, contentType, { includeArguments = false } = {}) {
  const events = [];
  if (contentType.includes('event-stream')) {
    let done = false;
    for (const frame of body.split(/\r?\n\r?\n/)) {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
      if (!data) continue;
      if (data === '[DONE]') { done = true; continue; }
      events.push(JSON.parse(data));
    }
    if (!done) throw new Error('Provider stream ended before its completion marker');
  } else events.push(JSON.parse(body));
  const calls = new Map();
  for (const event of events) for (const choice of event.choices ?? []) {
    const message = choice.delta ?? choice.message;
    const list = message?.tool_calls ?? (message?.function_call ? [{ index: 0, function: message.function_call }] : []);
    for (const [position, call] of list.entries()) {
      const key = `${choice.index ?? 0}:${call.index ?? position}`;
      const value = calls.get(key) ?? { name: '', arguments: '' };
      value.name += call.function?.name ?? ''; value.arguments += call.function?.arguments ?? '';
      calls.set(key, value);
    }
  }
  return [...calls.values()].flatMap(call => {
    const violation = unexpectedEvalTool(call.name, call.arguments);
    return violation ? [{ ...violation, ...(includeArguments ? { arguments: call.arguments } : {}) }] : [];
  });
}

export async function relayEvalResponse(upstream, downstream, onViolation) {
  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  // Do not release partial tool calls. An unexpected call later in the same
  // response must stop the evaluation before the host executes any of them.
  const body = await upstream.text();
  const violations = upstream.ok ? unexpectedResponseTools(body, contentType) : [];
  if (downstream.destroyed) return { status: 499, clientClosed: true };
  if (violations.length) {
    onViolation(violations, unexpectedResponseTools(body, contentType, { includeArguments: true }));
    downstream.writeHead(422, { 'Content-Type': 'application/json' });
    downstream.end(JSON.stringify({ error: { message: 'Computer Use evaluation stopped before executing unexpected tools: ' + violations.map(v => v.name + (v.operation ? ':' + v.operation : '')).join(', ') } }));
    return { status: 422, guardRejected: true };
  }
  downstream.writeHead(upstream.status, { 'Content-Type': contentType }); downstream.end(body);
  return { status: upstream.status };
}
