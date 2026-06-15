/**
 * COGNITREE — fileCollector (Phase 2)
 *
 * Input: file_changed event from tool calls
 * Logic: append file path to changed[] if not already there
 * Ignores node_modules/ and dist/ paths
 * Output: writes changed.json → { delta: true, value: ["src/query.ts", ...] }
 * NO LLM CALL — pure path tracking
 */

import * as path from 'path'
import { readLayer, writeLayer, checkpointDir } from '../../core/storage.js'

const IGNORED_PREFIXES = ['node_modules/', 'node_modules\\', 'dist/', 'dist\\']

/**
 * Check if a file path should be ignored.
 */
function shouldIgnore(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return IGNORED_PREFIXES.some(prefix =>
    normalized.startsWith(prefix) || normalized.includes(`/${prefix.replace(/\/$/, '')}/`),
  )
}

/**
 * Record a file change in the current checkpoint's changed.json.
 * Returns true if the file was appended, false if skipped (duplicate or ignored).
 */
export function collectFile(
  filePath: string,
  cognitreeDir: string,
  checkpointId: string,
  _tool: 'Write' | 'Edit' | 'MultiEdit' = 'Write',
): boolean {
  if (shouldIgnore(filePath)) return false

  const layerPath = path.join(checkpointDir(cognitreeDir, checkpointId), 'changed.json')

  const existing = readLayer<string[]>(layerPath)
  const currentPaths: string[] = existing?.value ?? []

  // De-duplicate
  if (currentPaths.includes(filePath)) return false

  const updated = [...currentPaths, filePath]
  writeLayer<string[]>(layerPath, { delta: true, value: updated })
  return true
}
