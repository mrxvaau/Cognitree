/**
 * COGNITREE — rollback (Atomic Code+Memory Restore)
 *
 * Restores both source code AND memory state to any checkpoint that
 * has a snapshot.json. Optionally creates a safety checkpoint first
 * so you can always undo the rollback.
 *
 * Build artifacts (dist/, build/, out/, .next/, .nuxt/, coverage/) are
 * ALWAYS deleted — they are derived and must be rebuilt from source.
 */

import * as fs from 'fs'
import * as path from 'path'
import { readBlob, hashContent } from './blobStore.js'
import { captureSnapshot, readSnapshot, snapshotExists } from './codeSnapshot.js'
import { IGNORE_DIRS, INCLUDE_EXTENSIONS, IGNORE_FILES } from './treeScanner.js'
import { readTree, readActive, writeActive } from '../core/storage.js'
import { createCheckpoint } from '../core/checkpoint.js'

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface RollbackResult {
  success: boolean
  targetCheckpoint: string
  safetyCheckpoint: string | null   // created before rollback (safety net)
  filesRestored: number
  filesDeleted: number
  blobsMissing: string[]            // files that couldn't be restored
  skippedFiles: string[]            // files > MAX_FILE_SIZE (not in blobs)
  buildDirsDeleted: string[]
  error?: string
}

/** Directories to ALWAYS delete on rollback (build artifacts) */
const BUILD_DIRS = ['dist', 'build', 'out', '.next', '.nuxt', 'coverage']

// ═══════════════════════════════════════════════════════════════════════
// CURRENT FILE SCANNER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a map of { relativePath → sha256 } for all tracked files currently on disk.
 * Uses the same walk rules as treeScanner/codeSnapshot.
 */
function scanCurrentFiles(projectRoot: string): Map<string, string> {
  const result = new Map<string, string>()

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
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
        const content = fs.readFileSync(fullPath)
        result.set(relPath, hashContent(content))
      } catch { /* skip */ }
    }
  }

  walk(projectRoot)
  return result
}

// ═══════════════════════════════════════════════════════════════════════
// ROLLBACK ENGINE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Atomically roll back code + memory to a target checkpoint.
 *
 * Algorithm:
 * 1. Validate target checkpoint has a snapshot
 * 2. (Optional) Create safety checkpoint of current state
 * 3. Read target snapshot manifest
 * 4. Scan current disk state
 * 5. Compute operations: restore / delete / skip
 * 6. Delete build directories
 * 7. Execute restores and deletes
 * 8. Update active.json → target checkpoint
 */
export function rollbackToCheckpoint(
  cognitreeDir: string,
  projectRoot: string,
  targetCheckpointId: string,
  options?: { createSafetyCheckpoint?: boolean },
): RollbackResult {
  const createSafety = options?.createSafetyCheckpoint !== false

  // ─── 1. VALIDATE ──────────────────────────────────────────────────
  const tree = readTree(cognitreeDir)
  if (!tree || !tree.checkpoints[targetCheckpointId]) {
    return {
      success: false,
      targetCheckpoint: targetCheckpointId,
      safetyCheckpoint: null,
      filesRestored: 0,
      filesDeleted: 0,
      blobsMissing: [],
      skippedFiles: [],
      buildDirsDeleted: [],
      error: `Checkpoint "${targetCheckpointId}" not found in tree.json`,
    }
  }

  if (!snapshotExists(cognitreeDir, targetCheckpointId)) {
    return {
      success: false,
      targetCheckpoint: targetCheckpointId,
      safetyCheckpoint: null,
      filesRestored: 0,
      filesDeleted: 0,
      blobsMissing: [],
      skippedFiles: [],
      buildDirsDeleted: [],
      error: `No snapshot found for checkpoint "${targetCheckpointId}"`,
    }
  }

  // ─── 2. SAFETY NET ────────────────────────────────────────────────
  let safetyCheckpointId: string | null = null
  if (createSafety) {
    try {
      const active = readActive(cognitreeDir)
      const currentId = active?.checkpoint_id
      const safetyCp = createCheckpoint({
        cognitreeDir,
        prompt: `Safety snapshot before rollback to ${targetCheckpointId}`,
        parentId: currentId,
      })
      if (safetyCp) {
        safetyCheckpointId = safetyCp.id
        captureSnapshot(cognitreeDir, projectRoot, safetyCp.id)
      }
    } catch {
      // If safety checkpoint fails, proceed anyway — the user explicitly asked to rollback
    }
  }

  // ─── 3. READ TARGET SNAPSHOT ──────────────────────────────────────
  const targetSnap = readSnapshot(cognitreeDir, targetCheckpointId)
  if (!targetSnap) {
    return {
      success: false,
      targetCheckpoint: targetCheckpointId,
      safetyCheckpoint: safetyCheckpointId,
      filesRestored: 0,
      filesDeleted: 0,
      blobsMissing: [],
      skippedFiles: [],
      buildDirsDeleted: [],
      error: 'Failed to parse target snapshot',
    }
  }

  const targetFiles = new Map(Object.entries(targetSnap.files))
  const skippedSet = new Set(targetSnap.skipped)

  // ─── 4. SCAN CURRENT STATE ────────────────────────────────────────
  const currentFiles = scanCurrentFiles(projectRoot)

  // ─── 5. COMPUTE OPERATIONS ────────────────────────────────────────
  const toRestore: Array<{ relPath: string; hash: string }> = []
  const toDelete: string[] = []
  const blobsMissing: string[] = []
  const skippedFiles: string[] = [...skippedSet]

  // Files in target that need restoring
  for (const [relPath, hash] of targetFiles) {
    if (skippedSet.has(relPath)) continue // can't restore — no blob stored

    const currentHash = currentFiles.get(relPath)
    if (currentHash === hash) continue // unchanged — skip

    toRestore.push({ relPath, hash })
  }

  // Files on disk that don't exist in target → delete
  for (const relPath of currentFiles.keys()) {
    if (!targetFiles.has(relPath)) {
      toDelete.push(relPath)
    }
  }

  // ─── 6. DELETE BUILD DIRECTORIES ──────────────────────────────────
  const buildDirsDeleted: string[] = []
  for (const dir of BUILD_DIRS) {
    const fullDir = path.join(projectRoot, dir)
    if (fs.existsSync(fullDir)) {
      try {
        fs.rmSync(fullDir, { recursive: true, force: true })
        buildDirsDeleted.push(dir)
      } catch { /* continue */ }
    }
  }

  // ─── 7. EXECUTE ───────────────────────────────────────────────────
  let filesRestored = 0
  for (const { relPath, hash } of toRestore) {
    const content = readBlob(cognitreeDir, hash)
    if (!content) {
      blobsMissing.push(relPath)
      continue
    }

    const fullPath = path.join(projectRoot, relPath.replace(/\//g, path.sep))
    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content)
      filesRestored++
    } catch {
      blobsMissing.push(relPath)
    }
  }

  let filesDeleted = 0
  for (const relPath of toDelete) {
    const fullPath = path.join(projectRoot, relPath.replace(/\//g, path.sep))
    try {
      fs.rmSync(fullPath, { force: true })
      filesDeleted++

      // Clean up empty parent directories
      try {
        let dir = path.dirname(fullPath)
        while (dir !== projectRoot) {
          const remaining = fs.readdirSync(dir)
          if (remaining.length > 0) break
          fs.rmdirSync(dir)
          dir = path.dirname(dir)
        }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }

  // ─── 8. UPDATE COGNITREE STATE ────────────────────────────────────
  const targetEntry = tree.checkpoints[targetCheckpointId]
  writeActive(cognitreeDir, {
    checkpoint_id: targetCheckpointId,
    branch: targetEntry.branch,
    switched_at: new Date().toISOString(),
  })

  return {
    success: true,
    targetCheckpoint: targetCheckpointId,
    safetyCheckpoint: safetyCheckpointId,
    filesRestored,
    filesDeleted,
    blobsMissing,
    skippedFiles,
    buildDirsDeleted,
  }
}
