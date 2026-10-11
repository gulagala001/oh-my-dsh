import { diffArrays } from 'diff';

const inline = value => JSON.stringify(String(value ?? '')).slice(1, -1);
const selectedText = text => {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `Selected text: ${fence}\n${text}\n${fence}`;
};
export function remapNativeObservation(state, ids, previousRenderedIds = new Map()) {
  const renderedIds = new Map();
  const row = element => {
    const id = ids.get(element.element_index);
    if (id === undefined || !Number.isSafeInteger(element.rendered_id)) return element;
    renderedIds.set(element.rendered_id, id);
    const prefix = '\t'.repeat(Math.max(0, Number(element.depth) || 0)) + element.rendered_id + ' ';
    if (id === element.rendered_id) return element;
    const line = typeof element.render_line === 'string' && element.render_line.startsWith(prefix)
      ? '\t'.repeat(Math.max(0, Number(element.depth) || 0)) + id + ' ' + element.render_line.slice(prefix.length)
      : '\t'.repeat(Math.max(0, Number(element.depth) || 0)) + id + ' ' + element.render_text;
    return { ...element, rendered_id: id, render_line: line };
  };
  const elements = (state.elements ?? []).map(row), focus = (state.focus_elements ?? []).map(row);
  let footer = state.render_footer;
  if (typeof footer === 'string' && state.selected_text === undefined && focus.length) {
    const original = state.focus_elements;
    const before = focus.length === 1 ? '\nThe focused UI element is ' + original[0].render_line
      : '\nSelected:\n' + original.slice(1).map(element => element.render_line).join('\n');
    const after = focus.length === 1 ? '\nThe focused UI element is ' + focus[0].render_line
      : '\nSelected:\n' + focus.slice(1).map(element => element.render_line).join('\n');
    if (footer.startsWith(before)) footer = after + footer.slice(before.length);
  }
  const changes = state.revision_changes?.map(change => ({ ...change,
    rendered_id: (change.kind === 'remove' ? previousRenderedIds : renderedIds).get(change.rendered_id) }));
  return { state: { ...state, elements, focus_elements: focus, render_footer: footer, revision_changes: changes }, renderedIds };
}
export function nativeObservation(state, ids, app) {
  const nodes = new Map(), order = [], lines = [], parents = []; let duplicateIds = false;
  for (const element of state.elements ?? []) {
    const id = ids.get(element.element_index), depth = Math.max(0, Number(element.depth) || 0);
    if (id === undefined) continue;
    parents.length = Math.min(parents.length, depth);
    const parent = parents.at(-1) ?? null;
    let text = typeof element.render_text === 'string' ? element.render_text : `${inline(element.role)} ${inline(element.label)}`;
    if (typeof element.render_text !== 'string') {
      if (element.value !== undefined && element.value !== '') text += ` = ${inline(element.value)}`;
      if (element.actions?.length) text += ' actions=' + element.actions.map(inline).join(',');
      if (element.enabled === false || element.enabled === 0) text += ' [disabled]';
      if (element.placeholder) text += ` placeholder=${JSON.stringify(element.placeholder)}`;
    }
    const line = element.rendered_id === id && typeof element.render_line === 'string'
      ? element.render_line : '  '.repeat(depth) + `- [${id}] ${text}`;
    if (nodes.has(id)) duplicateIds = true;
    nodes.set(id, { line, parent }); order.push(id); lines.push(line); parents[depth] = id;
  }
  const sourcePresentation = typeof state.render_heading === 'string' && typeof state.render_footer === 'string';
  const heading = sourcePresentation ? state.render_heading
    : `App ${JSON.stringify(app)}, window ${state.window_id}` + (state.window_title ? ` ${JSON.stringify(state.window_title)}` : '');
  const focus = ids.get(state.focused_element_index);
  const focused = nodes.get(focus);
  const focusLines = [];
  for (const element of state.focus_elements ?? []) {
    const id = ids.get(element.element_index);
    if (id === undefined || typeof element.render_text !== 'string') continue;
    const depth = Math.max(0, Number(element.depth) || 0);
    focusLines.push(element.rendered_id === id && typeof element.render_line === 'string'
      ? element.render_line : '  '.repeat(depth) + `- [${id}] ${element.render_text}`);
  }
  const footer = [focusLines.length ? 'The focused UI element is ' + focusLines[0].trimStart() + (focusLines.length > 1 ? '\n' + focusLines.slice(1).join('\n') : '')
    : focused ? 'The focused UI element is ' + focused.line.trimStart() : 'No focused element reported in this window.'];
  if (typeof state.selected_text === 'string' && state.selected_text.length) footer.push(selectedText(state.selected_text));
  if (state.truncated) footer.push('[Accessibility tree truncated; some controls are omitted.]');
  if (state.unreadable) footer.push('[Some accessibility elements could not be read.]');
  if (state.degraded_reason) footer.push(`[Observation degraded: ${inline(state.degraded_reason)}]`);
  if (state.screenshot_error) footer.push(`[Screenshot unavailable: ${inline(state.screenshot_error.code)}]`);
  const extraFooter = footer.filter(line => line.startsWith('[Accessibility tree truncated;') || line.startsWith('[Some accessibility elements') || line.startsWith('[Observation degraded:') || line.startsWith('[Screenshot unavailable:'));
  return { heading, app, nodes, order, lines, duplicateIds, sourcePresentation, windowReference: state.render_window_reference,
    footer: sourcePresentation ? state.render_footer + (extraFooter.length ? '\n' + extraFooter.join('\n') : '') : footer.join('\n'), incomplete: !!(state.truncated || state.unreadable || state.degraded_reason),
    revisionId: state.revision_id, previousRevisionId: state.previous_revision_id, revisionChanges: state.revision_changes, axDiffingEnabled: state.ax_diffing_enabled };
}

const fullState = observation => observation.sourcePresentation
  ? observation.heading + '\n' + observation.lines.join('\n') + '\n' + observation.footer
  : [observation.heading, ...(observation.lines ?? observation.order.map(id => observation.nodes.get(id).line)), observation.footer].join('\n');
const ranges = ids => {
  const result = [];
  for (let start = 0; start < ids.length;) {
    let end = start; while (end + 1 < ids.length && ids[end + 1] === ids[end] + 1) end++;
    result.push(end === start ? String(ids[start]) : `${ids[start]}-${ids[end]}`); start = end + 1;
  }
  return result.join(', ');
};

export function nativeState(observation, previous, { disableDiffing = false } = {}) {
  if (disableDiffing || observation.axDiffingEnabled === false || !previous || observation.incomplete || previous.incomplete || observation.duplicateIds || previous.duplicateIds || (!observation.sourcePresentation && observation.heading !== previous.heading)) return fullState(observation);
  const changes = new Map(), removed = [];
  if (observation.revisionId !== undefined) {
    if (typeof previous.revisionId !== 'string' || !previous.revisionId || observation.previousRevisionId !== previous.revisionId || !Array.isArray(observation.revisionChanges)) return fullState(observation);
    for (const change of observation.revisionChanges) {
      const id = change.rendered_id;
      if (!Number.isSafeInteger(id) || id < 0 || !['none', 'insert', 'update', 'remove'].includes(change.kind)) return fullState(observation);
      if (!(change.kind === 'remove' ? previous.nodes : observation.nodes).has(id)) return fullState(observation);
      if (change.kind === 'remove') removed.push(id);
      else if (change.kind !== 'none') changes.set(id, change.kind === 'insert' ? '+' : '~');
    }
  } else {
    // Windows and older native runtimes do not publish native revision changes.
    const edits = diffArrays(previous.order, observation.order, { timeout: 10, maxEditLength: 256 });
    if (!edits) return fullState(observation);
    const moved = new Set(edits.filter(edit => edit.added).flatMap(edit => edit.value).filter(id => previous.nodes.has(id)));
    removed.push(...previous.order.filter(id => !observation.nodes.has(id)));
    for (const id of observation.order) {
      const node = observation.nodes.get(id), old = previous.nodes.get(id);
      if (!old) changes.set(id, '+');
      else if (node.line !== old.line || node.parent !== old.parent || moved.has(id)) changes.set(id, '~');
    }
  }
  removed.sort((a, b) => a - b);
  if (observation.sourcePresentation) {
    // The native budget counts insertion subtrees; a removed-ID summary reserves one line.
    const inserted = [...changes.values()].filter(kind => kind === '+').length;
    if (inserted > observation.order.length || (removed.length && inserted >= observation.order.length)) return fullState(observation);
    if (!changes.size && !removed.length) return `There has been no change in the accessibility tree for ${observation.windowReference}.` + observation.footer;
    const lines = [];
    if (removed.length) lines.push('Removed element IDs: ' + ranges(removed));
    for (const id of observation.order) if (changes.has(id)) lines.push(changes.get(id) + observation.nodes.get(id).line);
    return `The following is a diff from the previous accessibility tree for ${observation.windowReference} with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.\n` + lines.join('\n') + observation.footer;
  }
  if (!changes.size && !removed.length) return `${observation.heading}\nThere has been no change in the accessibility tree for ${JSON.stringify(observation.app)}.\n${observation.footer}`;
  const context = new Set();
  for (const id of changes.keys()) {
    let parent = observation.nodes.get(id).parent;
    while (parent !== null && !context.has(parent)) { context.add(parent); parent = observation.nodes.get(parent)?.parent ?? null; }
  }
  const lines = [observation.heading, 'The following is a diff from the previous accessibility tree', 'with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.'];
  if (removed.length) lines.push('Removed element IDs: ' + ranges(removed));
  for (const id of observation.order) if (changes.has(id) || context.has(id)) lines.push((changes.get(id) ?? ' ') + observation.nodes.get(id).line);
  lines.push(observation.footer); return lines.join('\n');
}
