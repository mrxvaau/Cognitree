/**
 * COGNITREE — State Reconstruction Engine
 *
 * Port of cognitree_engine/src/reconstruct.js
 *
 * Walks the ancestor chain from a target checkpoint back to its base,
 * loads the base state, then applies each delta sequentially to rebuild
 * the full memory state at any checkpoint.
 *
 * Algorithm:
 *   1. Build ancestor chain: target → parent → parent → ... → base
 *   2. Load base checkpoint (all 9 layer files)
 *   3. Reverse chain (base-first), apply each delta
 *   4. Return merged MemoryState
 *
 * Schema reference: cognitree_engine/cognitree_schema.md
 */

import * as fs from 'fs'
import * as path from 'path'
import type {
  ActiveJson,
  AppendItem,
  AppendLayerData,
  CheckpointMeta,
  CodebaseLayerData,
  CodebaseTreeNode,
  HybridItem,
  HybridLayerData,
  MemoryState,
  PromptStateData,
  TreeJson,
  ValueLayerData,
} from './types.js'

// ═══════════════════════════════════════════════════════════════════════
// LAYER FILE NAMES
// ═══════════════════════════════════════════════════════════════════════

const LAYER_FILES = [
  'goal.json',
  'next.json',
  'progress.json',
  'changed.json',
  'decisions.json',
  'mistakes.json',
  'blockers.json',
  'warnings.json',
  'prompt_state.json',
  'codebase.json',
] as const

// ═══════════════════════════════════════════════════════════════════════
// FILE READERS (sync — mirrors original engine behavior)
// ═══════════════════════════════════════════════════════════════════════

function readJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ANCESTOR CHAIN BUILDER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Walk parent pointers from target → base, collecting all checkpoint IDs
 * in order from target to root. Stops at null parent or base checkpoint.
 */
function getAncestorChain(
  targetId: string,
  tree: TreeJson,
): string[] {
  const chain: string[] = []
  let currentId: string | null = targetId

  while (currentId) {
    const entry = tree.checkpoints[currentId]
    if (!entry) break
    chain.push(currentId)
    if (entry.is_base) break
    currentId = entry.parent
  }

  return chain
}

// ═══════════════════════════════════════════════════════════════════════
// BASE STATE LOADER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Load all 9 layer files from a checkpoint directory.
 * For base checkpoints, the files contain full state (delta: false).
 */
function loadCheckpointLayers(
  cognitreeDir: string,
  checkpointId: string,
): {
  meta: CheckpointMeta | null
  goal: ValueLayerData | null
  next: ValueLayerData | null
  progress: AppendLayerData | null
  changed: AppendLayerData | null
  decisions: AppendLayerData | null
  mistakes: HybridLayerData | null
  blockers: HybridLayerData | null
  warnings: HybridLayerData | null
  prompt_state: PromptStateData | null
  codebase: CodebaseLayerData | null
} {
  const cpDir = path.join(cognitreeDir, 'checkpoints', checkpointId)
  return {
    meta: readJson<CheckpointMeta>(path.join(cpDir, 'meta.json')),
    goal: readJson<ValueLayerData>(path.join(cpDir, 'goal.json')),
    next: readJson<ValueLayerData>(path.join(cpDir, 'next.json')),
    progress: readJson<AppendLayerData>(path.join(cpDir, 'progress.json')),
    changed: readJson<AppendLayerData>(path.join(cpDir, 'changed.json')),
    decisions: readJson<AppendLayerData>(path.join(cpDir, 'decisions.json')),
    mistakes: readJson<HybridLayerData>(path.join(cpDir, 'mistakes.json')),
    blockers: readJson<HybridLayerData>(path.join(cpDir, 'blockers.json')),
    warnings: readJson<HybridLayerData>(path.join(cpDir, 'warnings.json')),
    prompt_state: readJson<PromptStateData>(path.join(cpDir, 'prompt_state.json')),
    codebase: readJson<CodebaseLayerData>(path.join(cpDir, 'codebase.json')),
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DELTA APPLICATION
// ═══════════════════════════════════════════════════════════════════════

/** Apply a value layer delta — simple replacement */
function applyValueDelta(
  current: string | null,
  delta: ValueLayerData | null,
): string | null {
  if (!delta || delta.delta === false) {
    return delta?.value ?? current
  }
  // Delta with value set → replace; value null with delta true → keep current
  return delta.value !== null && delta.value !== undefined
    ? delta.value
    : current
}

/** Apply an append-only layer delta — merge added items */
function applyAppendDelta(
  current: AppendItem[],
  delta: AppendLayerData | null,
): AppendItem[] {
  if (!delta) return current
  if (!delta.delta) {
    // Full state — not a delta, replace entirely
    return delta.added ?? []
  }
  // Delta — append new items
  const added = delta.added ?? []
  return [...current, ...added]
}

/** Apply a hybrid layer delta — merge added items + apply status updates */
function applyHybridDelta(
  current: HybridItem[],
  delta: HybridLayerData | null,
): HybridItem[] {
  if (!delta) return current
  if (!delta.delta) {
    // Full state
    return delta.added ?? []
  }

  // Start with current state
  const result = [...current]

  // Add new items
  const added = delta.added ?? []
  result.push(...added)

  // Apply status updates
  const updated = delta.updated ?? []
  for (const update of updated) {
    const item = result.find(i => i.id === update.id)
    if (item) {
      item.status = update.status
    }
  }

  return result
}

/** Apply a prompt_state layer — always full replacement when present */
function applyPromptStateDelta(
  current: Omit<PromptStateData, 'delta'> | null,
  delta: PromptStateData | null,
): Omit<PromptStateData, 'delta'> | null {
  if (!delta) return current
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { delta: _isDelta, ...state } = delta
  return state
}

/** Apply codebase tree delta — add/delete/rename entries in tree */
function applyCodebaseDelta(
  current: CodebaseTreeNode | null,
  delta: CodebaseLayerData | null,
): CodebaseTreeNode | null {
  if (!delta) return current
  if (!delta.delta && delta.tree) {
    // Full tree — replace
    return delta.tree
  }

  // If we have a full tree in the delta, use it
  if (delta.tree) return delta.tree

  // If delta is empty, keep current
  if (
    (!delta.added || delta.added.length === 0) &&
    (!delta.deleted || delta.deleted.length === 0) &&
    (!delta.modified || delta.modified.length === 0) &&
    (!delta.renamed || delta.renamed.length === 0)
  ) {
    return current
  }

  // Apply add/delete operations to existing tree
  // For simplicity, we track added files as leaf nodes
  if (!current) {
    current = { type: 'directory', root: '.', children: [] }
  }

  // Add entries
  for (const entry of delta.added ?? []) {
    if (!current.children) current.children = []
    current.children.push({
      path: entry.path,
      type: entry.type,
      added_at: entry.checkpoint,
    })
  }

  // Mark deleted entries
  for (const entry of delta.deleted ?? []) {
    const node = findTreeNode(current, entry.path)
    if (node) {
      node.deleted = true
      node.deleted_at = entry.checkpoint
    }
  }

  return current
}

/** Find a node in the codebase tree by path */
function findTreeNode(
  tree: CodebaseTreeNode,
  targetPath: string,
): CodebaseTreeNode | null {
  if (tree.path === targetPath) return tree
  for (const child of tree.children ?? []) {
    const found = findTreeNode(child, targetPath)
    if (found) return found
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reconstruct the full memory state at a given checkpoint.
 *
 * @param cognitreeDir - Path to .cognitree/ directory
 * @param targetId - Checkpoint ID to reconstruct at
 * @returns Full MemoryState or null on failure
 */
export function reconstruct(
  cognitreeDir: string,
  targetId: string,
): MemoryState | null {
  try {
    const tree = readJson<TreeJson>(path.join(cognitreeDir, 'tree.json'))
    if (!tree) return null

    // Build ancestor chain (target → base)
    const chain = getAncestorChain(targetId, tree)
    if (chain.length === 0) return null

    // Reverse to base-first order
    chain.reverse()

    // Initialize empty state
    const state: MemoryState = {
      goal: null,
      progress: [],
      mistakes: [],
      blockers: [],
      next: null,
      changed: [],
      decisions: [],
      warnings: [],
      prompt_state: null,
      codebase: null,
      meta: null,
    }

    // Apply each checkpoint's layers in order
    for (const cpId of chain) {
      const layers = loadCheckpointLayers(cognitreeDir, cpId)

      state.goal = applyValueDelta(state.goal, layers.goal)
      state.next = applyValueDelta(state.next, layers.next)
      state.progress = applyAppendDelta(state.progress, layers.progress)
      state.changed = applyAppendDelta(state.changed, layers.changed)
      state.decisions = applyAppendDelta(state.decisions, layers.decisions)
      state.mistakes = applyHybridDelta(state.mistakes, layers.mistakes)
      state.blockers = applyHybridDelta(state.blockers, layers.blockers)
      state.warnings = applyHybridDelta(state.warnings, layers.warnings)
      state.prompt_state = applyPromptStateDelta(state.prompt_state, layers.prompt_state)
      state.codebase = applyCodebaseDelta(state.codebase, layers.codebase)
      state.meta = layers.meta
    }

    return state
  } catch {
    return null
  }
}

/**
 * Get the active checkpoint ID from active.json.
 */
export function getActiveCheckpoint(cognitreeDir: string): ActiveJson | null {
  return readJson<ActiveJson>(path.join(cognitreeDir, 'active.json'))
}

/**
 * Convenience: reconstruct at the active checkpoint.
 */
export function reconstructActive(cognitreeDir: string): MemoryState | null {
  const active = getActiveCheckpoint(cognitreeDir)
  if (!active?.checkpoint_id) return null
  return reconstruct(cognitreeDir, active.checkpoint_id)
}

export { readJson, getAncestorChain, LAYER_FILES }
