/**
 * COGNITREE CORE — Type Definitions (Phase 1)
 *
 * Exact JSON format as specified in MEMORY_REBUILD_PLAN.md.
 * Every layer uses: { delta: boolean, value: T | null }
 *
 * delta: false = full value (replace)
 * delta: true  = append to array
 */

// ═══════════════════════════════════════════════════════════════════════
// UNIVERSAL LAYER SHAPE
// ═══════════════════════════════════════════════════════════════════════

/** Universal layer shape — every layer file uses this */
export interface Layer<T> {
  delta: boolean
  value: T | null
}

// ═══════════════════════════════════════════════════════════════════════
// MISTAKE ITEM
// ═══════════════════════════════════════════════════════════════════════

export interface Mistake {
  pattern: string
  evidence: string
  hint: string
  timestamp: string
}

// ═══════════════════════════════════════════════════════════════════════
// CONCRETE LAYER TYPES
// ═══════════════════════════════════════════════════════════════════════

/** goal.json — { delta: false, value: "Fix the MCP connection" } */
export type GoalLayer = Layer<string>

/** progress.json — { delta: true, value: ["Fixed auth", "Updated config"] } */
export type ProgressLayer = Layer<string[]>

/** decisions.json — { delta: true, value: ["Use TypeScript over JS because..."] } */
export type DecisionsLayer = Layer<string[]>

/** mistakes.json — { delta: true, value: [{ pattern, evidence, hint, timestamp }] } */
export type MistakesLayer = Layer<Mistake[]>

/** changed.json — { delta: true, value: ["src/query.ts", "src/cognitree/inject.ts"] } */
export type ChangedLayer = Layer<string[]>

/** next.json — { delta: true, value: ["Fix encoding issue", "Test memory"] } */
export type NextLayer = Layer<string[]>

/** warnings.json — { delta: true, value: ["inject.md must be UTF-8"] } */
export type WarningsLayer = Layer<string[]>

// ═══════════════════════════════════════════════════════════════════════
// META
// ═══════════════════════════════════════════════════════════════════════

/** meta.json — checkpoint metadata */
export interface MetaMeta {
  checkpoint_id: string   // "cp_001"
  branch: string          // "main"
  created_at: string      // ISO timestamp
  session_model: string   // "qwen3-coder-plus"
  turn_count: number
  confidence: number      // 0.0-1.0
}

// ═══════════════════════════════════════════════════════════════════════
// CHECKPOINT DATA
// ═══════════════════════════════════════════════════════════════════════

/** Full data stored per checkpoint */
export interface CheckpointData {
  meta: MetaMeta
  goal: GoalLayer
  progress: ProgressLayer
  decisions: DecisionsLayer
  mistakes: MistakesLayer
  changed: ChangedLayer
  next: NextLayer
  warnings: WarningsLayer
}

// ═══════════════════════════════════════════════════════════════════════
// TREE STRUCTURES
// ═══════════════════════════════════════════════════════════════════════

/** Entry in the checkpoint tree */
export interface TreeEntry {
  id: string
  parent: string | null
  branch: string
  created_at: string
}

/** Root tree.json structure */
export interface TreeJson {
  project: string
  created: string
  checkpoints: Record<string, TreeEntry>
}

/** active.json — current position */
export interface ActiveJson {
  checkpoint_id: string | null
  branch: string
  switched_at: string
}

// ═══════════════════════════════════════════════════════════════════════
// LAYER NAMES
// ═══════════════════════════════════════════════════════════════════════

export const LAYER_NAMES = [
  'goal',
  'progress',
  'decisions',
  'mistakes',
  'changed',
  'next',
  'warnings',
] as const

export type LayerName = (typeof LAYER_NAMES)[number]
