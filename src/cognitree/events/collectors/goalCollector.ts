/**
 * COGNITREE — goalCollector (Phase 2)
 *
 * Input: first_prompt event
 * Logic: use first 200 chars of user message as goal
 * Output: writes goal.json → { delta: false, value: "..." }
 * NO LLM CALL — pure string extraction
 * Only captures FIRST prompt; ignores subsequent calls if goal already set.
 */

import * as path from 'path'
import { readLayer, writeLayer, checkpointDir } from '../../core/storage.js'

const MAX_GOAL_LENGTH = 200

/**
 * Extract and store the goal from a user prompt.
 * Returns true if goal was written, false if skipped (already set or empty).
 */
export function captureGoal(
  content: string,
  cognitreeDir: string,
  checkpointId: string,
): boolean {
  const goal = content.trim().slice(0, MAX_GOAL_LENGTH)
  if (!goal) return false

  const layerPath = path.join(checkpointDir(cognitreeDir, checkpointId), 'goal.json')

  // Only capture FIRST prompt — skip if goal already set
  const existing = readLayer<string>(layerPath)
  if (existing !== null && existing.value !== null) {
    return false
  }

  writeLayer<string>(layerPath, { delta: false, value: goal })
  return true
}
