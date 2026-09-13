import { diffArrays } from 'diff';

const inline = value => JSON.stringify(String(value ?? '')).slice(1, -1);
export function nativeObservation(state, ids, app) {
  const nodes = new Map(), order = [], parents = [];
  for (const element of state.elements ?? []) {
    const id = ids.get(element.element_index), depth = Math.max(0, Number(element.depth) || 0);
    if (id === undefined) continue;
    parents.length = Math.min(parents.length, depth);
    const parent = parents.at(-1) ?? null;
    let line = '  '.repeat(depth) + `- [${id}] ${inline(element.role)} ${inline(element.label)}`;
    if (element.value !== undefined && element.value !== '') line += ` = ${inline(element.value)}`;
    if (element.actions?.length) line += ' actions=' + element.actions.map(inline).join(',');
    if (element.enabled === false || element.enabled === 0) line += ' [disabled]';
    if (element.placeholder) line += ` placeholder=${JSON.stringify(element.placeholder)}`;
    nodes.set(id, { line, parent }); order.push(id); parents[depth] = id;
  }
  const heading = `App ${JSON.stringify(app)}, window ${state.window_id}` + (state.window_title ? ` ${JSON.stringify(state.window_title)}` : '');
  const focus = ids.get(state.focused_element_index);
  const focused = nodes.get(focus);
  const footer = [focused ? 'Focused element: ' + focused.line.trimStart() : 'No focused element reported in this window.'];
  if (state.truncated) footer.push('[Accessibility tree truncated; some controls are omitted.]');
  if (state.unreadable) footer.push('[Some accessibility elements could not be read.]');
  if (state.degraded_reason) footer.push(`[Observation degraded: ${inline(state.degraded_reason)}]`);
  return { heading, nodes, order, footer: footer.join('\n'), incomplete: !!(state.truncated || state.unreadable || state.degraded_reason) };
}

const fullState = observation => [observation.heading, ...observation.order.map(id => observation.nodes.get(id).line), observation.footer].join('\n');
const ranges = ids => {
  const result = [];
  for (let start = 0; start < ids.length;) {
    let end = start; while (end + 1 < ids.length && ids[end + 1] === ids[end] + 1) end++;
    result.push(end === start ? String(ids[start]) : `${ids[start]}-${ids[end]}`); start = end + 1;
  }
  return result.join(', ');
};

export function nativeState(observation, previous) {
  if (!previous || observation.incomplete || previous.incomplete || observation.heading !== previous.heading) return fullState(observation);
  const edits = diffArrays(previous.order, observation.order, { timeout: 10, maxEditLength: 256 });
  if (!edits) return fullState(observation);
  const moved = new Set(edits.filter(edit => edit.added).flatMap(edit => edit.value).filter(id => previous.nodes.has(id)));
  const removed = previous.order.filter(id => !observation.nodes.has(id)).sort((a,b) => a-b);
  const changes = new Map();
  for (const id of observation.order) {
    const node = observation.nodes.get(id), old = previous.nodes.get(id);
    if (!old) changes.set(id, '+');
    else if (node.line !== old.line || node.parent !== old.parent || moved.has(id)) changes.set(id, '~');
  }
  if (!changes.size && !removed.length) return `${observation.heading}\nNo change in the accessibility tree.\n${observation.footer}`;
  const context = new Set();
  for (const id of changes.keys()) {
    let parent = observation.nodes.get(id).parent;
    while (parent !== null && !context.has(parent)) { context.add(parent); parent = observation.nodes.get(parent)?.parent ?? null; }
  }
  const lines = [observation.heading, 'Accessibility changes: ~ changed or moved; + added.'];
  if (removed.length) lines.push('Removed element IDs: ' + ranges(removed));
  for (const id of observation.order) if (changes.has(id) || context.has(id)) lines.push((changes.get(id) ?? ' ') + observation.nodes.get(id).line);
  lines.push(observation.footer); return lines.join('\n');
}
