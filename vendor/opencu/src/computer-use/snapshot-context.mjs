// Context uses only the AX nodes already fetched for this observation. Keep raw
// ownership boundaries: flattening ignored containers can borrow another card's
// label. An explicit named scope is more reliable than nearby changing text.
const ACTIONS = new Set(['add','apply','back','cancel','close','confirm','continue','delete','done','edit','go','more','next','no','ok','open','previous','remove','reset','save','select','submit','suspend','view','yes','保存','取消','删除','提交','编辑','确定','关闭','查看','打开','添加','移除','选择','应用','重置','更多','继续','返回','下一步','上一步','是','否']);
const CONTROLS = new Set(['button','link','textbox','combobox','checkbox','radio','switch','tab','menuitem','menuitemcheckbox','menuitemradio','option','slider','spinbutton','treeitem','searchbox']);
const SCOPES = new Set(['article','section','group','region','row','form','listitem']);
const TEXT = new Set(['heading','statictext','inlinetextbox','text']);
const VOLATILE = new Set(['status','alert','log','progressbar','timer','marquee']);
const MAX_LEVELS = 6, MAX_SIBLINGS = 12, MAX_SUBTREE = 60;
const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalize = value => compact(value).toLowerCase();
const roleOf = node => normalize(node.role?.value);
const keyOf = row => CONTROLS.has(normalize(row.role)) && compact(row.name) ? `${normalize(row.role)}\0${normalize(row.name)}` : undefined;
const idOf = row => row.id ?? row.node.nodeId;

function labelOf(value, target) {
  const label = compact(value), key = normalize(label);
  if (!label || key === target || key.startsWith('ctx_') || ACTIONS.has(key)) return;
  if (/<\/?[a-z][^>]*>|<!\[endif\]|<!--|-->/i.test(label)
    || /\$\(function|document\.|window\.|\.onclick\s*=|function\s*\(|var\s+\w+\s*=/.test(label)
    || /https?:\/\/|encodeURIComponent|target="_blank"/i.test(label)
    || /^\d{5,}$|icp|备案|联系方式|政府网站标识|^欢迎$|^section$/i.test(label)) return;
  return label;
}

// A branch with any action, live status, or an incomplete scan is a boundary,
// never another card's text label. Work and traversal are bounded even on cycles.
function branch(byId, start, target) {
  const pending = [start], seen = new Set(); let label;
  for (let index = 0; index < pending.length; index++) {
    const id = pending[index];
    if (seen.has(id)) continue;
    if (seen.size >= MAX_SUBTREE) return { boundary: true };
    seen.add(id);
    const node = byId.get(id); if (!node) continue;
    const role = roleOf(node);
    if (CONTROLS.has(role) || VOLATILE.has(role)) return { boundary: true };
    if (!label && TEXT.has(role)) label = labelOf(node.name?.value, target);
    for (const child of node.childIds ?? []) if (!seen.has(child)) {
      if (pending.length >= MAX_SUBTREE) return { boundary: true };
      pending.push(child);
    }
  }
  return { label };
}

function contextOf(row, byId, positions) {
  const target = normalize(row.name), ancestors = [], seen = new Set([row.node.nodeId]);
  let child = row.node;
  for (let level = 0; child.parentId && level < MAX_LEVELS; level++) {
    const parent = byId.get(child.parentId);
    if (!parent || seen.has(parent.nodeId)) break;
    seen.add(parent.nodeId); ancestors.push({ parent, child }); child = parent;
    if (VOLATILE.has(roleOf(parent))) return;
    if (SCOPES.has(roleOf(parent))) {
      const label = labelOf(parent.name?.value, target);
      if (label) return label;
    }
  }
  for (const { parent, child } of ancestors) {
    const siblings = parent.childIds ?? [], at = positions.get(child.nodeId);
    if (at === undefined) continue;
    for (let offset = 1; offset <= MAX_SIBLINGS && offset <= at; offset++) {
      const result = branch(byId, siblings[at - offset], target);
      if (result.boundary) break;
      if (result.label) return result.label;
    }
    // A following label is safe only within a small owned container containing
    // this one action branch. Never infer a following label at the document root.
    if (roleOf(parent) !== 'rootwebarea' && siblings.length <= MAX_SIBLINGS
      && siblings.filter(id => branch(byId, id, target).boundary).length === 1) {
      for (let index = at + 1; index < siblings.length; index++) {
        const result = branch(byId, siblings[index], target);
        if (result.boundary) break;
        if (result.label) return result.label;
      }
    }
    // Unnamed raw containers still bound ownership. Do not walk out of a
    // card just because it has no printable role or accessible name.
    if (SCOPES.has(roleOf(parent)) || ['generic', 'none'].includes(roleOf(parent))) break;
  }
}

function fitLabel(label, bytes) {
  if (Buffer.byteLength(JSON.stringify(label)) <= bytes) return label;
  let prefix = '';
  for (const point of label) {
    if (Buffer.byteLength(JSON.stringify(prefix + point + '…')) > bytes) break;
    prefix += point;
  }
  return prefix.trim() ? prefix.trimEnd() + '…' : undefined;
}

// Count and validate names across the entire observation, including all frames.
// AX node IDs remain frame-local; returned keys are the caller's opaque row IDs.
export function snapshotFrameContexts(frames, { maxBytes = 8192, maxLabelBytes = 96 } = {}) {
  const counts = new Map(), candidates = [];
  for (const { rows } of frames) for (const row of rows) {
    const key = keyOf(row); if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const { rows, byId } of frames) {
    const positions = new Map();
    for (const node of byId.values()) (node.childIds ?? []).forEach((id, index) => positions.set(id, index));
    for (const row of rows) {
      const key = keyOf(row); if (!key || counts.get(key) < 2) continue;
      const label = contextOf(row, byId, positions);
      if (label) candidates.push({ row, key, label });
    }
  }
  const allowance = Math.min(maxLabelBytes, Math.floor(Math.max(0, maxBytes) / Math.max(1, candidates.length)) - 8);
  if (allowance < 8) return new Map();
  const labels = new Map();
  for (const candidate of candidates) {
    candidate.label = fitLabel(candidate.label, allowance);
    if (!candidate.label) continue;
    candidate.labelKey = candidate.key + '\0' + normalize(candidate.label);
    labels.set(candidate.labelKey, (labels.get(candidate.labelKey) ?? 0) + 1);
  }
  return new Map(candidates.filter(item => item.label && labels.get(item.labelKey) === 1).map(item => [idOf(item.row), item.label]));
}

export function snapshotContexts(rows, byId, options) {
  return snapshotFrameContexts([{ rows, byId }], options);
}
