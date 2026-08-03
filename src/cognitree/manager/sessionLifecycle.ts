import * as fs from 'fs'
import * as path from 'path'
import { CheckpointData } from '../core/types.js'
import { createCheckpoint, loadCheckpoint } from '../core/checkpoint.js'
import { readLayer, initCognitreeDir } from '../core/storage.js'
import { MemoryManager } from './memoryManager.js'
import { buildInjectString } from '../injection/injector.js'
import { classifyTask } from '../injection/taskClassifier.js'
import { writeInjectMd } from '../injection/injectMd.js'
import { scanSourceTree, diffTrees } from '../codebase/treeScanner.js'
import { readBaseTree, writeBaseTree, writeCheckpointDiff, readCheckpointDiff } from '../codebase/treeStorage.js'
import { captureSnapshot, snapshotExists } from '../codebase/codeSnapshot.js'

// ═══════════════════════════════════════════════════════════════════════
// CONFIG LOADING
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_BUDGET_CHARS = 8000
const QWEN_BUDGET_CHARS = 4000

interface InjectionConfig {
  enabled?: boolean
  budgetChars?: number
}

interface CognitreeConfig {
  injection?: InjectionConfig
}

function loadConfig(cognitreeDir: string): CognitreeConfig | null {
  try {
    const configPath = path.join(cognitreeDir, 'config.json')
    if (!fs.existsSync(configPath)) return null
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as CognitreeConfig
  } catch {
    return null
  }
}

function getModelBudget(defaultBudget: number): number {
  const model = (process.env.LLM_MODEL ?? '').toLowerCase()
  return model.includes('qwen') ? QWEN_BUDGET_CHARS : defaultBudget
}

let activeManager: MemoryManager | null = null

// Option B State
let _currentUserPrompt: string | null = null

export function setCurrentUserPrompt(prompt: string | null): void {
  _currentUserPrompt = prompt
}

export function getCurrentUserPrompt(): string | null {
  return _currentUserPrompt
}

export function onSessionStart(cwd: string): { activeCheckpointId: string | null } {
  // Idempotent: if already initialized by an earlier call (e.g. main.tsx),
  // do not re-create the manager or re-register listeners.
  if (activeManager !== null) {
    const activePath = path.join(cwd, '.cognitree', 'active.json')
    try {
      const activeId = JSON.parse(fs.readFileSync(activePath, 'utf8')).checkpoint_id
      return { activeCheckpointId: activeId }
    } catch {
      return { activeCheckpointId: null }
    }
  }

  const cognitreeDir = path.join(cwd, '.cognitree')
  if (!fs.existsSync(cognitreeDir)) {
    return { activeCheckpointId: null }
  }

  // Determine active checkpoint
  let activeId: string | null = null
  const activePath = path.join(cognitreeDir, 'active.json')
  if (fs.existsSync(activePath)) {
    try {
      activeId = JSON.parse(fs.readFileSync(activePath, 'utf8')).checkpoint_id
    } catch {}
  }

  if (!activeId) {
    // Bootstrap: create first checkpoint on fresh .cognitree/
    try {
      const cp = createCheckpoint({ cognitreeDir, prompt: 'Session started' })
      if (cp) {
        activeId = cp.id
      }
    } catch {
      // silent fail — never block startup
    }
  }

  if (activeId) {
    activeManager = new MemoryManager(cognitreeDir, activeId)
    activeManager.init()

    // Codebase tracker: scan project and compute diff vs previous session.
    // Silent fail — never block startup.
    try {
      const baseTree = readBaseTree(cognitreeDir)
      if (!baseTree) {
        // First session — save baseline snapshot, no diff yet
        const tree = scanSourceTree(cwd)
        writeBaseTree(cognitreeDir, tree)
      } else {
        // Subsequent sessions — compute diff
        const currentTree = scanSourceTree(cwd)
        const diff = diffTrees(baseTree, currentTree)
        if (diff.added.length > 0 || diff.modified.length > 0 || diff.deleted.length > 0) {
          writeCheckpointDiff(cognitreeDir, activeId, diff)
          writeBaseTree(cognitreeDir, currentTree)
        }
      }
    } catch {
      // silent fail — never block startup
    }

    // Code snapshot: capture full file manifest for rollback support.
    // Runs once per checkpoint (guarded by snapshotExists).
    try {
      if (!snapshotExists(cognitreeDir, activeId)) {
        captureSnapshot(cognitreeDir, cwd, activeId)
      }
    } catch {
      // silent fail — never block startup
    }
  }

  return { activeCheckpointId: activeId }
}


export function onSessionEnd(cwd: string) {
  const cognitreeDir = path.join(cwd, '.cognitree')
  if (!fs.existsSync(cognitreeDir)) return

  // Read the currently active checkpoint id — this is where collected memory lives
  let activeId: string | null = null
  const activePath = path.join(cognitreeDir, 'active.json')
  if (fs.existsSync(activePath)) {
    try {
      activeId = JSON.parse(fs.readFileSync(activePath, 'utf8')).checkpoint_id
    } catch {}
  }

  if (activeId) {
    // Load meta and layers from the EXISTING active checkpoint
    const cpMeta = loadCheckpoint(cognitreeDir, activeId)
    if (cpMeta) {
      const cpData: CheckpointData = {
        meta: cpMeta,
        goal: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'goal.json')) || { delta: false, value: null },
        progress: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'progress.json')) || { delta: false, value: [] },
        decisions: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'decisions.json')) || { delta: false, value: [] },
        mistakes: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'mistakes.json')) || { delta: false, value: [] },
        changed: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'changed.json')) || { delta: false, value: [] },
        next: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'next.json')) || { delta: false, value: [] },
        warnings: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'warnings.json')) || { delta: false, value: [] },
      }

      const signal = classifyTask(_currentUserPrompt || 'Session ended')
      const injectString = buildInjectString(cpData, signal)
      writeInjectMd(cognitreeDir, injectString)
    }

    // Seal the session by creating a new checkpoint that becomes the next starting point
    createCheckpoint({ cognitreeDir, prompt: 'Session ended', parentId: activeId })
  }

  if (activeManager) {
    activeManager.destroy()
    activeManager = null
  }
}

export async function getCognitreeInjection(cwd: string): Promise<string | null> {
  try {
    const cognitreeDir = path.join(cwd, '.cognitree')
    if (!fs.existsSync(cognitreeDir)) return null

    // Load project config — controls budget and enable/disable
    const config = loadConfig(cognitreeDir)

    // Respect injection.enabled = false
    if (config?.injection?.enabled === false) return null

    // Budget: config override → model-aware default → global default
    const configBudget = config?.injection?.budgetChars ?? DEFAULT_BUDGET_CHARS
    const budget = getModelBudget(configBudget)

    let activeId: string | null = null
    const activePath = path.join(cognitreeDir, 'active.json')
    if (fs.existsSync(activePath)) {
      try {
        activeId = JSON.parse(fs.readFileSync(activePath, 'utf8')).checkpoint_id
      } catch {}
    }
    if (!activeId) {
      // Fallback to inject.md if no active checkpoint
      const injectPath = path.join(cognitreeDir, 'inject.md')
      if (fs.existsSync(injectPath)) {
        return fs.readFileSync(injectPath, 'utf8')
      }
      return null
    }

    const cpMeta = loadCheckpoint(cognitreeDir, activeId)
    if (!cpMeta) return null

    const cpData: CheckpointData = {
      meta: cpMeta,
      goal: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'goal.json')) || { delta: false, value: null },
      progress: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'progress.json')) || { delta: false, value: [] },
      decisions: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'decisions.json')) || { delta: false, value: [] },
      mistakes: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'mistakes.json')) || { delta: false, value: [] },
      changed: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'changed.json')) || { delta: false, value: [] },
      next: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'next.json')) || { delta: false, value: [] },
      warnings: readLayer(path.join(cognitreeDir, 'checkpoints', activeId, 'warnings.json')) || { delta: false, value: [] },
    }

    // Check if the active checkpoint has any useful layer data.
    // If all layers are empty (freshly bootstrapped session, goal not yet captured),
    // fall back to inject.md which contains the PREVIOUS session's data written by onSessionEnd.
    const hasUsefulData =
      cpData.goal.value !== null ||
      (cpData.progress.value as unknown[]).length > 0 ||
      (cpData.decisions.value as unknown[]).length > 0 ||
      (cpData.changed.value as unknown[]).length > 0 ||
      (cpData.mistakes.value as unknown[]).length > 0

    if (!hasUsefulData) {
      const injectPath = path.join(cognitreeDir, 'inject.md')
      if (fs.existsSync(injectPath)) {
        const injectMdContent = fs.readFileSync(injectPath, 'utf8')
        if (process.env.COGNITREE_DEBUG) {
          console.error(`[Cognitree] Active checkpoint ${activeId} is empty — using inject.md from prior session`)
        }
        return injectMdContent
      }
    }

    const signal = classifyTask(_currentUserPrompt || '')
    let resultString = buildInjectString(cpData, signal, budget)

    // Append codebase diff block if files changed since last session
    const diff = readCheckpointDiff(cognitreeDir, activeId)
    if (diff && (diff.added.length > 0 || diff.modified.length > 0 || diff.deleted.length > 0)) {
      const lines: string[] = ['', 'CODEBASE CHANGES:']
      if (diff.added.length > 0)    lines.push(`  + ${diff.added.join('\n  + ')}`)
      if (diff.modified.length > 0) lines.push(`  ~ ${diff.modified.join('\n  ~ ')}`)
      if (diff.deleted.length > 0)  lines.push(`  - ${diff.deleted.join('\n  - ')}`)
      resultString += lines.join('\n')
    }

    if (process.env.COGNITREE_DEBUG) {
      console.error(`[Cognitree] Task: ${signal.category} (${signal.confidence.toFixed(2)})`)
      console.error(`[Cognitree] Budget: ${budget} chars | Used: ${resultString.length} chars`)
    }

    return resultString
  } catch {
    return null
  }
}

