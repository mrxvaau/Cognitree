/**
 * COGNITREE — Memory Scorer (Track 6)
 *
 * Scores memory layers for relevance to the current task and
 * enforces a character budget for injection.
 *
 * Algorithm:
 * 1. Score each layer — 0.8 if in task's relevant layers, 0.1 if not, 0 if empty
 * 2. Sort by relevance descending
 * 3. Greedy fill: include layers until budget exhausted
 * 4. Partial truncation for last layer if budget partially remains
 * 5. Codebase layer gets reduced priority (0.4 instead of 0.8) — it's usually too large
 */

import type { MemoryLayer, ScoredLayer, TaskSignal } from './types.js'

// ═══════════════════════════════════════════════════════════════════════
// SCORER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Score memory layers for relevance and fill a character budget.
 *
 * @param layers - Record of layer name → raw JSON content string
 * @param signal - Task classification signal
 * @param budgetChars - Maximum characters to inject (default: 8000 ≈ 2000 tokens)
 * @returns Array of layers to include, sorted by relevance
 */
export function scoreMemoryLayers(
  layers: Partial<Record<MemoryLayer, string>>,
  signal: TaskSignal,
  budgetChars: number = 8000,
): ScoredLayer[] {
  // Step 1: Score each layer
  const scored: ScoredLayer[] = []

  for (const [layerName, content] of Object.entries(layers)) {
    const layer = layerName as MemoryLayer
    if (!content) continue

    const isRelevant = signal.relevantLayers.includes(layer)

    // Check if content is actually non-empty
    const isEmpty = isContentEmpty(content)
    if (isEmpty) continue  // Skip empty layers entirely

    // Base score: relevant = 0.8, not relevant = 0.1
    // Codebase gets reduced priority (0.4) because it's usually huge
    let baseScore: number
    if (layer === 'codebase') {
      baseScore = isRelevant ? 0.4 : 0.05
    } else {
      baseScore = isRelevant ? 0.8 : 0.1
    }

    scored.push({
      layer,
      content,
      relevanceScore: baseScore,
      charCount: content.length,
      include: false,
    })
  }

  // Step 2: Sort by relevance descending
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore)

  // Step 3: Greedy budget fill — highest relevance first
  let remaining = budgetChars
  for (const item of scored) {
    if (item.relevanceScore === 0) break  // Skip irrelevant

    if (item.charCount <= remaining) {
      // Fits entirely
      item.include = true
      remaining -= item.charCount
    } else if (remaining > 200) {
      // Partial include — truncate to fit
      const truncateAt = remaining - 50  // Reserve space for truncation marker
      item.content = item.content.substring(0, truncateAt) + '...[truncated]'
      item.charCount = item.content.length
      item.include = true
      remaining = 0
      break
    }
    // else: doesn't fit and not enough room for partial — skip
  }

  return scored
}

/**
 * Check if a JSON content string is empty (null, empty array, empty object).
 */
function isContentEmpty(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as unknown
    if (parsed === null || parsed === undefined) return true
    if (Array.isArray(parsed) && parsed.length === 0) return true

    // Check for layer-specific emptiness
    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>

      // Value layers: value is null
      if ('value' in obj && obj.value === null) return true

      // Append layers: added is empty array
      if ('added' in obj && Array.isArray(obj.added) && obj.added.length === 0) {
        // Also check updated for hybrid layers
        if ('updated' in obj && Array.isArray(obj.updated) && obj.updated.length === 0) {
          return true
        }
        if (!('updated' in obj)) {
          return true
        }
      }
    }

    return false
  } catch {
    return true  // Unparseable = empty
  }
}

/**
 * Get all included layers from scored results.
 */
export function getIncludedLayers(scored: ScoredLayer[]): ScoredLayer[] {
  return scored.filter(s => s.include)
}

/**
 * Get all excluded layers from scored results (for the skipped footer).
 */
export function getExcludedLayers(scored: ScoredLayer[]): MemoryLayer[] {
  return scored.filter(s => !s.include).map(s => s.layer)
}

export { isContentEmpty }
