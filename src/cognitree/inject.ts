/**
 * COGNITREE — Smart Injection Builder (Track 5 + Track 6)
 *
 * Replaces static inject.md reading with dynamic, task-aware memory injection.
 *
 * Two modes:
 * - getInjectMd(cwd): backward compat — reads static .cognitree/inject.md
 * - getSmartInject(cwd, userPrompt, budget): smart path — classifies task,
 *   scores layers, builds a budget-capped injection string
 *
 * The smart inject generates a compact markdown block that tells the model:
 * 1. What checkpoint we're at
 * 2. What task type was detected
 * 3. Only the relevant memory layers
 * 4. A footer listing skipped layers (so the model knows other memory exists)
 */

import * as fs from 'fs'
import * as path from 'path'
import type {
  AppendItem,
  CognitreeConfig,
  HybridItem,
  MemoryLayer,
  MemoryState,
  SmartInjectResult,
  TaskSignal,
} from './types.js'
import { getActiveCheckpoint } from './reconstruct.js'
import { reconstruct } from './reconstruct.js'
import { classifyTask } from './taskClassifier.js'
import { scoreMemoryLayers, getIncludedLayers, getExcludedLayers } from './memoryScorer.js'

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_BUDGET_CHARS = 8000
const DEFAULT_BUDGET_CHARS_QWEN = 4000

function loadConfig(cognitreeDir: string): CognitreeConfig | null {
  try {
    const configPath = path.join(cognitreeDir, 'config.json')
    if (!fs.existsSync(configPath)) return null
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as CognitreeConfig
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BACKWARD COMPAT — Static inject.md reader
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read the static inject.md file from .cognitree/.
 * Backward compatible with Track 5's original design.
 *
 * @returns inject.md content or null if not found
 */
export async function getInjectMd(cwd: string): Promise<string | null> {
  try {
    const injectPath = path.join(cwd, '.cognitree', 'inject.md')
    if (!fs.existsSync(injectPath)) return null
    const content = fs.readFileSync(injectPath, 'utf8')
    return content.trim() || null
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LAYER FORMATTERS — convert raw JSON to human-readable sections
// ═══════════════════════════════════════════════════════════════════════

function formatGoal(value: string | null): string {
  if (!value) return '(not set)'
  return value.length > 300 ? value.substring(0, 297) + '...' : value
}

function formatProgress(items: AppendItem[]): string {
  if (items.length === 0) return '(none)'
  // Last 5 items only
  const recent = items.slice(-5)
  return recent.map(i => `- ${i.text ?? i.description ?? '(entry)'}`).join('\n')
}

function formatDecisions(items: AppendItem[]): string {
  if (items.length === 0) return '(none)'
  // Last 3 most recent
  const recent = items.slice(-3)
  return recent
    .map(i => `- ${i.decision ?? i.text ?? '(decision)'}${i.reason ? ` — ${i.reason}` : ''}`)
    .join('\n')
}

function formatMistakes(items: HybridItem[]): string {
  // Only active, prioritize critical
  const active = items.filter(i => i.status !== 'resolved')
  if (active.length === 0) return '(none)'
  const sorted = active.sort((a, b) => {
    const order = { critical: 0, medium: 1, low: 2 }
    return (order[a.severity ?? 'low'] ?? 2) - (order[b.severity ?? 'low'] ?? 2)
  })
  return sorted
    .slice(0, 5)
    .map(i => `- [${i.severity ?? 'low'}] ${i.text}${i.fix ? ` → fix: ${i.fix}` : ''}`)
    .join('\n')
}

function formatWarnings(items: HybridItem[]): string {
  const active = items.filter(i => i.status !== 'resolved')
  if (active.length === 0) return '(none)'
  return active
    .slice(0, 5)
    .map(i => `- [${i.severity ?? 'low'}] ${i.text}`)
    .join('\n')
}

function formatBlockers(items: HybridItem[]): string {
  const active = items.filter(i => i.status !== 'resolved')
  if (active.length === 0) return '(none)'
  return active.map(i => `- ${i.text}`).join('\n')
}

function formatChanged(items: AppendItem[]): string {
  if (items.length === 0) return '(none)'
  const recent = items.slice(-10)
  return recent.map(i => `- ${i.file ?? i.text ?? '(file)'}`).join('\n')
}

function formatNext(value: string | null): string {
  if (!value) return '(not set)'
  return value.length > 300 ? value.substring(0, 297) + '...' : value
}

// ═══════════════════════════════════════════════════════════════════════
// LAYER CONTENT READER — reads raw layer data from checkpoint
// ═══════════════════════════════════════════════════════════════════════

function readLayerContents(
  state: MemoryState,
): Partial<Record<MemoryLayer, string>> {
  const layers: Partial<Record<MemoryLayer, string>> = {}

  // Serialize each layer as its formatted string
  // (we serialize first, then score, so the scorer works with char counts)
  if (state.goal !== null) {
    layers.goal = formatGoal(state.goal)
  }
  if (state.progress.length > 0) {
    layers.progress = formatProgress(state.progress)
  }
  if (state.decisions.length > 0) {
    layers.decisions = formatDecisions(state.decisions)
  }
  if (state.mistakes.length > 0) {
    const formatted = formatMistakes(state.mistakes)
    if (formatted !== '(none)') layers.mistakes = formatted
  }
  if (state.warnings.length > 0) {
    const formatted = formatWarnings(state.warnings)
    if (formatted !== '(none)') layers.warnings = formatted
  }
  if (state.blockers.length > 0) {
    const formatted = formatBlockers(state.blockers)
    if (formatted !== '(none)') layers.blockers = formatted  // not a MemoryLayer in type, but we handle it
  }
  if (state.changed.length > 0) {
    layers.changed = formatChanged(state.changed)
  }
  if (state.next !== null) {
    layers.next = formatNext(state.next)
  }
  if (state.prompt_state) {
    layers.prompt_state = JSON.stringify(state.prompt_state)
  }
  if (state.codebase) {
    // Flatten codebase tree to simple file list
    const files = flattenCodebaseTree(state.codebase)
    if (files.length > 0) {
      layers.codebase = files.slice(0, 30).join('\n') +
        (files.length > 30 ? `\n... and ${files.length - 30} more files` : '')
    }
  }

  return layers
}

function flattenCodebaseTree(node: { path?: string; children?: unknown[]; deleted?: boolean }): string[] {
  const files: string[] = []
  if (node.deleted) return files
  if (node.path && node.path !== '.') {
    files.push(node.path)
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      files.push(...flattenCodebaseTree(child as { path?: string; children?: unknown[]; deleted?: boolean }))
    }
  }
  return files
}

// ═══════════════════════════════════════════════════════════════════════
// INJECTION STRING BUILDER
// ═══════════════════════════════════════════════════════════════════════

const LAYER_HEADINGS: Record<string, string> = {
  goal: '**Goal:**',
  progress: '**Recent progress:**',
  decisions: '**Key decisions:**',
  mistakes: '**Watch out for:**',
  warnings: '**Warnings:**',
  next: '**Next steps:**',
  changed: '**Files changed:**',
  codebase: '**Codebase:**',
  prompt_state: '**Prompt state:**',
}

function buildInjectionString(
  included: { layer: MemoryLayer; content: string }[],
  skipped: MemoryLayer[],
  signal: TaskSignal,
  checkpointId: string,
  branch: string,
  confidence: number,
): string {
  const lines: string[] = []

  // Header line — always included, ~100 chars
  lines.push(
    `## Cognitree Memory [${checkpointId} | ${branch} | task: ${signal.category} | conf: ${signal.confidence.toFixed(2)}]`,
  )
  lines.push('')

  // Each included layer gets a section
  for (const { layer, content } of included) {
    const heading = LAYER_HEADINGS[layer] ?? `**${layer}:**`
    lines.push(heading)
    lines.push(content)
    lines.push('')
  }

  // Skipped layers footer — one line
  if (skipped.length > 0) {
    lines.push(`---`)
    lines.push(`[skipped: ${skipped.join(', ')} — not relevant to ${signal.category} task]`)
  }

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════
// SMART INJECT — Main entry point (Track 6)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a task-aware, budget-capped memory injection string.
 *
 * @param cwd - Working directory (project root)
 * @param userPrompt - The user's current prompt text (optional — falls back to static inject.md)
 * @param budgetChars - Max characters to inject (overridden by config)
 * @returns SmartInjectResult with injection string and metadata, or null
 */
export async function getSmartInject(
  cwd: string,
  userPrompt?: string,
  budgetChars?: number,
): Promise<SmartInjectResult | null> {
  try {
    const cognitreeDir = path.join(cwd, '.cognitree')
    if (!fs.existsSync(cognitreeDir)) return null

    // Load config for budget overrides
    const config = loadConfig(cognitreeDir)
    const injectionConfig = config?.injection

    // Check if injection is disabled
    if (injectionConfig?.enabled === false) return null

    // Determine budget
    let budget = budgetChars ?? injectionConfig?.budgetChars ?? DEFAULT_BUDGET_CHARS

    // If no user prompt, fall back to static inject.md
    if (!userPrompt && injectionConfig?.fallbackToStatic !== false) {
      const staticContent = await getInjectMd(cwd)
      if (staticContent) {
        const truncated = staticContent.length > budget
          ? staticContent.substring(0, budget - 50) + '\n...[truncated]'
          : staticContent
        return {
          injected: truncated,
          signal: { category: 'unknown', confidence: 0, keywords: [], relevantLayers: ['goal', 'progress'] },
          layersUsed: ['goal', 'progress'] as MemoryLayer[],
          charsUsed: truncated.length,
          charsBudget: budget,
          skippedLayers: [],
        }
      }
    }

    // Get active checkpoint
    const active = getActiveCheckpoint(cognitreeDir)
    if (!active?.checkpoint_id) return null

    // Reconstruct full state
    const state = reconstruct(cognitreeDir, active.checkpoint_id)
    if (!state) return null

    // Classify task
    const signal = classifyTask(userPrompt ?? '')

    // Read and format layer contents
    const layerContents = readLayerContents(state)

    // Score layers against task signal
    const scored = scoreMemoryLayers(layerContents, signal, budget)

    // Get included and excluded layers
    const included = getIncludedLayers(scored)
    const excluded = getExcludedLayers(scored)

    // Build injection string
    const injected = buildInjectionString(
      included,
      excluded,
      signal,
      active.checkpoint_id,
      active.branch,
      state.meta?.confidence ?? 1.0,
    )

    // Hard cap enforcement — should never exceed but safety check
    const finalInjected = injected.length > budget
      ? injected.substring(0, budget - 20) + '\n...[hard cap]'
      : injected

    return {
      injected: finalInjected,
      signal,
      layersUsed: included.map(s => s.layer),
      charsUsed: finalInjected.length,
      charsBudget: budget,
      skippedLayers: excluded,
    }
  } catch {
    return null
  }
}

/**
 * Regenerate the static inject.md file from current state.
 * Called after checkpoint creation so the next session has
 * an up-to-date fallback file.
 */
export function regenerateInjectMd(cwd: string): boolean {
  try {
    const cognitreeDir = path.join(cwd, '.cognitree')
    if (!fs.existsSync(cognitreeDir)) return false

    const active = getActiveCheckpoint(cognitreeDir)
    if (!active?.checkpoint_id) return false

    const state = reconstruct(cognitreeDir, active.checkpoint_id)
    if (!state) return false

    const lines: string[] = []
    lines.push(`[COGNITREE — ${path.basename(cwd)} · ${active.checkpoint_id} · ${active.branch} · confidence ${state.meta?.confidence ?? 1}]`)
    lines.push('')

    lines.push('GOAL:')
    lines.push(`  ${state.goal ?? '(not set)'}`)
    lines.push('')

    lines.push('PROGRESS:')
    if (state.progress.length > 0) {
      for (const item of state.progress.slice(-5)) {
        lines.push(`  - ${item.text ?? item.description ?? '(entry)'}`)
      }
    } else {
      lines.push('  (none)')
    }
    lines.push('')

    lines.push('NEXT:')
    lines.push(`  ${state.next ?? '(not set)'}`)
    lines.push('')

    lines.push('DECISIONS:')
    if (state.decisions.length > 0) {
      for (const item of state.decisions.slice(-5)) {
        lines.push(`  - ${item.decision ?? item.text ?? '(decision)'}${item.reason ? ` — ${item.reason}` : ''}`)
      }
    } else {
      lines.push('  (none)')
    }
    lines.push('')

    lines.push('[/COGNITREE]')

    fs.writeFileSync(
      path.join(cognitreeDir, 'inject.md'),
      lines.join('\n'),
      'utf8',
    )

    return true
  } catch {
    return false
  }
}

export { DEFAULT_BUDGET_CHARS, DEFAULT_BUDGET_CHARS_QWEN, loadConfig }
