// DSH workspace boundaries are the user-visible "big folder" boundaries. Dream project
// keys are derived from git roots / cwd, so they do not necessarily line up with a
// workspace path; grouping therefore uses longest-ancestor matching. Drive roots are
// never treated as folders, otherwise one drive letter would swallow a whole disk.
import { isAbsolute, resolve, sep } from 'node:path';

const WIN = process.platform === 'win32';
const DRIVE_ROOT = /^[A-Za-z]:[\\/]?$/;

/** Drop trailing separators but keep a bare root ("D:\\", "/") intact. */
const stripTail = (p) => {
  if (!p.endsWith(sep)) return p;
  const cut = p.replace(/[\\/]+$/, '');
  if (!cut) return sep;
  return cut.endsWith(':') ? cut + sep : cut;
};
const normalize = (p) => stripTail(resolve(p));
/**
 * Comparison key: normalized, case-folded on Windows. A drive root must never go
 * through resolve(): on Windows "D:" is drive-relative, so resolve("D:") returns the
 * process cwd on that drive and the key would drift with cwd (the same project then
 * compared equal to whichever folder happened to be current). Every spelling of a
 * root ("D:", "D:/", "D:\") collapses to one stable key instead.
 */
const key = (p) => {
  if (typeof p === 'string' && isDriveRoot(p)) {
    const raw = p.trim().replace(/[\\/]+$/, '');
    return (WIN ? raw.toLowerCase() : raw) + sep;
  }
  return WIN ? normalize(p).toLowerCase() : normalize(p);
};
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Use the host registry so custom storage backends and roots work alike.
 * An unavailable optional registry does not block Dream or basic chat.
 */
export function workspaceRoots(ctx) {
  try {
    const registry = ctx?.get?.('workspaceRegistry') || ctx?.workspaceRegistry;
    const workspaces = registry?.list?.();
    if (!Array.isArray(workspaces)) return [];
    return [...new Set(workspaces.map(workspace => workspace?.path)
      .filter(path => typeof path === 'string' && path.trim()))].sort(byString);
  } catch { return []; }
}

/** Is p a drive root ("D:\\", "D:/", "D:"; "/" on POSIX)? */
export function isDriveRoot(p) {
  if (typeof p !== 'string' || !p.trim()) return false;
  const raw = p.trim();
  if (WIN) {
    if (DRIVE_ROOT.test(raw)) return true;
    try { return DRIVE_ROOT.test(stripTail(resolve(raw))); } catch { return false; }
  }
  try { return stripTail(resolve(raw)) === sep; } catch { return false; }
}

/** Is child strictly below parent? Segment-safe, so "D:\\a\\bc" is not under "D:\\a\\b". */
export function isUnderPath(child, parent) {
  if (typeof child !== 'string' || typeof parent !== 'string') return false;
  if (!child.trim() || !parent.trim()) return false;
  try {
    const c = key(child);
    const p = key(parent);
    if (c === p) return false;
    return c.startsWith(p.endsWith(sep) ? p : p + sep);
  } catch { return false; }
}

/**
 * The "big folder" a project belongs to: the longest strict ancestor among the
 * candidates, returned verbatim so it stays identical to the candidate the UI
 * offered. An equal candidate is only a fallback (the project itself), otherwise a
 * project that is also listed as a candidate would beat its own parent. No match
 * (or a drive-root match) → the project itself. Non-absolute project keys (e.g.
 * "@unclassified") never take part in ancestor matching, so a relative key can
 * never be resolved against cwd and folded into an unrelated workspace.
 */
export function folderOf(project, candidates) {
  if (typeof project !== 'string' || !project.trim()) return project;
  if (!isAbsolute(project)) return project;
  // "D:" is drive-relative for resolve(), so a drive root never joins the matching.
  if (isDriveRoot(project)) return project;
  const list = Array.isArray(candidates) ? candidates : [];
  const projectKey = key(project);
  let folder = null;
  let size = -1;
  for (const candidate of list) {
    if (typeof candidate !== 'string' || !candidate.trim() || !isAbsolute(candidate)) continue;
    if (isDriveRoot(candidate)) continue;
    if (key(candidate) === projectKey) continue;
    if (!isUnderPath(project, candidate)) continue;
    const candidateKey = key(candidate);
    if (candidateKey.length > size) { size = candidateKey.length; folder = candidate; }
  }
  if (folder === null || isDriveRoot(folder)) return project;
  return folder;
}

/**
 * Group projects by folderOf → [{ folder, projects }], folders and projects ascending.
 * The candidate set is roots ∪ projects: most Dream projects are not themselves DSH
 * workspaces, so a parent that only shows up as a project key must still be able to
 * become the folder of its children.
 *
 * `missing` (optional) answers "is this folder still on disk?" for a path. Project
 * keys outlive the directories they came from, so a folder may legitimately no longer
 * exist while its history is still worth organizing. Such folders are kept but
 * reported as `exists:false` and sorted last, so a stale path never outranks a live
 * one in the list.
 */
export function folderTree(projects, roots, missing) {
  const list = Array.isArray(projects) ? projects.filter(p => typeof p === 'string' && p.trim()) : [];
  const rootsArr = Array.isArray(roots) ? roots.filter(p => typeof p === 'string' && p.trim()) : [];
  const candidates = [...new Set([...rootsArr, ...list])];
  const groups = new Map();
  for (const project of list) {
    const folder = folderOf(project, candidates);
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(project);
  }
  // A probe that throws must not take the whole list down: an unknown folder is
  // reported as present, which keeps it in the normal (selectable) group.
  const gone = typeof missing === 'function'
    ? folder => { try { return missing(folder) !== false; } catch { return true; } }
    : null;
  return [...groups.keys()].sort(byString)
    .map(folder => ({
      folder,
      projects: groups.get(folder).sort(byString),
      exists: gone ? gone(folder) : true,
    }))
    .sort((a, b) => (a.exists === b.exists ? 0 : a.exists ? -1 : 1));
}

/**
 * Projects to organize for the selected folders. Empty / non-array selection means
 * "no restriction" (full list, backward compatible); otherwise use the same
 * complete grouping shown in the settings UI. A selected ancestor must not
 * also admit projects displayed under a different nested group.
 *
 * Blank and non-string entries are dropped before the empty check, so an all-blank
 * selection such as [""] behaves exactly like an empty one: "no restriction". That is
 * deliberate rather than a silent narrowing to zero projects, and the settings UI
 * depends on the empty case meaning "organize everything" (its clear button writes []).
 */
export function selectedProjects(projects, selected, roots = []) {
  const list = Array.isArray(projects) ? projects : [];
  const chosen = Array.isArray(selected) ? selected.filter(s => typeof s === 'string' && s.trim()) : [];
  if (!chosen.length) return list.slice();
  const chosenKeys = new Set(chosen.map(key));
  const admitted = new Set(folderTree(list, roots)
    .filter(group => chosenKeys.has(key(group.folder))).flatMap(group => group.projects));
  return [...new Set(list.filter(project => admitted.has(project)))];
}
