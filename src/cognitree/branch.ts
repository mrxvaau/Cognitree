/**
 * COGNITREE — Branch Creator
 *
 * Port of cognitree_engine/src/branch.js
 *
 * Creates a new branch from any checkpoint in the tree.
 * Branches inherit active warnings and critical mistakes from
 * the source checkpoint, and reset confidence to 1.0.
 *
 * Branch naming: branch-a, branch-b, branch-c, ...
 * Checkpoint IDs on branches get a letter suffix: cp_NNNa, cp_NNNb
 */

import * as fs from 'fs'
import * as path from 'path'
import type {
  ActiveJson,
  CheckpointMeta,
  TreeJson,
} from './types.js'
import { reconstruct } from './reconstruct.js'

// ═══════════════════════════════════════════════════════════════════════
// BRANCH NAMING
// ═══════════════════════════════════════════════════════════════════════

const BRANCH_LETTERS = 'abcdefghijklmnopqrstuvwxyz'

/**
 * Scan existing branches to find the next available letter.
 */
function getNextBranchLetter(tree: TreeJson): string {
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

  // Fallback if all 26 letters used (very unlikely)
  return `x${Date.now()}`
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN BRANCH CREATION
// ═══════════════════════════════════════════════════════════════════════

export interface CreateBranchOptions {
  cognitreeDir: string
  projectDir: string
  forkCheckpointId: string
}

export interface BranchResult {
  branchName: string
  checkpointId: string
  inheritedWarnings: number
  inheritedMistakes: number
}

/**
 * Create a new branch from a specific checkpoint.
 *
 * Steps:
 * 1. Validate the fork checkpoint exists
 * 2. Generate branch name (branch-a, branch-b, ...)
 * 3. Reconstruct state at fork point to get warnings/mistakes
 * 4. Create a base checkpoint on the new branch
 * 5. Copy inherited warnings/mistakes to the new checkpoint
 * 6. Reset confidence to 1.0
 * 7. Update active.json to point to new branch
 *
 * @returns BranchResult on success, null on failure.
 */
export function createBranch(options: CreateBranchOptions): BranchResult | null {
  const { cognitreeDir, projectDir, forkCheckpointId } = options

  try {
    // Read tree.json
    const treePath = path.join(cognitreeDir, 'tree.json')
    const tree = JSON.parse(fs.readFileSync(treePath, 'utf8')) as TreeJson

    // Validate fork checkpoint exists
    if (!tree.checkpoints[forkCheckpointId]) {
      throw new Error(`Checkpoint "${forkCheckpointId}" not found in tree.`)
    }

    // Get next branch letter
    const letter = getNextBranchLetter(tree)
    const branchName = `branch-${letter}`

    // Reconstruct state at fork point to inherit warnings/mistakes
    const forkState = reconstruct(cognitreeDir, forkCheckpointId)

    // Filter for active warnings and critical mistakes
    const inheritedWarnings = (forkState?.warnings ?? []).filter(w => w.status !== 'resolved')
    const inheritedMistakes = (forkState?.mistakes ?? []).filter(
      m => m.status !== 'resolved' && m.severity === 'critical',
    )

    // Generate new checkpoint ID (total_checkpoints optional on legacy trees)
    const total = (tree.total_checkpoints ?? 0) + 1
    const num = String(total).padStart(3, '0')
    const checkpointId = `cp_${num}${letter}`

    // Create checkpoint directory
    const cpDir = path.join(cognitreeDir, 'checkpoints', checkpointId)
    fs.mkdirSync(cpDir, { recursive: true })

    const now = new Date().toISOString()

    // Write meta.json — confidence resets to 1.0 on new branch
    const meta: CheckpointMeta = {
      id: checkpointId,
      parent: forkCheckpointId,
      branch: branchName,
      depth: 0,
      is_base: true,  // First checkpoint on branch is always base
      confidence: 1.0,
      prompt: `Branch from ${forkCheckpointId}`,
      timestamp: now,
      deleted: false,
    }
    fs.writeFileSync(path.join(cpDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

    // Write inherited state as base (full, not delta)
    // Goal + next from fork
    fs.writeFileSync(
      path.join(cpDir, 'goal.json'),
      JSON.stringify({ delta: false, value: forkState?.goal ?? null }, null, 2),
      'utf8',
    )
    fs.writeFileSync(
      path.join(cpDir, 'next.json'),
      JSON.stringify({ delta: false, value: forkState?.next ?? null }, null, 2),
      'utf8',
    )

    // Empty progress/changed/decisions for new branch
    fs.writeFileSync(
      path.join(cpDir, 'progress.json'),
      JSON.stringify({ delta: false, added: [] }, null, 2),
      'utf8',
    )
    fs.writeFileSync(
      path.join(cpDir, 'changed.json'),
      JSON.stringify({ delta: false, added: [] }, null, 2),
      'utf8',
    )
    fs.writeFileSync(
      path.join(cpDir, 'decisions.json'),
      JSON.stringify({ delta: false, added: forkState?.decisions ?? [] }, null, 2),
      'utf8',
    )

    // Inherited warnings and mistakes
    fs.writeFileSync(
      path.join(cpDir, 'warnings.json'),
      JSON.stringify({ delta: false, added: inheritedWarnings, updated: [] }, null, 2),
      'utf8',
    )
    fs.writeFileSync(
      path.join(cpDir, 'mistakes.json'),
      JSON.stringify({ delta: false, added: inheritedMistakes, updated: [] }, null, 2),
      'utf8',
    )

    // Empty blockers
    fs.writeFileSync(
      path.join(cpDir, 'blockers.json'),
      JSON.stringify({ delta: false, added: [], updated: [] }, null, 2),
      'utf8',
    )

    // Prompt state — clean slate
    fs.writeFileSync(
      path.join(cpDir, 'prompt_state.json'),
      JSON.stringify({
        delta: false,
        active_file: null,
        active_function: null,
        current_approach: null,
        assumptions: [],
        checkpoint: checkpointId,
      }, null, 2),
      'utf8',
    )

    // Codebase from fork (carry over)
    fs.writeFileSync(
      path.join(cpDir, 'codebase.json'),
      JSON.stringify({
        delta: false,
        added: [],
        deleted: [],
        modified: [],
        renamed: [],
        tree: forkState?.codebase ?? null,
      }, null, 2),
      'utf8',
    )

    // Update tree.json
    tree.total_checkpoints = total
    tree.checkpoints[checkpointId] = {
      id: checkpointId,
      parent: forkCheckpointId,
      branch: branchName,
      depth: 0,
      is_base: true,
      deleted: false,
      timestamp: now,
    }
    fs.writeFileSync(treePath, JSON.stringify(tree, null, 2), 'utf8')

    // Update active.json
    const activePath = path.join(cognitreeDir, 'active.json')
    const updatedActive: ActiveJson = {
      checkpoint_id: checkpointId,
      branch: branchName,
      switched_at: now,
    }
    fs.writeFileSync(activePath, JSON.stringify(updatedActive, null, 2), 'utf8')

    return {
      branchName,
      checkpointId,
      inheritedWarnings: inheritedWarnings.length,
      inheritedMistakes: inheritedMistakes.length,
    }
  } catch {
    return null
  }
}
