/**
 * COGNITREE — blobStore (Content-Addressable Storage)
 *
 * Stores file content by SHA-256 hash with gzip compression.
 * Automatic deduplication: identical content is stored once regardless
 * of how many checkpoints reference it.
 *
 * Layout:
 *   .cognitree/blobs/<first2>/<sha256hex>.gz
 *
 * Fan-out by first 2 hex chars prevents single-directory bottleneck
 * (max 256 subdirectories).
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as zlib from 'zlib'

const BLOBS_DIR = 'blobs'

// ═══════════════════════════════════════════════════════════════════════
// HASHING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute SHA-256 hex digest of raw content.
 */
export function hashContent(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

// ═══════════════════════════════════════════════════════════════════════
// BLOB PATHS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the directory for a blob hash (fan-out by first 2 chars).
 */
function blobDir(cognitreeDir: string, hash: string): string {
  return path.join(cognitreeDir, BLOBS_DIR, hash.slice(0, 2))
}

/**
 * Get the full path for a blob file.
 */
function blobPath(cognitreeDir: string, hash: string): string {
  return path.join(blobDir(cognitreeDir, hash), `${hash}.gz`)
}

// ═══════════════════════════════════════════════════════════════════════
// READ / WRITE / CHECK
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if a blob exists in the store.
 */
export function hasBlob(cognitreeDir: string, hash: string): boolean {
  return fs.existsSync(blobPath(cognitreeDir, hash))
}

/**
 * Write content to the blob store.
 * - Computes SHA-256 hash
 * - gzip-compresses the content
 * - Writes to blobs/<first2>/<hash>.gz
 * - Skips write if blob already exists (deduplication)
 *
 * @returns The SHA-256 hash of the content
 */
export function writeBlob(cognitreeDir: string, content: Buffer): string {
  const hash = hashContent(content)

  // Dedup: skip if already stored
  const dest = blobPath(cognitreeDir, hash)
  if (fs.existsSync(dest)) return hash

  // Create fan-out directory
  const dir = blobDir(cognitreeDir, hash)
  fs.mkdirSync(dir, { recursive: true })

  // Compress and write
  const compressed = zlib.gzipSync(content)
  fs.writeFileSync(dest, compressed)

  return hash
}

/**
 * Read a blob from the store.
 * - Reads the gzipped file
 * - Decompresses to raw content
 *
 * @returns Raw file content, or null if blob is missing
 */
export function readBlob(cognitreeDir: string, hash: string): Buffer | null {
  const src = blobPath(cognitreeDir, hash)
  try {
    const compressed = fs.readFileSync(src)
    return zlib.gunzipSync(compressed)
  } catch {
    return null
  }
}

/**
 * Delete a blob from the store (used by garbage collector).
 */
export function deleteBlob(cognitreeDir: string, hash: string): void {
  const src = blobPath(cognitreeDir, hash)
  try {
    fs.rmSync(src, { force: true })

    // Clean up empty fan-out directory
    const dir = blobDir(cognitreeDir, hash)
    try {
      const remaining = fs.readdirSync(dir)
      if (remaining.length === 0) fs.rmdirSync(dir)
    } catch { /* ignore */ }
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════
// DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════

/**
 * List all blob hashes in the store.
 */
export function listAllBlobHashes(cognitreeDir: string): Set<string> {
  const hashes = new Set<string>()
  const blobsRoot = path.join(cognitreeDir, BLOBS_DIR)

  if (!fs.existsSync(blobsRoot)) return hashes

  try {
    for (const fanout of fs.readdirSync(blobsRoot)) {
      const fanoutDir = path.join(blobsRoot, fanout)
      if (!fs.statSync(fanoutDir).isDirectory()) continue

      for (const file of fs.readdirSync(fanoutDir)) {
        // Remove .gz extension to get hash
        if (file.endsWith('.gz')) {
          hashes.add(file.slice(0, -3))
        }
      }
    }
  } catch { /* ignore */ }

  return hashes
}

/**
 * Get total bytes used by all blobs on disk (compressed size).
 */
export function getBlobStoreSizeBytes(cognitreeDir: string): number {
  let total = 0
  const blobsRoot = path.join(cognitreeDir, BLOBS_DIR)

  if (!fs.existsSync(blobsRoot)) return 0

  try {
    for (const fanout of fs.readdirSync(blobsRoot)) {
      const fanoutDir = path.join(blobsRoot, fanout)
      if (!fs.statSync(fanoutDir).isDirectory()) continue

      for (const file of fs.readdirSync(fanoutDir)) {
        try {
          total += fs.statSync(path.join(fanoutDir, file)).size
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  return total
}
