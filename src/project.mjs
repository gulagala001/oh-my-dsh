// project 键：记忆的「本项目」层按 git 根目录隔离，而不是会话 cwd 原样——
// 同一仓库下不同子目录开会话应共享项目记忆；没有 git 的目录退回 cwd 本身。
// 兼容旧记忆：v2 早期条目存的是原始 cwd（可能是子目录），visibleTo 用 sameProject 做「子目录 ⊂ git 根」的等价判断。
import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

const MAX_DEPTH = 64
const CACHE_MAX = 256
/** cwd → { key, gitRoot }（FIFO 淘汰） */
const cache = new Map()
/** 已确认「本身就是 git 根」的目录（sameProject 判子目录兼容时用） */
const gitRoots = new Set()

const normalize = (p) => {
  const r = resolve(String(p))
  return r.length > 1 && r.endsWith(sep) ? r.slice(0, -1) : r
}
const hasGit = (dir) => {
  try {
    const g = join(dir, '.git')
    if (!existsSync(g)) return false
    const st = statSync(g)
    return st.isDirectory() || st.isFile()   // worktree / submodule 的 .git 是文件
  } catch { return false }
}

/**
 * cwd 所属项目的键：向上找到最近的 .git（目录或文件）所在目录；找不到 → cwd 本身（规范化）。
 * 非字符串/空 → null。结果按 cwd 缓存。
 */
export function projectKeyOf(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) return null
  const start = normalize(cwd)
  const hit = cache.get(start)
  if (hit) return hit.key
  let dir = start, key = start, gitRoot = false
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (hasGit(dir)) { key = dir; gitRoot = true; break }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  if (gitRoot) gitRoots.add(key)
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
  cache.set(start, { key, gitRoot })
  return key
}

/** 供测试 / 目录结构变化后重置 */
export function clearProjectKeyCache() { cache.clear(); gitRoots.clear() }

/** a 是否在 b 之下（按路径分段：/a/b 在 /a 下，/a/bc 不在 /a 下） */
export const isUnder = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const A = normalize(a), B = normalize(b)
  return A !== B && A.startsWith(B.endsWith(sep) ? B : B + sep)
}

/**
 * 记忆条目绑定的 project（memProject）是否属于当前项目键（curProject）：
 * 相等；或 memProject 是 curProject 的子目录且 curProject 是 git 根（旧记忆存的原始子目录 cwd → 归入本仓库）。
 * 反向（记忆绑在父目录）不算——父目录会话的记忆不该漏进每个子仓库。
 */
export function sameProject(memProject, curProject) {
  if (typeof memProject !== 'string' || typeof curProject !== 'string') return false
  const M = normalize(memProject), C = normalize(curProject)
  if (M === C) return true
  if (!isUnder(M, C)) return false
  if (!gitRoots.has(C)) { if (hasGit(C)) gitRoots.add(C); else return false }
  return true
}
