/**
 * COGNITREE — blobGC (Garbage Collector)
 *
 * Removes blobs from the store that are no longer referenced by any
 * checkpoint snapshot. Safe to run at any time.
 */

import * as fs from 'fs'
import * as path from 'path'
import { listAllBlobHashes, deleteBlob, getBlobStoreSizeBytes } from './blobStore.js'
import { readSnapshot } from './codeSnapshot.js'

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface GCResult {
  blobsScanned: number
  blobsOrphaned: number
  bytesFreed: number
}

// ═══════════════════════════════════════════════════════════════════════
// COLLECT GARBAGE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Scan all checkpoint snapshots, find blobs that are not referenced by
 * any checkpoint, and delete them.
 *
 * Algorithm:
 * 1. Walk all checkpoint directories, read each snapshot.json
 * 2. Collect union of all referenced hashes
 * 3. Walk blobs/ directory to find all stored hashes
 * 4. Any stored hash NOT in the referenced set → delete
 */
export function collectGarbage(cognitreeDir: string): GCResult {
  const sizeBefore = getBlobStoreSizeBytes(cognitreeDir)

  // 1. Collect all referenced hashes from all checkpoints
  const referencedHashes = new Set<string>()
  const cpRoot = path.join(cognitreeDir, 'checkpoints')

  if (fs.existsSync(cpRoot)) {
    try {
      for (const cpDir of fs.readdirSync(cpRoot)) {
        const snap = readSnapshot(cognitreeDir, cpDir)
        if (!snap) continue

        for (const hash of Object.values(snap.files)) {
          referencedHashes.add(hash)
        }
      }
    } catch { /* ignore */ }
  }

  // 2. Get all stored blobs
  const storedHashes = listAllBlobHashes(cognitreeDir)
  const blobsScanned = storedHashes.size

  // 3. Find and delete orphaned blobs
  let blobsOrphaned = 0
  for (const hash of storedHashes) {
    if (!referencedHashes.has(hash)) {
      deleteBlob(cognitreeDir, hash)
      blobsOrphaned++
    }
  }

  const sizeAfter = getBlobStoreSizeBytes(cognitreeDir)
  const bytesFreed = Math.max(0, sizeBefore - sizeAfter)

  return { blobsScanned, blobsOrphaned, bytesFreed }
}
