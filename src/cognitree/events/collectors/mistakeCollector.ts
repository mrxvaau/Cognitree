/**
 * COGNITREE — mistakeCollector (Phase 2)
 *
 * Input: stuck_detected event (from stuckDetector.ts)
 * Logic: append structured mistake to mistakes[]
 * Output: writes mistakes.json → { delta: true, value: [{ pattern, evidence, hint, timestamp }] }
 * NO LLM CALL — pure structured recording
 */

import * as path from 'path'
import { readLayer, writeLayer, checkpointDir } from '../../core/storage.js'
import type { Mistake } from '../../core/types.js'

/**
 * Record a mistake in the current checkpoint's mistakes.json.
 * Returns the created Mistake object, or null if skipped.
 */
export function collectMistake(
  pattern: string,
  evidence: string,
  hint: string,
  cognitreeDir: string,
  checkpointId: string,
): Mistake | null {
  const trimmedPattern = pattern.trim()
  if (!trimmedPattern) return null

  const mistake: Mistake = {
    pattern: trimmedPattern,
    evidence: evidence.trim(),
    hint: hint.trim(),
    timestamp: new Date().toISOString(),
  }

  const layerPath = path.join(checkpointDir(cognitreeDir, checkpointId), 'mistakes.json')

  const existing = readLayer<Mistake[]>(layerPath)
  const current: Mistake[] = existing?.value ?? []

  const updated = [...current, mistake]
  writeLayer<Mistake[]>(layerPath, { delta: true, value: updated })
  return mistake
}
