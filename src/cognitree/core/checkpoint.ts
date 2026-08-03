/**
 * COGNITREE CORE — Checkpoint Manager (Phase 1)
 *
 * Create, load, and list checkpoints.
 *
 * Checkpoint ID format:
 *   main branch:   cp_001, cp_002, cp_003, ...
 *   other branch:  cp_001a, cp_002b, ... (letter = branch letter)
 *
 * Each checkpoint stores:
 *   meta.json  + 7 layer files (goal, progress, decisions, mistakes, changed, next, warnings)
 */

import * as fs from 'fs'
import * as path from 'path'
import type { MetaMeta, TreeEntry, TreeJson, ActiveJson, LayerName } from './types.js'
import {
  readMeta,
  writeMeta,
  readTree,
  writeTree,
  readActive,
  writeActive,
  createCheckpointDir,
  checkpointDir,
  writeLayer,
} from './storage.js'

// ═══════════════════════════════════════════════════════════════════════
// ID GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Count checkpoints on a given branch in the tree.
 */
function countCheckpointsOnBranch(tree: TreeJson, branch: string): number {
  return Object.values(tree.checkpoints).filter(e => e.branch === branch).length
}

/**
 * Generate the next sequential checkpoint number across all branches.
 * Format: cp_NNN (padded to 3 digits) + optional branch letter.
 *
 * Uses max(tree count, disk count) as the floor so orphaned checkpoint
 * directories that are not registered in tree.json don't cause collisions.
 */
function generateCheckpointId(tree: TreeJson, branch: string, cognitreeDir: string): string {
  const fromTree = Object.keys(tree.checkpoints).length
  let fromDisk = 0
  try {
    const cpRoot = path.join(cognitreeDir, 'checkpoints')
    if (fs.existsSync(cpRoot)) {
      fromDisk = fs.readdirSync(cpRoot).length
    }
  } catch {}
  const total = Math.max(fromTree, fromDisk) + 1
  const num = String(total).padStart(3, '0')

  if (branch === 'main') {
    return `cp_${num}`
  }

  // Extract branch letter from branch name (e.g., 'branch-a' → 'a')
  const letter = branch.split('-').pop() ?? 'a'
  return `cp_${num}${letter}`
}

// ═══════════════════════════════════════════════════════════════════════
// EMPTY LAYERS
// ═══════════════════════════════════════════════════════════════════════

/** Write all 7 empty layer files to a checkpoint directory */
function writeEmptyLayers(cpDir: string): void {
  const stringLayers: LayerName[] = ['goal', 'next']
  const arrayLayers: LayerName[] = ['progress', 'decisions', 'changed', 'warnings']
  const mistakeLayers: LayerName[] = ['mistakes']

  for (const name of stringLayers) {
    writeLayer(path.join(cpDir, `${name}.json`), { delta: false, value: null })
  }
  for (const name of arrayLayers) {
    writeLayer(path.join(cpDir, `${name}.json`), { delta: false, value: [] })
  }
  for (const name of mistakeLayers) {
    writeLayer(path.join(cpDir, `${name}.json`), { delta: false, value: [] })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CREATE CHECKPOINT
// ═══════════════════════════════════════════════════════════════════════

export interface CreateCheckpointOptions {
  cognitreeDir: string
  prompt: string
  branch?: string
  parentId?: string | null
  sessionModel?: string
}

export interface CheckpointResult {
  id: string
  branch: string
  parentId: string | null
  created_at: string
}

/**
 * Create a new checkpoint.
 *
 * Steps:
 * 1. Read tree.json + active.json
 * 2. Generate ID
 * 3. Create directory (throws if already exists)
 * 4. Write meta.json
 * 5. Write empty layer files
 * 6. Update tree.json + active.json
 *
 * @returns CheckpointResult on success, null on failure
 */
export function createCheckpoint(options: CreateCheckpointOptions): CheckpointResult | null {
  const { cognitreeDir, prompt } = options

  try {
    const tree = readTree(cognitreeDir)
    if (!tree) throw new Error('tree.json not found')

    const active = readActive(cognitreeDir)
    const branch = options.branch ?? active?.branch ?? 'main'
    const parentId = options.parentId !== undefined
      ? options.parentId
      : (active?.checkpoint_id ?? null)

    const checkpointId = generateCheckpointId(tree, branch, cognitreeDir)
    const now = new Date().toISOString()

    // Create directory — throws if it already exists
    const cpDir = createCheckpointDir(cognitreeDir, checkpointId)

    // Write meta.json
    const meta: MetaMeta = {
      checkpoint_id: checkpointId,
      branch,
      created_at: now,
      session_model: options.sessionModel ?? 'unknown',
      turn_count: 0,
      confidence: 1.0,
    }
    writeMeta(cognitreeDir, checkpointId, meta)

    // Write empty layer files
    writeEmptyLayers(cpDir)

    // Update tree.json
    const entry: TreeEntry = {
      id: checkpointId,
      parent: parentId,
      branch,
      created_at: now,
    }
    tree.checkpoints[checkpointId] = entry
    writeTree(cognitreeDir, tree)

    // Update active.json
    const updatedActive: ActiveJson = {
      checkpoint_id: checkpointId,
      branch,
      switched_at: now,
    }
    writeActive(cognitreeDir, updatedActive)

    return { id: checkpointId, branch, parentId, created_at: now }
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LOAD CHECKPOINT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Load a checkpoint's metadata by ID.
 * Returns null if not found — never throws.
 */
export function loadCheckpoint(cognitreeDir: string, checkpointId: string): MetaMeta | null {
  return readMeta(cognitreeDir, checkpointId)
}

// ═══════════════════════════════════════════════════════════════════════
// LIST CHECKPOINTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * List all checkpoints in chronological order (by created_at).
 * Returns empty array on failure — never throws.
 */
export function listCheckpoints(cognitreeDir: string): TreeEntry[] {
  try {
    const tree = readTree(cognitreeDir)
    if (!tree) return []
    const entries = Object.values(tree.checkpoints)
    entries.sort((a, b) => a.created_at.localeCompare(b.created_at))
    return entries
  } catch {
    return []
  }
}

/**
 * List all checkpoints on a specific branch, in order.
 */
export function listCheckpointsByBranch(cognitreeDir: string, branch: string): TreeEntry[] {
  return listCheckpoints(cognitreeDir).filter(e => e.branch === branch)
}

// ═══════════════════════════════════════════════════════════════════════
// GET ACTIVE CHECKPOINT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the currently active checkpoint ID.
 * Returns null if no checkpoint is active.
 */
export function getActiveCheckpointId(cognitreeDir: string): string | null {
  const active = readActive(cognitreeDir)
  return active?.checkpoint_id ?? null
}
