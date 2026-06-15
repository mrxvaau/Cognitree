/**
 * COGNITREE — Checkpoint Creator
 *
 * Port of cognitree_engine/src/checkpoint.js
 *
 * Creates checkpoint snapshots capturing the current project state.
 * Each checkpoint stores metadata + 10 layer files in a dedicated directory.
 *
 * Base checkpoints (every 5th on main, every 3rd on branches) store
 * full state snapshots. Others store deltas.
 *
 * Directory scanning builds the codebase layer — a tree of all files
 * in the project directory, excluding .git, node_modules, etc.
 */

import * as fs from 'fs'
import * as path from 'path'
import type {
  ActiveJson,
  CheckpointMeta,
  CodebaseEntry,
  CodebaseLayerData,
  TreeJson,
} from './types.js'
import { reconstruct, getActiveCheckpoint } from './reconstruct.js'

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const BASE_FREQUENCY_MAIN = 5
const BASE_FREQUENCY_BRANCH = 3

const SCAN_IGNORE = new Set([
  '.git',
  'node_modules',
  '.cognitree',
  '.next',
  '.vscode',
  'dist',
  'build',
  '.cache',
  '__pycache__',
  'coverage',
  '.nyc_output',
  '.turbo',
  '.svelte-kit',
])

const MAX_SCAN_FILES = 500

// ═══════════════════════════════════════════════════════════════════════
// ID GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate the next checkpoint ID.
 * Format: cp_NNN for main branch, cp_NNNx for branches
 * where x is the branch letter suffix.
 */
function generateCheckpointId(tree: TreeJson, branch: string): string {
  const total = tree.total_checkpoints + 1
  const num = String(total).padStart(3, '0')

  if (branch === 'main') {
    return `cp_${num}`
  }

  // Extract branch letter from branch name (e.g., 'branch-a' → 'a')
  const branchLetter = branch.split('-').pop() ?? 'a'
  return `cp_${num}${branchLetter}`
}

/**
 * Determine if this checkpoint should be a base checkpoint.
 */
function determineIsBase(depth: number, branch: string): boolean {
  if (depth === 0) return true
  const frequency = branch === 'main' ? BASE_FREQUENCY_MAIN : BASE_FREQUENCY_BRANCH
  return depth % frequency === 0
}

// ═══════════════════════════════════════════════════════════════════════
// DIRECTORY SCANNING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Recursively scan a directory for source files.
 * Returns relative paths from project root.
 */
function scanWorkingDirectory(
  projectDir: string,
  subDir: string = '',
  results: string[] = [],
): string[] {
  const absDir = subDir ? path.join(projectDir, subDir) : projectDir

  try {
    const entries = fs.readdirSync(absDir, { withFileTypes: true })

    for (const entry of entries) {
      if (results.length >= MAX_SCAN_FILES) break
      if (SCAN_IGNORE.has(entry.name)) continue
      if (entry.name.startsWith('.') && entry.name !== '.env') continue

      const relPath = subDir ? path.join(subDir, entry.name) : entry.name
      const normalized = '/' + relPath.replace(/\\/g, '/')

      if (entry.isDirectory()) {
        scanWorkingDirectory(projectDir, relPath, results)
      } else if (entry.isFile()) {
        results.push(normalized)
      }
    }
  } catch {
    // Silently skip unreadable directories
  }

  return results
}

/**
 * Compute the codebase delta between previous and current file lists.
 */
function computeCodebaseDelta(
  previousFiles: string[],
  currentFiles: string[],
  checkpointId: string,
): CodebaseLayerData {
  const prevSet = new Set(previousFiles)
  const currSet = new Set(currentFiles)

  const added: CodebaseEntry[] = []
  const deleted: CodebaseEntry[] = []

  for (const file of currentFiles) {
    if (!prevSet.has(file)) {
      added.push({ path: file, type: 'file', checkpoint: checkpointId })
    }
  }

  for (const file of previousFiles) {
    if (!currSet.has(file)) {
      deleted.push({ path: file, type: 'file', checkpoint: checkpointId })
    }
  }

  return {
    delta: true,
    added,
    deleted,
    modified: [],
    renamed: [],
    tree: null,
  }
}

/**
 * Build a full codebase tree from a file list.
 */
function buildFullTree(
  files: string[],
  checkpointId: string,
): CodebaseLayerData {
  const entries: CodebaseEntry[] = files.map(f => ({
    path: f,
    type: 'file' as const,
    checkpoint: checkpointId,
  }))

  return {
    delta: false,
    added: entries,
    deleted: [],
    modified: [],
    renamed: [],
    tree: null,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EMPTY LAYER FILES
// ═══════════════════════════════════════════════════════════════════════

function createEmptyLayers(
  cpDir: string,
  isDelta: boolean,
): void {
  const valueLayers = ['goal.json', 'next.json']
  const appendLayers = ['progress.json', 'changed.json', 'decisions.json']
  const hybridLayers = ['mistakes.json', 'blockers.json', 'warnings.json']

  for (const file of valueLayers) {
    fs.writeFileSync(
      path.join(cpDir, file),
      JSON.stringify({ delta: isDelta, value: null }, null, 2),
      'utf8',
    )
  }

  for (const file of appendLayers) {
    fs.writeFileSync(
      path.join(cpDir, file),
      JSON.stringify({ delta: isDelta, added: [] }, null, 2),
      'utf8',
    )
  }

  for (const file of hybridLayers) {
    fs.writeFileSync(
      path.join(cpDir, file),
      JSON.stringify({ delta: isDelta, added: [], updated: [] }, null, 2),
      'utf8',
    )
  }

  fs.writeFileSync(
    path.join(cpDir, 'prompt_state.json'),
    JSON.stringify({
      delta: isDelta,
      active_file: null,
      active_function: null,
      current_approach: null,
      assumptions: [],
      checkpoint: '',
    }, null, 2),
    'utf8',
  )
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN CHECKPOINT CREATION
// ═══════════════════════════════════════════════════════════════════════

export interface CreateCheckpointOptions {
  cognitreeDir: string
  projectDir: string
  prompt: string
}

export interface CheckpointResult {
  id: string
  isBase: boolean
  depth: number
  confidence: number
}

/**
 * Create a new checkpoint capturing the current project state.
 *
 * @returns CheckpointResult on success, null on failure.
 */
export function createCheckpoint(options: CreateCheckpointOptions): CheckpointResult | null {
  const { cognitreeDir, projectDir, prompt } = options

  try {
    // Read tree.json
    const treePath = path.join(cognitreeDir, 'tree.json')
    const tree = JSON.parse(fs.readFileSync(treePath, 'utf8')) as TreeJson

    // Read active.json
    const active = getActiveCheckpoint(cognitreeDir)
    if (!active) throw new Error('No active.json')

    const branch = active.branch ?? 'main'
    const parentId = active.checkpoint_id

    // Get parent's depth + confidence
    let parentDepth = -1
    let confidence = 1.0
    if (parentId && tree.checkpoints[parentId]) {
      parentDepth = tree.checkpoints[parentId].depth
      // Read parent meta for confidence
      const parentMetaPath = path.join(cognitreeDir, 'checkpoints', parentId, 'meta.json')
      if (fs.existsSync(parentMetaPath)) {
        const parentMeta = JSON.parse(fs.readFileSync(parentMetaPath, 'utf8')) as CheckpointMeta
        confidence = parentMeta.confidence
      }
    }

    const depth = parentDepth + 1
    const isBase = determineIsBase(depth, branch)
    const checkpointId = generateCheckpointId(tree, branch)

    // Create checkpoint directory
    const cpDir = path.join(cognitreeDir, 'checkpoints', checkpointId)
    fs.mkdirSync(cpDir, { recursive: true })

    // Write meta.json
    const now = new Date().toISOString()
    const meta: CheckpointMeta = {
      id: checkpointId,
      parent: parentId,
      branch,
      depth,
      is_base: isBase,
      confidence,
      prompt,
      timestamp: now,
      deleted: false,
    }
    fs.writeFileSync(path.join(cpDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

    // Create empty layer files
    createEmptyLayers(cpDir, !isBase)

    // If base checkpoint, reconstruct and store full state
    if (isBase && parentId) {
      const fullState = reconstruct(cognitreeDir, parentId)
      if (fullState) {
        // Write full state to layer files
        fs.writeFileSync(
          path.join(cpDir, 'goal.json'),
          JSON.stringify({ delta: false, value: fullState.goal }, null, 2),
          'utf8',
        )
        fs.writeFileSync(
          path.join(cpDir, 'next.json'),
          JSON.stringify({ delta: false, value: fullState.next }, null, 2),
          'utf8',
        )
        fs.writeFileSync(
          path.join(cpDir, 'progress.json'),
          JSON.stringify({ delta: false, added: fullState.progress }, null, 2),
          'utf8',
        )
        fs.writeFileSync(
          path.join(cpDir, 'changed.json'),
          JSON.stringify({ delta: false, added: fullState.changed }, null, 2),
          'utf8',
        )
        fs.writeFileSync(
          path.join(cpDir, 'decisions.json'),
          JSON.stringify({ delta: false, added: fullState.decisions }, null, 2),
          'utf8',
        )
        fs.writeFileSync(
          path.join(cpDir, 'mistakes.json'),
          JSON.stringify({ delta: false, added: fullState.mistakes, updated: [] }, null, 2),
          'utf8',
        )
        fs.writeFileSync(
          path.join(cpDir, 'blockers.json'),
          JSON.stringify({ delta: false, added: fullState.blockers, updated: [] }, null, 2),
          'utf8',
        )
        fs.writeFileSync(
          path.join(cpDir, 'warnings.json'),
          JSON.stringify({ delta: false, added: fullState.warnings, updated: [] }, null, 2),
          'utf8',
        )
        if (fullState.prompt_state) {
          fs.writeFileSync(
            path.join(cpDir, 'prompt_state.json'),
            JSON.stringify({ delta: false, ...fullState.prompt_state }, null, 2),
            'utf8',
          )
        }
      }
    }

    // Build codebase layer
    const currentFiles = scanWorkingDirectory(projectDir)
    let codebaseData: CodebaseLayerData

    if (isBase || !parentId) {
      // Full tree for base checkpoints
      codebaseData = buildFullTree(currentFiles, checkpointId)
    } else {
      // Delta for non-base — get previous files from parent codebase
      const parentCodebasePath = path.join(cognitreeDir, 'checkpoints', parentId, 'codebase.json')
      let previousFiles: string[] | null = null
      if (fs.existsSync(parentCodebasePath)) {
        try {
          const parentCb = JSON.parse(fs.readFileSync(parentCodebasePath, 'utf8')) as CodebaseLayerData
          previousFiles = (parentCb.added ?? []).map(e => e.path)
        } catch {
          // Parse failed — fall back to full tree below
        }
      }
      if (previousFiles !== null) {
        codebaseData = computeCodebaseDelta(previousFiles, currentFiles, checkpointId)
      } else {
        // No valid parent codebase — store full tree instead
        codebaseData = buildFullTree(currentFiles, checkpointId)
      }
    }

    fs.writeFileSync(
      path.join(cpDir, 'codebase.json'),
      JSON.stringify(codebaseData, null, 2),
      'utf8',
    )

    // Update tree.json
    tree.total_checkpoints = (tree.total_checkpoints ?? 0) + 1
    tree.checkpoints[checkpointId] = {
      id: checkpointId,
      parent: parentId,
      branch,
      depth,
      is_base: isBase,
      deleted: false,
      timestamp: now,
    }
    fs.writeFileSync(treePath, JSON.stringify(tree, null, 2), 'utf8')

    // Update active.json
    const activePath = path.join(cognitreeDir, 'active.json')
    const updatedActive: ActiveJson = {
      checkpoint_id: checkpointId,
      branch,
      switched_at: now,
    }
    fs.writeFileSync(activePath, JSON.stringify(updatedActive, null, 2), 'utf8')

    return { id: checkpointId, isBase, depth, confidence }
  } catch {
    return null
  }
}

export { scanWorkingDirectory, computeCodebaseDelta, buildFullTree }
