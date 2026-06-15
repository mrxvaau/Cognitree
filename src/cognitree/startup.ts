/**
 * COGNITREE — Startup Loader + User Prompt State (Track 5+6)
 *
 * Pure loader — NOT a port of the CLI/auth menus in cognitree_engine/src/startup.js.
 *
 * Responsibilities:
 * 1. Check if .cognitree/ exists in cwd
 * 2. Load active.json → find current checkpoint
 * 3. Generate smart inject string (or fall back to inject.md)
 * 4. Provide module-level user prompt state (Option B from plan)
 *
 * Option B pattern: setCurrentUserPrompt() / getCurrentUserPrompt()
 * Set once in the REPL before getSystemPrompt() is called.
 * Read in the cognitree system prompt section.
 * Zero signature changes to existing functions.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { ActiveJson, CognitreeConfig, TreeJson } from './types.js'
import { getSmartInject, getInjectMd } from './inject.js'
import {
  getCurrentUserPrompt,
  setCurrentUserPrompt,
} from './manager/sessionLifecycle.js'

// ═══════════════════════════════════════════════════════════════════════
// MODULE-LEVEL USER PROMPT STATE (Option B)
// ═══════════════════════════════════════════════════════════════════════

// _currentUserPrompt is now owned by manager/sessionLifecycle.ts.
// setCurrentUserPrompt and getCurrentUserPrompt are re-exported from there
// so all callers share a single source of truth.
export { setCurrentUserPrompt, getCurrentUserPrompt }

// ═══════════════════════════════════════════════════════════════════════
// STATE TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface CognitreeLoadResult {
  loaded: boolean
  checkpointId: string | null
  branch: string | null
  project: string | null
  confidence: number | null
  error: string | null
}

// ═══════════════════════════════════════════════════════════════════════
// STATE LOADER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if Cognitree is initialized in the given directory.
 */
export function isCognitreeProject(cwd: string): boolean {
  try {
    return fs.existsSync(path.join(cwd, '.cognitree', 'active.json'))
  } catch {
    return false
  }
}

/**
 * Load the Cognitree state from .cognitree/ directory.
 *
 * @returns CognitreeLoadResult — loaded: false if .cognitree/ missing or invalid
 */
export function loadCognitreeState(cwd: string): CognitreeLoadResult {
  try {
    const cognitreeDir = path.join(cwd, '.cognitree')

    if (!fs.existsSync(cognitreeDir)) {
      return { loaded: false, checkpointId: null, branch: null, project: null, confidence: null, error: null }
    }

    // Read active.json
    const activePath = path.join(cognitreeDir, 'active.json')
    if (!fs.existsSync(activePath)) {
      return { loaded: false, checkpointId: null, branch: null, project: null, confidence: null, error: 'active.json missing' }
    }

    const active = JSON.parse(fs.readFileSync(activePath, 'utf8')) as ActiveJson

    // Read tree.json for project name
    let project: string | null = null
    const treePath = path.join(cognitreeDir, 'tree.json')
    if (fs.existsSync(treePath)) {
      const tree = JSON.parse(fs.readFileSync(treePath, 'utf8')) as TreeJson
      project = tree.project ?? null
    }

    // Read confidence from meta
    let confidence = 1.0
    if (active.checkpoint_id) {
      const metaPath = path.join(cognitreeDir, 'checkpoints', active.checkpoint_id, 'meta.json')
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { confidence?: number }
        confidence = meta.confidence ?? 1.0
      }
    }

    return {
      loaded: true,
      checkpointId: active.checkpoint_id,
      branch: active.branch,
      project,
      confidence,
      error: null,
    }
  } catch (err) {
    return {
      loaded: false,
      checkpointId: null,
      branch: null,
      project: null,
      confidence: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// INJECTION ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the Cognitree memory injection string for the system prompt.
 *
 * This is the main entry point called from prompts.ts.
 *
 * Flow:
 * 1. Check if .cognitree/ exists → return null silently if not
 * 2. Get current user prompt from module state
 * 3. If user prompt available → smart inject (task-aware, budget-capped)
 * 4. If no user prompt (first turn) → fall back to static inject.md
 * 5. Never throws — returns null on any error
 *
 * @param cwd - Working directory
 * @returns Injection string or null
 */
export async function getCognitreeInjection(cwd: string): Promise<string | null> {
  try {
    if (!isCognitreeProject(cwd)) return null

    const userPrompt = getCurrentUserPrompt()

    // Smart inject if we have a user prompt
    const result = await getSmartInject(cwd, userPrompt ?? undefined)

    if (result) {
      // Debug logging
      if (process.env.COGNITREE_DEBUG) {
        console.error(`[Cognitree] Task: ${result.signal.category} (${result.signal.confidence.toFixed(2)})`)
        console.error(`[Cognitree] Injected layers: ${result.layersUsed.join(', ')}`)
        console.error(`[Cognitree] Chars used: ${result.charsUsed}/${result.charsBudget}`)
        if (result.skippedLayers.length > 0) {
          console.error(`[Cognitree] Skipped: ${result.skippedLayers.join(', ')}`)
        }
      }

      return result.injected
    }

    // Fallback to static inject.md
    return await getInjectMd(cwd)
  } catch {
    return null
  }
}

/**
 * Get a status summary of the Cognitree state.
 * Used by the /cognitree-status slash command.
 */
export function getCognitreeStatus(cwd: string): string {
  const state = loadCognitreeState(cwd)

  if (!state.loaded) {
    return 'Cognitree: not initialized in this directory'
  }

  const lines: string[] = []
  lines.push(`🌳 Cognitree Memory Engine`)
  lines.push(`   Project:    ${state.project ?? path.basename(cwd)}`)
  lines.push(`   Branch:     ${state.branch ?? 'main'}`)
  lines.push(`   Checkpoint: ${state.checkpointId ?? '(none)'}`)
  lines.push(`   Confidence: ${state.confidence?.toFixed(2) ?? '1.00'}`)

  // Count total checkpoints
  try {
    const treePath = path.join(cwd, '.cognitree', 'tree.json')
    if (fs.existsSync(treePath)) {
      const tree = JSON.parse(fs.readFileSync(treePath, 'utf8')) as TreeJson
      lines.push(`   Total CPs:  ${tree.total_checkpoints ?? 0}`)
    }
  } catch {
    // Skip
  }

  return lines.join('\n')
}
