/**
 * COGNITREE — treeScanner (Codebase Tracker)
 *
 * Scans the project source tree and computes file diffs between sessions.
 * Zero AI calls. Zero tokens spent. Pure filesystem I/O.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export type FileEntry = {
  path: string      // relative to project root, always forward-slash
  hash: string      // md5 hex of file content (change detection)
  size: number      // bytes
  modified: number  // unix timestamp ms
}

export type SourceTree = {
  scanned_at: number  // Date.now()
  root: string        // absolute project root
  files: FileEntry[]  // sorted by path
}

export type TreeDiff = {
  added: string[]
  modified: string[]
  deleted: string[]
  scanned_at: number  // timestamp of the curr scan
}

// ═══════════════════════════════════════════════════════════════════════
// IGNORE RULES
// ═══════════════════════════════════════════════════════════════════════

/** Directories to always skip (exact name match) */
export const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.cognitree',
  'coverage', '.cache', 'tmp_check', '.bun', 'out',
])

/** Source file extensions to include */
export const INCLUDE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs',
  '.json', '.md', '.yaml', '.yml', '.toml',
  '.sh', '.ps1', '.env.example',
])

/** Exact filenames to always skip */
export const IGNORE_FILES = new Set([
  'bun.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
])

// ═══════════════════════════════════════════════════════════════════════
// SCAN
// ═══════════════════════════════════════════════════════════════════════

/**
 * Walk the project directory and build a SourceTree.
 * Never throws — bad files are silently skipped.
 */
export function scanSourceTree(projectRoot: string): SourceTree {
  const files: FileEntry[] = []

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      // Skip hidden files/dirs except .env.example
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue

      const fullPath = path.join(dir, entry.name)
      const relPath = path.relative(projectRoot, fullPath).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) walk(fullPath)
        continue
      }

      if (!entry.isFile()) continue
      if (IGNORE_FILES.has(entry.name)) continue

      const ext = path.extname(entry.name)
      if (!INCLUDE_EXTENSIONS.has(ext)) continue

      try {
        const stat = fs.statSync(fullPath)
        const content = fs.readFileSync(fullPath)
        const hash = crypto.createHash('md5').update(content).digest('hex')
        files.push({
          path: relPath,
          hash,
          size: stat.size,
          modified: Math.floor(stat.mtimeMs),
        })
      } catch {
        continue
      }
    }
  }

  walk(projectRoot)
  files.sort((a, b) => a.path.localeCompare(b.path))

  return {
    scanned_at: Date.now(),
    root: projectRoot,
    files,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DIFF
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute the diff between two SourceTree snapshots.
 * Added   — in curr but not in prev
 * Modified — in both but hash changed
 * Deleted — in prev but not in curr
 */
export function diffTrees(prev: SourceTree, curr: SourceTree): TreeDiff {
  const prevMap = new Map(prev.files.map(f => [f.path, f]))
  const currMap = new Map(curr.files.map(f => [f.path, f]))

  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []

  for (const [p, f] of currMap) {
    const old = prevMap.get(p)
    if (!old) {
      added.push(p)
    } else if (old.hash !== f.hash) {
      modified.push(p)
    }
  }

  for (const p of prevMap.keys()) {
    if (!currMap.has(p)) deleted.push(p)
  }

  return { added, modified, deleted, scanned_at: curr.scanned_at }
}
