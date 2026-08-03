/**
 * COGNITREE — treeStorage (Codebase Tracker)
 *
 * Read/write the source tree and diff files inside .cognitree/.
 *
 * base_tree.json           — full SourceTree, written once on first session,
 *                            updated whenever the diff is non-empty
 * checkpoints/cp_NNN/
 *   codebase.json          — TreeDiff for that session (added/modified/deleted)
 */

import * as fs from 'fs'
import * as path from 'path'
import type { SourceTree, TreeDiff } from './treeScanner.js'

const BASE_TREE_FILE = 'base_tree.json'
const CODEBASE_DIFF_FILE = 'codebase.json'

// ═══════════════════════════════════════════════════════════════════════
// BASE TREE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read the full source tree snapshot from .cognitree/base_tree.json.
 * Returns null if the file is missing or invalid — never throws.
 */
export function readBaseTree(cognitreeDir: string): SourceTree | null {
  const filePath = path.join(cognitreeDir, BASE_TREE_FILE)
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as SourceTree
  } catch {
    return null
  }
}

/**
 * Write the full source tree snapshot to .cognitree/base_tree.json.
 * Creates the directory if needed.
 */
export function writeBaseTree(cognitreeDir: string, tree: SourceTree): void {
  fs.mkdirSync(cognitreeDir, { recursive: true })
  const filePath = path.join(cognitreeDir, BASE_TREE_FILE)
  fs.writeFileSync(filePath, JSON.stringify(tree, null, 2), 'utf8')
}

// ═══════════════════════════════════════════════════════════════════════
// CHECKPOINT DIFF
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read the codebase diff for a specific checkpoint.
 * Returns null if not present — never throws.
 */
export function readCheckpointDiff(
  cognitreeDir: string,
  checkpointId: string,
): TreeDiff | null {
  const filePath = path.join(cognitreeDir, 'checkpoints', checkpointId, CODEBASE_DIFF_FILE)
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as TreeDiff
  } catch {
    return null
  }
}

/**
 * Write the codebase diff for a specific checkpoint.
 * Creates the checkpoint directory if needed.
 */
export function writeCheckpointDiff(
  cognitreeDir: string,
  checkpointId: string,
  diff: TreeDiff,
): void {
  const dir = path.join(cognitreeDir, 'checkpoints', checkpointId)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, CODEBASE_DIFF_FILE)
  fs.writeFileSync(filePath, JSON.stringify(diff, null, 2), 'utf8')
}
