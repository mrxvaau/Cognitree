/**
 * COGNITREE — Barrel Export
 *
 * Single entry point for all Cognitree memory engine modules.
 */

// Core types
export type {
  ActiveJson,
  AppendItem,
  AppendLayerData,
  CheckpointMeta,
  CodebaseEntry,
  CodebaseLayerData,
  CodebaseTreeNode,
  CognitreeConfig,
  HybridItem,
  HybridLayerData,
  MemoryLayer,
  MemoryState,
  PromptStateData,
  RenamedEntry,
  ScoredLayer,
  SmartInjectResult,
  StatusUpdate,
  TaskCategory,
  TaskSignal,
  TreeEntry,
  TreeJson,
  ValidLayer,
  ValueLayerData,
} from './types.js'

export {
  VALID_LAYERS,
  VALUE_LAYERS,
  APPEND_LAYERS,
  HYBRID_LAYERS,
  VALID_SEVERITIES,
  VALID_STATUSES,
} from './types.js'

// Reconstruction engine
export { reconstruct, reconstructActive, getActiveCheckpoint } from './reconstruct.js'

// Memory updater
export { updateMemory } from './memory.js'
export type { UpdateMemoryOptions } from './memory.js'

// Checkpoint creator
export { createCheckpoint } from './checkpoint.js'
export type { CreateCheckpointOptions } from './checkpoint.js'

// Branch creator
export { createBranch } from './branch.js'
export type { CreateBranchOptions } from './branch.js'

// Task classifier (Track 6)
export { classifyTask } from './taskClassifier.js'

// Memory scorer (Track 6)
export { scoreMemoryLayers, getIncludedLayers, getExcludedLayers } from './memoryScorer.js'

// Smart injection (Track 5 + 6)
export { getInjectMd, getSmartInject, regenerateInjectMd } from './inject.js'

// Startup loader (Track 5 + 6)
export {
  setCurrentUserPrompt,
  getCurrentUserPrompt,
  isCognitreeProject,
  loadCognitreeState,
  getCognitreeInjection,
  getCognitreeStatus,
} from './startup.js'
export type { CognitreeLoadResult } from './startup.js'

// Stuck detector (Track 7)
export { StuckDetector } from './stuckDetector.js'
export type { StuckPattern, StuckSignal, ToolCallRecord } from './stuckDetector.js'

// Recovery injector (Track 7)
export { RecoveryInjector, MAX_RECOVERY_ATTEMPTS } from './recoveryInjector.js'
export type { RecoveryContext } from './recoveryInjector.js'
