/**
 * COGNITREE — Type Definitions
 *
 * Central types for all .cognitree/ JSON structures, memory layers,
 * task classification, and smart injection scoring.
 *
 * Schema reference: cognitree_engine/cognitree_schema.md
 */

// ═══════════════════════════════════════════════════════════════════════
// .cognitree/ FILE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

/** .cognitree/active.json — tracks current position in the checkpoint tree */
export interface ActiveJson {
  checkpoint_id: string | null
  branch: string
  switched_at: string
}

/** Entry in tree.json's checkpoints map */
export interface TreeEntry {
  id: string
  parent: string | null
  branch: string
  depth: number
  is_base: boolean
  deleted: boolean
  timestamp: string
}

/** .cognitree/tree.json — the full checkpoint tree */
export interface TreeJson {
  project: string
  created: string
  total_checkpoints: number
  checkpoints: Record<string, TreeEntry>
}

/** .cognitree/config.json — project configuration */
export interface CognitreeConfig {
  model?: string
  apiKey?: string
  apiUrl?: string
  autoCheckpoint?: boolean
  trusted?: boolean
  authType?: string
  /** Track 6 — smart injection configuration */
  injection?: {
    enabled?: boolean
    budgetChars?: number
    budgetCharsQwen?: number
    debug?: boolean
    fallbackToStatic?: boolean
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CHECKPOINT LAYER SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

/** meta.json — checkpoint metadata */
export interface CheckpointMeta {
  id: string
  parent: string | null
  branch: string
  depth: number
  is_base: boolean
  confidence: number
  prompt: string
  timestamp: string
  deleted: boolean
}

/** Value-replacement layer (goal.json, next.json) */
export interface ValueLayerData {
  delta: boolean
  value: string | null
}

/** Append-only layer (progress.json, changed.json, decisions.json) */
export interface AppendLayerData {
  delta: boolean
  added: AppendItem[]
}

/** Hybrid layer (mistakes.json, blockers.json, warnings.json) */
export interface HybridLayerData {
  delta: boolean
  added: HybridItem[]
  updated: StatusUpdate[]
}

/** prompt_state.json — always full replacement */
export interface PromptStateData {
  delta: boolean
  active_file: string | null
  active_function: string | null
  current_approach: string | null
  assumptions: string[]
  checkpoint: string
}

/** Codebase layer — full tree or delta */
export interface CodebaseLayerData {
  delta: boolean
  added: CodebaseEntry[]
  deleted: CodebaseEntry[]
  modified: CodebaseEntry[]
  renamed: RenamedEntry[]
  tree: CodebaseTreeNode | null
}

// ═══════════════════════════════════════════════════════════════════════
// LAYER ITEMS
// ═══════════════════════════════════════════════════════════════════════

export interface AppendItem {
  id?: string
  text?: string
  file?: string
  description?: string
  checkpoint?: string
  decision?: string
  reason?: string
  alternatives?: string[]
  [key: string]: unknown
}

export interface HybridItem {
  id?: string
  text?: string
  fix?: string
  severity?: 'critical' | 'medium' | 'low'
  status?: 'active' | 'resolved'
  checkpoint?: string
  [key: string]: unknown
}

export interface StatusUpdate {
  id: string
  status: 'active' | 'resolved'
}

export interface CodebaseEntry {
  path: string
  type: 'file' | 'directory'
  checkpoint?: string
}

export interface RenamedEntry {
  from: string
  to: string
}

export interface CodebaseTreeNode {
  root?: string
  path?: string
  type: 'file' | 'directory'
  children?: CodebaseTreeNode[]
  added_at?: string
  deleted?: boolean
  deleted_at?: string
}

// ═══════════════════════════════════════════════════════════════════════
// RECONSTRUCTED MEMORY STATE
// ═══════════════════════════════════════════════════════════════════════

/** Complete reconstructed memory state at a checkpoint */
export interface MemoryState {
  goal: string | null
  progress: AppendItem[]
  mistakes: HybridItem[]
  blockers: HybridItem[]
  next: string | null
  changed: AppendItem[]
  decisions: AppendItem[]
  warnings: HybridItem[]
  prompt_state: Omit<PromptStateData, 'delta'> | null
  codebase: CodebaseTreeNode | null
  meta: CheckpointMeta | null
}

// ═══════════════════════════════════════════════════════════════════════
// TRACK 6 — TASK CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════

export type TaskCategory =
  | 'debug'
  | 'implement'
  | 'refactor'
  | 'understand'
  | 'git'
  | 'test'
  | 'config'
  | 'review'
  | 'unknown'

export type MemoryLayer =
  | 'goal'
  | 'progress'
  | 'decisions'
  | 'mistakes'
  | 'blockers'
  | 'next'
  | 'warnings'
  | 'changed'
  | 'codebase'
  | 'prompt_state'

export interface TaskSignal {
  category: TaskCategory
  confidence: number
  keywords: string[]
  relevantLayers: MemoryLayer[]
}

export interface ScoredLayer {
  layer: MemoryLayer
  content: string
  relevanceScore: number
  charCount: number
  include: boolean
}

export interface SmartInjectResult {
  injected: string
  signal: TaskSignal
  layersUsed: MemoryLayer[]
  charsUsed: number
  charsBudget: number
  skippedLayers: MemoryLayer[]
}

// ═══════════════════════════════════════════════════════════════════════
// MEMORY UPDATE INPUT
// ═══════════════════════════════════════════════════════════════════════

/** Valid layer names for memory updates */
export const VALID_LAYERS = [
  'goal', 'next', 'progress', 'changed', 'decisions',
  'mistakes', 'blockers', 'warnings', 'prompt_state',
] as const

export type ValidLayer = (typeof VALID_LAYERS)[number]

export const VALUE_LAYERS: ValidLayer[] = ['goal', 'next']
export const APPEND_LAYERS: ValidLayer[] = ['progress', 'changed', 'decisions']
export const HYBRID_LAYERS: ValidLayer[] = ['mistakes', 'blockers', 'warnings']

export const VALID_SEVERITIES = ['low', 'medium', 'critical'] as const
export const VALID_STATUSES = ['active', 'resolved'] as const
