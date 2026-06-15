import * as fs from 'fs'
import * as path from 'path'
import { CheckpointData } from '../core/types.js'
import { createCheckpoint, loadCheckpoint } from '../core/checkpoint.js'
import { readLayer, initCognitreeDir } from '../core/storage.js'
import { MemoryManager } from './memoryManager.js'
import { buildInjectString } from '../injection/injector.js'
import { classifyTask } from '../injection/taskClassifier.js'
import { writeInjectMd } from '../injection/injectMd.js'

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

  if (activeId) {
    activeManager = new MemoryManager(cognitreeDir, activeId)
    activeManager.init()
  }

  return { activeCheckpointId: activeId }
}

export function onSessionEnd(cwd: string) {
  const cognitreeDir = path.join(cwd, '.cognitree')
  if (!fs.existsSync(cognitreeDir)) return

  // Create a checkpoint to seal the session
  const cp = createCheckpoint({ cognitreeDir, prompt: 'Session ended' })
  if (!cp) return

  // Load full state for inject string
  const cpData: CheckpointData = {
    meta: cp,
    goal: readLayer(path.join(cognitreeDir, 'checkpoints', cp.id, 'goal.json')) || { delta: false, value: null },
    progress: readLayer(path.join(cognitreeDir, 'checkpoints', cp.id, 'progress.json')) || { delta: false, value: [] },
    decisions: readLayer(path.join(cognitreeDir, 'checkpoints', cp.id, 'decisions.json')) || { delta: false, value: [] },
    mistakes: readLayer(path.join(cognitreeDir, 'checkpoints', cp.id, 'mistakes.json')) || { delta: false, value: [] },
    changed: readLayer(path.join(cognitreeDir, 'checkpoints', cp.id, 'changed.json')) || { delta: false, value: [] },
    next: readLayer(path.join(cognitreeDir, 'checkpoints', cp.id, 'next.json')) || { delta: false, value: [] },
    warnings: readLayer(path.join(cognitreeDir, 'checkpoints', cp.id, 'warnings.json')) || { delta: false, value: [] },
  }

  const signal = classifyTask('Session ended')
  const injectString = buildInjectString(cpData, signal)
  writeInjectMd(cognitreeDir, injectString)

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

    const signal = classifyTask(_currentUserPrompt || '')
    const resultString = buildInjectString(cpData, signal, budget)

    if (process.env.COGNITREE_DEBUG) {
      console.error(`[Cognitree] Task: ${signal.category} (${signal.confidence.toFixed(2)})`)
      console.error(`[Cognitree] Budget: ${budget} chars | Used: ${resultString.length} chars`)
    }

    return resultString
  } catch {
    return null
  }
}
