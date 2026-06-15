/**
 * COGNITREE — decisionCollector (Phase 2)
 *
 * Input: assistant message text
 * Logic: regex match for decision phrases, confidence > 0.7 threshold
 * Output: appends to decisions[] in decisions.json
 * NO LLM CALL — pure pattern matching
 *
 * Decision phrases detected:
 *   "I decided"    → confidence 0.9
 *   "I chose"      → confidence 0.9
 *   "I will use"   → confidence 0.85
 *   "better to use"→ confidence 0.8
 *   "instead of"   → confidence 0.75
 */

import * as path from 'path'
import { readLayer, writeLayer, checkpointDir } from '../../core/storage.js'

// ═══════════════════════════════════════════════════════════════════════
// DECISION PATTERNS
// ═══════════════════════════════════════════════════════════════════════

interface DecisionPattern {
  regex: RegExp
  confidence: number
}

const DECISION_PATTERNS: DecisionPattern[] = [
  { regex: /I decided[^.!?]*/gi, confidence: 0.9 },
  { regex: /I chose[^.!?]*/gi, confidence: 0.9 },
  { regex: /I will use[^.!?]*/gi, confidence: 0.85 },
  { regex: /better to use[^.!?]*/gi, confidence: 0.8 },
  { regex: /instead of[^.!?]*/gi, confidence: 0.75 },
]

const CONFIDENCE_THRESHOLD = 0.7

// ═══════════════════════════════════════════════════════════════════════
// DETECTION
// ═══════════════════════════════════════════════════════════════════════

export interface DetectedDecision {
  text: string
  confidence: number
}

/**
 * Extract decision phrases from assistant message text.
 * Returns matched decisions with their confidence scores.
 * Pure function — no I/O.
 */
export function detectDecisions(text: string): DetectedDecision[] {
  const raw: DetectedDecision[] = []

  for (const { regex, confidence } of DECISION_PATTERNS) {
    if (confidence < CONFIDENCE_THRESHOLD) continue
    // Reset regex lastIndex for each call
    regex.lastIndex = 0
    const matches = text.match(regex)
    if (matches) {
      for (const match of matches) {
        const trimmed = match.trim()
        if (trimmed) {
          raw.push({ text: trimmed, confidence })
        }
      }
    }
  }

  // Deduplicate: drop any entry whose text is a substring of a longer entry.
  // Prevents multi-pattern sentences from writing both the full phrase and
  // the overlapping fragment (e.g. "I decided X instead of Y" should NOT
  // also write "instead of Y" as a separate decision).
  const results = raw.filter(
    (m, i) =>
      !raw.some(
        (other, j) =>
          j !== i && other.text.includes(m.text) && other.text.length > m.text.length,
      ),
  )

  return results
}

// ═══════════════════════════════════════════════════════════════════════
// COLLECT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detect decisions in assistant text and write them to decisions.json.
 * Returns the number of decisions written.
 */
export function collectDecisions(
  text: string,
  cognitreeDir: string,
  checkpointId: string,
): number {
  const detected = detectDecisions(text)
  if (detected.length === 0) return 0

  const layerPath = path.join(checkpointDir(cognitreeDir, checkpointId), 'decisions.json')

  const existing = readLayer<string[]>(layerPath)
  const current: string[] = existing?.value ?? []

  const toAdd = detected.map(d => d.text)
  const updated = [...current, ...toAdd]
  writeLayer<string[]>(layerPath, { delta: true, value: updated })

  return detected.length
}
