/**
 * COGNITREE — codeSnapshot (Full Code State Capture)
 *
 * Captures a complete manifest of every tracked source file at a checkpoint,
 * storing file content in the blob store for later restoration.
 *
 * Stored as: checkpoints/cp_NNN/snapshot.json
 *
 * Uses the same IGNORE_DIRS / INCLUDE_EXTENSIONS rules as treeScanner
 * so the snapshot covers exactly the same files as the diff tracker.
 */

import * as fs from 'fs'
import * as path from 'path'
import { writeBlob, hashContent, hasBlob, getBlobStoreSizeBytes } from './blobStore.js'
import { IGNORE_DIRS, INCLUDE_EXTENSIONS, IGNORE_FILES } from './treeScanner.js'

const SNAPSHOT_FILE = 'snapshot.json'

/** Maximum file size to store in blobs (5MB). Larger files are tracked but not stored. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface SnapshotManifest {
  version: 1
  checkpoint_id: string
  scanned_at: number            // Date.now()
  file_count: number            // total tracked files
  blob_count: number            // unique blobs written this capture (deduped)
  total_size: number            // sum of raw file sizes (bytes)
  compressed_size: number       // sum of compressed blob sizes on disk
  files: Record<string, string> // { relative_path: sha256_hash }
  skipped: string[]             // files > MAX_FILE_SIZE (tracked but not stored)
}

// ═══════════════════════════════════════════════════════════════════════
// CAPTURE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Walk the project tree and store every tracked file in the blob store.
 * Writes snapshot.json to the checkpoint directory.
 *
 * @returns The snapshot manifest
 */
export function captureSnapshot(
  cognitreeDir: string,
  projectRoot: string,
  checkpointId: string,
): SnapshotManifest {
  const files: Record<string, string> = {}
  const skipped: string[] = []
  let totalSize = 0
  let newBlobs = 0

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
        const content = fs.readFileSync(fullPath)
        totalSize += content.length

        if (content.length > MAX_FILE_SIZE) {
          // Track path + hash but don't store content
          files[relPath] = hashContent(content)
          skipped.push(relPath)
          continue
        }

        // Check if blob already exists before writing (to count new blobs)
        const hash = hashContent(content)
        const alreadyExists = hasBlob(cognitreeDir, hash)

        writeBlob(cognitreeDir, content)
        files[relPath] = hash

        if (!alreadyExists) newBlobs++
      } catch {
        continue
      }
    }
  }

  walk(projectRoot)

  const compressedSize = getBlobStoreSizeBytes(cognitreeDir)

  const manifest: SnapshotManifest = {
    version: 1,
    checkpoint_id: checkpointId,
    scanned_at: Date.now(),
    file_count: Object.keys(files).length,
    blob_count: newBlobs,
    total_size: totalSize,
    compressed_size: compressedSize,
    files,
    skipped,
  }

  // Write snapshot.json to checkpoint directory
  const snapshotPath = path.join(
    cognitreeDir, 'checkpoints', checkpointId, SNAPSHOT_FILE,
  )
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
  fs.writeFileSync(snapshotPath, JSON.stringify(manifest, null, 2), 'utf8')

  return manifest
}

// ═══════════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read a snapshot manifest from a checkpoint directory.
 * Returns null if not present — never throws.
 */
export function readSnapshot(
  cognitreeDir: string,
  checkpointId: string,
): SnapshotManifest | null {
  const snapshotPath = path.join(
    cognitreeDir, 'checkpoints', checkpointId, SNAPSHOT_FILE,
  )
  try {
    const raw = fs.readFileSync(snapshotPath, 'utf8')
    return JSON.parse(raw) as SnapshotManifest
  } catch {
    return null
  }
}

/**
 * Check if a snapshot exists for a checkpoint.
 */
export function snapshotExists(
  cognitreeDir: string,
  checkpointId: string,
): boolean {
  const snapshotPath = path.join(
    cognitreeDir, 'checkpoints', checkpointId, SNAPSHOT_FILE,
  )
  return fs.existsSync(snapshotPath)
}
