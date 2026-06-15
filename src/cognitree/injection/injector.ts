/**
 * COGNITREE — injector (Phase 3)
 *
 * Build the final inject string to prepend to the system prompt.
 * HARD RULE: output.length <= budgetChars ALWAYS
 * Header line always included regardless of budget.
 *
 * Output format:
 *   [COGNITREE — cp_002 · main · confidence 0.94]
 *   GOAL: Fix the MCP connection
 *   DECISIONS: Use node dist/src/index.js not dist/index.js
 *   MISTAKES TO AVOID: Wrong JSON format
 *   NEXT: Test memory injection after restart
 *   ---
 *   skipped: progress, changed, warnings (not relevant to debug task)
 */

import type { CheckpointData, LayerName } from '../core/types.js'
import type { TaskSignal } from './taskClassifier.js'
import { scoreLayers, selectLayersForBudget } from './memoryScorer.js'

const DEFAULT_BUDGET = 8000

// ═══════════════════════════════════════════════════════════════════════
// LAYER LABELS
// ═══════════════════════════════════════════════════════════════════════

const LAYER_LABELS: Record<LayerName, string> = {
  goal:      'GOAL',
  progress:  'PROGRESS',
  decisions: 'DECISIONS',
  mistakes:  'MISTAKES TO AVOID',
  changed:   'CHANGED FILES',
  next:      'NEXT',
  warnings:  'WARNINGS',
}

// ═══════════════════════════════════════════════════════════════════════
// BUILD INJECT STRING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build the inject string from checkpoint data + task signal.
 * Returns '' if checkpoint is null (no .cognitree/ exists).
 * Never exceeds budgetChars.
 */
export function buildInjectString(
  checkpoint: CheckpointData | null,
  signal: TaskSignal,
  budgetChars: number = DEFAULT_BUDGET,
): string {
  if (!checkpoint) return ''

  const { meta } = checkpoint
  const conf = meta.confidence.toFixed(2)
  const header = `[COGNITREE — ${meta.checkpoint_id} · ${meta.branch} · confidence ${conf}]\n`

  // Header always included — it's the identity of the inject block
  let result = header
  let remaining = budgetChars - header.length

  // Score and select layers
  const scored = scoreLayers(checkpoint, signal)
  const selected = selectLayersForBudget(scored, Math.max(0, remaining))

  const included: LayerName[] = []
  const skipped: LayerName[] = []

  for (const sl of selected) {
    // Only include layers that are relevant (score 1.0) AND had budget
    if (!sl.include || sl.relevanceScore < 1.0) {
      // Has content but not relevant → goes to skipped footer
      if (sl.relevanceScore > 0 && sl.relevanceScore < 1.0) skipped.push(sl.layer)
      // Had budget but forced-excluded (score=0 = empty) → silently skip
      continue
    }
    const label = LAYER_LABELS[sl.layer]
    const line = `${label}: ${sl.content}\n`
    result += line
    included.push(sl.layer)
  }

  // Also collect relevant layers that were excluded due to budget exhaustion
  const budgetExcluded = selected
    .filter(sl => !sl.include && sl.relevanceScore === 1.0)
    .map(sl => sl.layer)

  const allSkipped = [...skipped, ...budgetExcluded]
  const uniqueSkipped = [...new Set(allSkipped)]

  if (uniqueSkipped.length > 0) {
    const footer = `---\nskipped: ${uniqueSkipped.join(', ')} (not relevant to ${signal.category} task)\n`
    // Only append footer if it fits in overall budget
    if (result.length + footer.length <= budgetChars) {
      result += footer
    }
  }

  // Final hard clamp — should not be needed but guarantees the contract
  if (result.length > budgetChars) {
    result = result.slice(0, budgetChars)
  }

  return result
}
