/**
 * COGNITREE CORE — Storage Layer (Phase 1)
 *
 * Read/write .cognitree/ JSON files.
 *
 * Rules (from MEMORY_REBUILD_PLAN.md):
 * - Storage layer must never throw — always return null on read failure
 * - JSON format is FIXED: always { "delta": boolean, "value": T | null }
 * - Creates checkpoint directory if missing
 * - Never overwrites existing checkpoint directory
 */

import * as fs from 'fs'
import * as path from 'path'
import type { Layer, MetaMeta, TreeJson, ActiveJson, TreeEntry } from './types.js'

// ═══════════════════════════════════════════════════════════════════════
// LAYER READ/WRITE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read a layer JSON file.
 * Returns null if file is missing or JSON is invalid — never throws.
 */
export function readLayer<T>(filePath: string): Layer<T> | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    // Validate shape: must have delta (boolean) and value
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)['delta'] !== 'boolean' ||
      !('value' in (parsed as Record<string, unknown>))
    ) {
      return null
    }
    return parsed as Layer<T>
  } catch {
    return null
  }
}

/**
 * Write a layer JSON file.
 * Enforces { delta, value } shape — throws if shape is wrong.
 * Creates parent directory if needed.
 */
export function writeLayer<T>(filePath: string, layer: Layer<T>): void {
  // Validate shape before writing
  if (
    typeof layer !== 'object' ||
    layer === null ||
    typeof layer.delta !== 'boolean' ||
    !('value' in layer)
  ) {
    throw new Error(
      `Invalid layer shape for ${filePath}: must be { delta: boolean, value: T | null }`,
    )
  }

  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(layer, null, 2), 'utf8')
}

// ═══════════════════════════════════════════════════════════════════════
// CHECKPOINT DIRECTORY
// ═══════════════════════════════════════════════════════════════════════

/**
 * Returns the path to a checkpoint's directory.
 */
export function checkpointDir(cognitreeDir: string, checkpointId: string): string {
  return path.join(cognitreeDir, 'checkpoints', checkpointId)
}

/**
 * Create a checkpoint directory.
 * Throws if directory already exists (never overwrites).
 */
export function createCheckpointDir(cognitreeDir: string, checkpointId: string): string {
  const cpDir = checkpointDir(cognitreeDir, checkpointId)
  if (fs.existsSync(cpDir)) {
    throw new Error(`Checkpoint directory already exists: ${cpDir}`)
  }
  fs.mkdirSync(cpDir, { recursive: true })
  return cpDir
}

// ═══════════════════════════════════════════════════════════════════════
// META.JSON
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read meta.json from a checkpoint directory.
 * Returns null on failure — never throws.
 */
export function readMeta(cognitreeDir: string, checkpointId: string): MetaMeta | null {
  const metaPath = path.join(checkpointDir(cognitreeDir, checkpointId), 'meta.json')
  try {
    const raw = fs.readFileSync(metaPath, 'utf8')
    return JSON.parse(raw) as MetaMeta
  } catch {
    return null
  }
}

/**
 * Write meta.json to a checkpoint directory.
 */
export function writeMeta(cognitreeDir: string, checkpointId: string, meta: MetaMeta): void {
  const metaPath = path.join(checkpointDir(cognitreeDir, checkpointId), 'meta.json')
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
}

// ═══════════════════════════════════════════════════════════════════════
// TREE.JSON
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read tree.json from cognitree directory.
 * Returns null on failure — never throws.
 */
export function readTree(cognitreeDir: string): TreeJson | null {
  const treePath = path.join(cognitreeDir, 'tree.json')
  try {
    const raw = fs.readFileSync(treePath, 'utf8')
    return JSON.parse(raw) as TreeJson
  } catch {
    return null
  }
}

/**
 * Write tree.json to cognitree directory.
 */
export function writeTree(cognitreeDir: string, tree: TreeJson): void {
  const treePath = path.join(cognitreeDir, 'tree.json')
  fs.writeFileSync(treePath, JSON.stringify(tree, null, 2), 'utf8')
}

/**
 * Add a checkpoint entry to tree.json (mutates the tree object and persists).
 */
export function addCheckpointToTree(
  cognitreeDir: string,
  entry: TreeEntry,
): void {
  const tree = readTree(cognitreeDir)
  if (!tree) {
    throw new Error('tree.json not found or invalid')
  }
  tree.checkpoints[entry.id] = entry
  writeTree(cognitreeDir, tree)
}

// ═══════════════════════════════════════════════════════════════════════
// ACTIVE.JSON
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read active.json.
 * Returns null on failure — never throws.
 */
export function readActive(cognitreeDir: string): ActiveJson | null {
  const activePath = path.join(cognitreeDir, 'active.json')
  try {
    const raw = fs.readFileSync(activePath, 'utf8')
    return JSON.parse(raw) as ActiveJson
  } catch {
    return null
  }
}

/**
 * Write active.json.
 */
export function writeActive(cognitreeDir: string, active: ActiveJson): void {
  const activePath = path.join(cognitreeDir, 'active.json')
  fs.writeFileSync(activePath, JSON.stringify(active, null, 2), 'utf8')
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Initialize a fresh .cognitree/ directory with tree.json and active.json.
 * Used in tests and for new project setup.
 */
export function initCognitreeDir(cognitreeDir: string, projectName: string): void {
  fs.mkdirSync(path.join(cognitreeDir, 'checkpoints'), { recursive: true })

  const now = new Date().toISOString()

  const tree: TreeJson = {
    project: projectName,
    created: now,
    checkpoints: {},
  }
  writeTree(cognitreeDir, tree)

  const active: ActiveJson = {
    checkpoint_id: null,
    branch: 'main',
    switched_at: now,
  }
  writeActive(cognitreeDir, active)
}
