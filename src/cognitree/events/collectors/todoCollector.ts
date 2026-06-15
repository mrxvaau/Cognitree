/**
 * COGNITREE — todoCollector (Phase 2)
 *
 * Input: todo_completed event
 * Logic: append todo text to progress[]
 * Output: writes progress.json → { delta: true, value: ["Fixed auth", ...] }
 * NO LLM CALL — pure list append
 */

import * as path from 'path'
import { readLayer, writeLayer, checkpointDir } from '../../core/storage.js'

/**
 * Record a completed todo in the current checkpoint's progress.json.
 * Returns true if written, false if skipped (empty text).
 */
export function collectTodo(
  text: string,
  cognitreeDir: string,
  checkpointId: string,
): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  const layerPath = path.join(checkpointDir(cognitreeDir, checkpointId), 'progress.json')

  const existing = readLayer<string[]>(layerPath)
  const current: string[] = existing?.value ?? []

  const updated = [...current, trimmed]
  writeLayer<string[]>(layerPath, { delta: true, value: updated })
  return true
}
