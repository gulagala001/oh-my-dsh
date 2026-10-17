/** Model-facing AX rendering. Raw observations remain in the backend/UI. */
const quote = value => JSON.stringify(value);
const scalar = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(scalar) : Object.fromEntries(Object.keys(value).sort().map(key => [key, scalar(value[key])])) : value;
const keyOf = node => node.elementId ?? node.id ?? (node.nodeId != null ? `node:${node.nodeId}` : undefined);
const omitted = new Set(['id', 'elementId', 'nodeId', 'backendDOMNodeId', 'role', 'name', 'label', 'text', 'value', 'parentId', 'children', 'childIds', 'properties', 'bounds', 'rect', 'frame']);
const aliases = {AXEnabled: 'enabled', AXFocused: 'focused', AXSelected: 'selected'};

export function semanticAX(ax) {
  if (!ax || typeof ax !== 'object' || !Array.isArray(ax.nodes)) return {text: typeof ax === 'string' ? ax : JSON.stringify(ax ?? null), rows: null};
  const parents = new Map(), nodeKeys = new Map(ax.nodes.map(node => [String(node.nodeId ?? keyOf(node)), keyOf(node)]));
  // Keep hierarchy edges in backend IDs until the single model-ID lookup below.
  for (const node of ax.nodes) for (const child of node.children ?? node.childIds ?? []) parents.set(String(child), node.nodeId ?? keyOf(node));
  const rows = new Map(), lines = [];
  let unique = true;
  for (const [index, node] of ax.nodes.entries()) {
    const id = keyOf(node), key = String(id ?? `unindexed:${index}`);
    const parent = node.parentId ?? parents.get(String(node.nodeId ?? id));
    const parentKey = parent == null ? null : nodeKeys.get(String(parent)) ?? parent;
    const attrs = {...node.properties};
    for (const [name, value] of Object.entries(node)) if (!omitted.has(name) && value !== undefined) attrs[aliases[name] ?? name] = value;
    const label = node.name ?? node.label ?? node.text;
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
        const oldOrder = [...previous.rows.keys()], newOrder = [...view.rows.keys()];
        if (oldOrder.length !== newOrder.length || oldOrder.some((key, index) => key !== newOrder[index])) changes.push(`order=${quote([...view.rows.keys()])}`);
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
