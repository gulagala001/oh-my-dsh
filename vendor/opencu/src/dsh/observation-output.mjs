/** Model-facing AX rendering. Raw observations remain in the backend/UI. */
const quote = value => JSON.stringify(value);
const scalar = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(scalar) : Object.fromEntries(Object.keys(value).sort().map(key => [key, scalar(value[key])])) : value;
const keyOf = node => node.elementId ?? node.id ?? (node.nodeId != null ? `node:${node.nodeId}` : undefined);
const omitted = new Set(['id', 'elementId', 'nodeId', 'backendDOMNodeId', 'role', 'name', 'label', 'text', 'value', 'parentId', 'children', 'childIds', 'properties', 'bounds', 'rect', 'frame']);
const aliases = {AXEnabled: 'enabled', AXFocused: 'focused', AXSelected: 'selected'};

// Sequential [id, predecessor] edits preserve order without repeating the whole tree.
function orderEdits(before, after) {
  const links = new Map();
  let previous = null;
  for (const id of before.keys()) if (after.has(id)) {
    links.set(id, { previous, next: null });
    if (previous !== null) links.get(previous).next = id;
    previous = id;
  }
  let head = [...links.keys()][0] ?? null;
  const edits = [];
  previous = null;
  for (const id of after.keys()) {
    const link = links.get(id);
    if (!link || link.previous !== previous) {
      edits.push([id, previous]);
      if (link) {
        if (link.previous === null) head = link.next;
        else links.get(link.previous).next = link.next;
        if (link.next !== null) links.get(link.next).previous = link.previous;
      }
      const next = previous === null ? head : links.get(previous).next;
      links.set(id, { previous, next });
      if (next !== null) links.get(next).previous = id;
      if (previous === null) head = id;
      else links.get(previous).next = id;
    }
    previous = id;
  }
  return edits;
}

export function semanticAX(ax) {
  if (!ax || typeof ax !== 'object' || !Array.isArray(ax.nodes)) return {text: typeof ax === 'string' ? ax : JSON.stringify(ax ?? null), rows: null};
  const parents = new Map(), ambiguousParents = new Set(), duplicateIds = new Set();
  const nodeKeys = new Map(ax.nodes.map(node => [String(node.nodeId ?? keyOf(node)), keyOf(node)]));
  const nodesById = new Map(ax.nodes.map(node => [String(node.nodeId ?? keyOf(node)), node]));
  // Keep hierarchy edges in backend IDs until the single model-ID lookup below.
  for (const node of ax.nodes) for (const child of node.children ?? node.childIds ?? []) {
    const key = String(child), parent = node.nodeId ?? keyOf(node);
    if (parents.has(key) && String(parents.get(key)) !== String(parent)) ambiguousParents.add(key);
    parents.set(key, parent);
  }
  const directChildren = new Map(), seenIds = new Set();
  for (const node of ax.nodes) {
    const key = String(node.nodeId ?? keyOf(node));
    if (seenIds.has(key)) duplicateIds.add(key);
    seenIds.add(key);
    const parent = node.parentId ?? parents.get(key);
    if (parent != null) {
      const children = directChildren.get(String(parent)) ?? [];
      children.push(node); directChildren.set(String(parent), children);
    }
  }
  const redundant = new Set(), emptyList = value => value == null || Array.isArray(value) && value.length === 0;
  for (const node of ax.nodes) {
    const key = String(node.nodeId ?? keyOf(node)), ids = node.children ?? node.childIds;
    if (node.role !== 'StaticText' || typeof node.name !== 'string' || duplicateIds.has(key) ||
        !Array.isArray(ids) || !ids.length || new Set(ids.map(String)).size !== ids.length || directChildren.get(key)?.length !== ids.length) continue;
    const children = ids.map(id => nodesById.get(String(id)));
    // Only an explicit, complete ordered list of non-actionable leaves proves duplication.
    if (children.every(child => child && !duplicateIds.has(String(child.nodeId ?? keyOf(child))) &&
        !ambiguousParents.has(String(child.nodeId ?? keyOf(child))) &&
        String(child.parentId ?? parents.get(String(child.nodeId ?? keyOf(child)))) === key &&
        child.role === 'InlineTextBox' && child.elementId == null && child.id == null && typeof child.name === 'string' &&
        emptyList(child.actions) && emptyList(child.properties?.actions) && emptyList(child.children) && emptyList(child.childIds) &&
        !directChildren.get(String(child.nodeId ?? keyOf(child)))?.length) && children.map(child => child.name).join('') === node.name) {
      for (const child of children) redundant.add(child);
    }
  }
  const rows = new Map(), lines = [];
  let unique = true;
  for (const [index, node] of ax.nodes.entries()) {
    const id = keyOf(node), key = String(id ?? `unindexed:${index}`);
    const parent = node.parentId ?? parents.get(String(node.nodeId ?? id));
    const parentKey = parent == null ? null : nodeKeys.get(String(parent)) ?? parent;
    if (redundant.has(node)) continue;
    const attrs = {...node.properties};
    for (const [name, value] of Object.entries(node)) if (!omitted.has(name) && value !== undefined) attrs[aliases[name] ?? name] = value;
    const label = node.name ?? node.label ?? node.text;
    if (typeof attrs.description === 'string' && attrs.description === label) delete attrs.description;
    if (typeof attrs.help === 'string' && (attrs.help === label || attrs.help === attrs.description)) delete attrs.help;
    let line = `[${key}] ${node.role || 'unknown'}`;
    if (label !== undefined && label !== '') line += ` ${quote(label)}`;
    if (node.value !== undefined) line += ` value=${quote(node.value)}`;
    if (parentKey != null) line += ` parent=[${parentKey}]`;
    for (const name of Object.keys(attrs).sort()) if (attrs[name] !== undefined) line += ` ${name}=${quote(scalar(attrs[name]))}`;
    if (rows.has(key)) unique = false;
    rows.set(key, line); lines.push(line);
  }
  const metadata = Object.fromEntries(Object.entries(ax).filter(([key]) => !['nodes', 'text', 'generation', 'stableIds', 'identityScope', 'numericIds'].includes(key)));
  const notice = Object.keys(metadata).length ? `AX ${quote(scalar(metadata))}\n` : '';
  return {text: notice + lines.join('\n'), rows: unique ? rows : null,
    stable: ax.stableIds === true && typeof ax.identityScope === 'string', scope: ax.identityScope,
    truncated: ax.truncated === true, metadata: quote(scalar(metadata))};
}

export function createObservationProjector() {
  const baselines = new Map();
  let lastTarget;
  return {
    reset(targetId) { if (targetId == null) { baselines.clear(); lastTarget = undefined; } else baselines.delete(targetId); },
    project(value, options = {}) {
      if (!value.observation) return value;
      const observation = {...value.observation};
      const oldText = typeof observation.ax === 'string' ? observation.ax : observation.ax?.text;
      if (typeof observation.state === 'string' && (observation.state === oldText || observation.state === observation.text)) delete observation.state;
      if (typeof observation.text === 'string' && (observation.text === oldText || observation.ax?.source === 'chromium-accessibility-tree')) delete observation.text;
      const targetId = value.targetId ?? options.targetId;
      if (options.format === 'screenshot' || options.details === true) { this.reset(targetId); return value; }
      const view = semanticAX(observation.ax), previous = baselines.get(targetId);
      const id = observation.id ?? observation.observationId;
      const allowDiff = options.emit !== false && !options.disableDiffing && !options.disableDiff;
      let text = view.text, mode = 'full', baseObservationId;
      if (allowDiff && targetId != null && lastTarget === targetId && id && previous?.id && view.stable && view.rows &&
          previous.scope === view.scope && previous.rows && !view.truncated && !previous.truncated && previous.metadata === view.metadata) {
        const changes = [];
        for (const key of previous.rows.keys()) if (!view.rows.has(key)) changes.push(`- [${key}]`);
        for (const [key, line] of view.rows) if (previous.rows.get(key) !== line) changes.push(`${previous.rows.has(key) ? '~' : '+'} ${line}`);
        // Include relative order when it changes; full output wins if a diff is larger.
        const edits = orderEdits(previous.rows, view.rows);
        if (edits.length) changes.push(`orderAfter=${quote(edits)} (move/insert each id after its predecessor; null means first)`);
        if (!changes.length || changes.join('\n').length < text.length) {
          mode = 'diff'; baseObservationId = previous.id;
          text = `AX diff from ${previous.id} to ${id}\n${changes.join('\n') || '(no change; do not immediately repeat observation)'}`;
        }
      }
      if (options.emit !== false && view.stable && id && targetId != null) {
        if (lastTarget !== targetId) baselines.clear();
        baselines.set(targetId, {rows: view.rows, scope: view.scope, truncated: view.truncated, metadata: view.metadata, id});
        lastTarget = targetId;
      } else this.reset(targetId);
      return {...value, observation: {...observation, ax: text,
        axView: {mode, ...(baseObservationId ? {baseObservationId} : {}), ...(id ? {observationId: id} : {}),
          ...(mode === 'full' ? {order: 'tree traversal'} : {}), details: 'Use details:true for raw nodes and geometry.'}}};
    },
  };
}
