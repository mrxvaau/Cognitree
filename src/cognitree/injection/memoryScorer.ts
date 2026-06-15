/**
 * COGNITREE — memoryScorer (Phase 3)
 *
 * Score memory layers by relevance to the current task signal.
 * Fills budget greedily by score — highest relevance first.
 */

import type { CheckpointData, LayerName, Mistake } from '../core/types.js'
import type { TaskSignal } from './taskClassifier.js'

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface ScoredLayer {
  layer: LayerName
  content: string       // rendered string (may be truncated by selectLayersForBudget)
  relevanceScore: number // 0.0 = empty, 0.3 = not relevant, 1.0 = relevant
  charCount: number
  include: boolean
}

// ═══════════════════════════════════════════════════════════════════════
// LAYER RENDERING
// ═══════════════════════════════════════════════════════════════════════

const LAYER_ORDER: LayerName[] = [
  'goal', 'mistakes', 'warnings', 'next', 'decisions', 'changed', 'progress',
]

function renderContent(layer: LayerName, checkpoint: CheckpointData): string {
  switch (layer) {
    case 'goal':
      return checkpoint.goal.value ?? ''
    case 'progress':
      // Last 5 completed items only — older progress is not actionable
      return (checkpoint.progress.value ?? []).slice(-5).join('\n')
    case 'decisions':
      // Last 3 most recent decisions — avoids surfacing stale choices
      return (checkpoint.decisions.value ?? []).slice(-3).join('\n')
    case 'mistakes':
      // Newest 5 mistakes, each capped at 120 chars to keep injection tight
      return (checkpoint.mistakes.value ?? [])
        .slice(-5)
        .map((m: Mistake) => {
          const entry = `${m.pattern}: ${m.hint}`
          return entry.length > 120 ? entry.slice(0, 117) + '...' : entry
        })
        .join('\n')
    case 'changed':
      return (checkpoint.changed.value ?? []).join(', ')
    case 'next':
      return (checkpoint.next.value ?? []).join('\n')
    case 'warnings':
      return (checkpoint.warnings.value ?? []).join('\n')
    default:
      return ''
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════════════

function scoreLayer(layer: LayerName, content: string, signal: TaskSignal): number {
  if (!content) return 0
  return (signal.relevantLayers as string[]).includes(layer) ? 1.0 : 0.3
}

/**
 * Score all layers against the task signal, sorted by relevance descending.
 */
export function scoreLayers(checkpoint: CheckpointData, signal: TaskSignal): ScoredLayer[] {
  const scored = LAYER_ORDER.map(layer => {
    const content = renderContent(layer, checkpoint)
    const relevanceScore = scoreLayer(layer, content, signal)
    return { layer, content, relevanceScore, charCount: content.length, include: relevanceScore > 0 }
  })
  return scored.sort((a, b) => b.relevanceScore - a.relevanceScore)
}

// ═══════════════════════════════════════════════════════════════════════
// GREEDY SELECTION
// ═══════════════════════════════════════════════════════════════════════

const LABEL_OVERHEAD: Record<LayerName, number> = {
  goal:      'GOAL: \n'.length,
  progress:  'PROGRESS: \n'.length,
  decisions: 'DECISIONS: \n'.length,
  mistakes:  'MISTAKES TO AVOID: \n'.length,
  changed:   'CHANGED FILES: \n'.length,
  next:      'NEXT: \n'.length,
  warnings:  'WARNINGS: \n'.length,
}

/**
 * Greedily select layers within budgetChars.
 * Truncates the last partially-fitting layer instead of skipping it.
 * Never exceeds budget.
 */
export function selectLayersForBudget(scored: ScoredLayer[], budgetChars: number): ScoredLayer[] {
  let remaining = budgetChars
  const result: ScoredLayer[] = []

  for (const sl of scored) {
    if (sl.relevanceScore === 0) {
      result.push({ ...sl, include: false })
      continue
    }
    if (remaining <= 0) {
      result.push({ ...sl, include: false })
      continue
    }

    const overhead = LABEL_OVERHEAD[sl.layer] ?? 10
    const totalNeeded = sl.charCount + overhead

    if (totalNeeded <= remaining) {
      result.push({ ...sl, include: true })
      remaining -= totalNeeded
    } else if (remaining > overhead) {
      // Partial include — truncate content
      const available = remaining - overhead
      const truncated = sl.content.slice(0, available)
      result.push({ ...sl, content: truncated, charCount: truncated.length, include: true })
      remaining = 0
    } else {
      result.push({ ...sl, include: false })
    }
  }

  return result
}
