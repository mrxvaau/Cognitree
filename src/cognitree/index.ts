/**
 * COGNITREE — Barrel Export
 *
 * Single entry point for all Cognitree memory engine modules.
 *
 * NOTE: Exports from core/ (Phase 1 — Layer<T> schema) are canonical.
 * Old root-layer modules (types.ts, reconstruct.ts, memory.ts, checkpoint.ts,
 * branch.ts) still exist but are NOT re-exported here to avoid schema conflicts.
 */

// ═══════════════════════════════════════════════════════════════════════
// Core types (Phase 1 — canonical Layer<T> schema)
// ═══════════════════════════════════════════════════════════════════════

export type {
  Layer,
  Mistake,
  GoalLayer,
  ProgressLayer,
  DecisionsLayer,
  MistakesLayer,
  ChangedLayer,
  NextLayer,
  WarningsLayer,
  MetaMeta,
  CheckpointData,
  TreeEntry,
  TreeJson,
  ActiveJson,
  LayerName,
} from './core/types.js'

export { LAYER_NAMES } from './core/types.js'

// ═══════════════════════════════════════════════════════════════════════
// Core storage (Phase 1)
// ═══════════════════════════════════════════════════════════════════════

export {
  readLayer,
  writeLayer,
  readMeta,
  writeMeta,
  readTree,
  writeTree,
  readActive,
  writeActive,
  initCognitreeDir,
  checkpointDir,
  createCheckpointDir,
} from './core/storage.js'

// ═══════════════════════════════════════════════════════════════════════
// Core checkpoint (Phase 1)
// ═══════════════════════════════════════════════════════════════════════

export {
  createCheckpoint,
  loadCheckpoint,
  listCheckpoints,
  listCheckpointsByBranch,
  getActiveCheckpointId,
} from './core/checkpoint.js'

export type {
  CreateCheckpointOptions,
  CheckpointResult,
} from './core/checkpoint.js'

// ═══════════════════════════════════════════════════════════════════════
// Core branch (Phase 1)
// ═══════════════════════════════════════════════════════════════════════

export { createBranch, listBranches } from './core/branch.js'
export type { CreateBranchOptions, BranchResult } from './core/branch.js'

// ═══════════════════════════════════════════════════════════════════════
// Injection (Phase 2/3 — task classifier, memory scorer, injector)
// ═══════════════════════════════════════════════════════════════════════

export { classifyTask } from './injection/taskClassifier.js'
export { scoreLayers, selectLayersForBudget } from './injection/memoryScorer.js'
export { buildInjectString } from './injection/injector.js'
export { readInjectMd, writeInjectMd } from './injection/injectMd.js'

// ═══════════════════════════════════════════════════════════════════════
// Events (collectors + event bus)
// ═══════════════════════════════════════════════════════════════════════

export { cognitreeEventBus } from './events/eventBus.js'

// ═══════════════════════════════════════════════════════════════════════
// Manager (session lifecycle)
// ═══════════════════════════════════════════════════════════════════════

export {
  onSessionStart,
  onSessionEnd,
  getCognitreeInjection,
  setCurrentUserPrompt,
} from './manager/sessionLifecycle.js'

// ═══════════════════════════════════════════════════════════════════════
// Startup (legacy — still useful as a facade)
// ═══════════════════════════════════════════════════════════════════════

export {
  isCognitreeProject,
  loadCognitreeState,
  getCognitreeStatus,
} from './startup.js'
export type { CognitreeLoadResult } from './startup.js'

// ═══════════════════════════════════════════════════════════════════════
// Self-healing (Track 7 — stuck detection + recovery)
// ═══════════════════════════════════════════════════════════════════════

export { StuckDetector } from './stuckDetector.js'
export type { StuckPattern, StuckSignal, ToolCallRecord } from './stuckDetector.js'

export { RecoveryInjector, MAX_RECOVERY_ATTEMPTS } from './recoveryInjector.js'
export type { RecoveryContext } from './recoveryInjector.js'
