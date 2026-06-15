/**
 * COGNITREE CORE — Branch Manager (Phase 1)
 *
 * Create branches from existing checkpoints.
 *
 * Branch rules:
 * - Named branch-a, branch-b, branch-c, ... (sequential letters)
 * - First checkpoint on a branch is always a base checkpoint
 * - Inherits active warnings from fork checkpoint
 * - Confidence resets to 1.0 on new branch
 * - Checkpoint IDs get branch letter suffix: cp_NNNa, cp_NNNb
 */

import * as path from 'path'
import type { MetaMeta, TreeEntry, ActiveJson, Layer } from './types.js'
import {
  readTree,
  writeTree,
  readActive,
  writeActive,
  readMeta,
  writeMeta,
  readLayer,
  writeLayer,
  createCheckpointDir,
  checkpointDir,
} from './storage.js'

// ═══════════════════════════════════════════════════════════════════════
// BRANCH NAMING
// ═══════════════════════════════════════════════════════════════════════

const BRANCH_LETTERS = 'abcdefghijklmnopqrstuvwxyz'

/**
 * Scan existing branches to find the next available letter.
 */
function getNextBranchLetter(cognitreeDir: string): string {
  const tree = readTree(cognitreeDir)
  if (!tree) return 'a'

  const existingBranches = new Set<string>()
  for (const entry of Object.values(tree.checkpoints)) {
    if (entry.branch && entry.branch !== 'main') {
      existingBranches.add(entry.branch)
    }
  }

  for (const letter of BRANCH_LETTERS) {
    const branchName = `branch-${letter}`
    if (!existingBranches.has(branchName)) {
      return letter
    }
  }

  // Fallback — all 26 letters used
  return `x${Date.now()}`
}

// ═══════════════════════════════════════════════════════════════════════
// CREATE BRANCH
// ═══════════════════════════════════════════════════════════════════════

export interface CreateBranchOptions {
  cognitreeDir: string
  forkCheckpointId: string
  sessionModel?: string
}

export interface BranchResult {
  branchName: string
  checkpointId: string
  inheritedWarnings: number
}

/**
 * Create a new branch from a specific checkpoint.
 *
 * Steps:
 * 1. Validate the fork checkpoint exists in tree.json
 * 2. Generate branch name (branch-a, branch-b, ...)
 * 3. Read fork checkpoint's warnings to inherit
 * 4. Generate new checkpoint ID with branch letter suffix
 * 5. Create checkpoint directory
 * 6. Write meta.json (confidence = 1.0)
 * 7. Inherit warnings from fork; empty other layers
 * 8. Update tree.json + active.json
 *
 * @returns BranchResult on success, null on failure
 */
export function createBranch(options: CreateBranchOptions): BranchResult | null {
  const { cognitreeDir, forkCheckpointId } = options

  try {
    const tree = readTree(cognitreeDir)
    if (!tree) throw new Error('tree.json not found')

    // Validate fork checkpoint exists
    if (!tree.checkpoints[forkCheckpointId]) {
      throw new Error(`Fork checkpoint "${forkCheckpointId}" not found in tree.json`)
    }

    const letter = getNextBranchLetter(cognitreeDir)
    const branchName = `branch-${letter}`

    // Generate new checkpoint ID
    const total = Object.keys(tree.checkpoints).length + 1
    const num = String(total).padStart(3, '0')
    const checkpointId = `cp_${num}${letter}`

    const now = new Date().toISOString()

    // Create checkpoint directory
    const cpDir = createCheckpointDir(cognitreeDir, checkpointId)

    // Write meta.json — confidence resets to 1.0
    const meta: MetaMeta = {
      checkpoint_id: checkpointId,
      branch: branchName,
      created_at: now,
      session_model: options.sessionModel ?? 'unknown',
      turn_count: 0,
      confidence: 1.0,
    }
    writeMeta(cognitreeDir, checkpointId, meta)

    // Read warnings from fork checkpoint (inherit active warnings)
    const forkCpDir = checkpointDir(cognitreeDir, forkCheckpointId)
    const forkWarnings = readLayer<string[]>(path.join(forkCpDir, 'warnings.json'))
    const warningsToInherit = forkWarnings?.value ?? []

    // Write warnings (inherited from fork)
    writeLayer<string[]>(
      path.join(cpDir, 'warnings.json'),
      { delta: false, value: warningsToInherit },
    )

    // Write empty layers for everything else
    const emptyStringLayer: Layer<null> = { delta: false, value: null }
    const emptyArrayLayer: Layer<string[]> = { delta: false, value: [] }
    const emptyMistakesLayer: Layer<never[]> = { delta: false, value: [] }

    writeLayer(path.join(cpDir, 'goal.json'), emptyStringLayer)
    writeLayer(path.join(cpDir, 'next.json'), emptyStringLayer)
    writeLayer(path.join(cpDir, 'progress.json'), emptyArrayLayer)
    writeLayer(path.join(cpDir, 'decisions.json'), emptyArrayLayer)
    writeLayer(path.join(cpDir, 'changed.json'), emptyArrayLayer)
    writeLayer(path.join(cpDir, 'mistakes.json'), emptyMistakesLayer)

    // Update tree.json
    const entry: TreeEntry = {
      id: checkpointId,
      parent: forkCheckpointId,
      branch: branchName,
      created_at: now,
    }
    tree.checkpoints[checkpointId] = entry
    writeTree(cognitreeDir, tree)

    // Update active.json
    const updatedActive: ActiveJson = {
      checkpoint_id: checkpointId,
      branch: branchName,
      switched_at: now,
    }
    writeActive(cognitreeDir, updatedActive)

    return {
      branchName,
      checkpointId,
      inheritedWarnings: warningsToInherit.length,
    }
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LIST BRANCHES
// ═══════════════════════════════════════════════════════════════════════

/**
 * List all branch names in the tree (excluding 'main').
 */
export function listBranches(cognitreeDir: string): string[] {
  const tree = readTree(cognitreeDir)
  if (!tree) return []

  const branches = new Set<string>()
  for (const entry of Object.values(tree.checkpoints)) {
    if (entry.branch && entry.branch !== 'main') {
      branches.add(entry.branch)
    }
  }

  return [...branches].sort()
}
