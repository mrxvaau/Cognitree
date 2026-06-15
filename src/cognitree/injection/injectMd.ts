/**
 * COGNITREE — injectMd (Phase 3)
 *
 * Write and read inject.md — the disk-persisted inject string.
 * Always uses explicit UTF-8 encoding.
 */

import * as fs from 'fs'
import * as path from 'path'

const INJECT_FILENAME = 'inject.md'

/**
 * Write the inject string to .cognitree/inject.md.
 * Creates cognitreeDir if missing.
 */
export function writeInjectMd(cognitreeDir: string, content: string): void {
  fs.mkdirSync(cognitreeDir, { recursive: true })
  const filePath = path.join(cognitreeDir, INJECT_FILENAME)
  fs.writeFileSync(filePath, content, { encoding: 'utf8' })
}

/**
 * Read .cognitree/inject.md.
 * Returns null if file missing or unreadable — never throws.
 */
export function readInjectMd(cognitreeDir: string): string | null {
  try {
    const filePath = path.join(cognitreeDir, INJECT_FILENAME)
    return fs.readFileSync(filePath, { encoding: 'utf8' })
  } catch {
    return null
  }
}

/**
 * Delete .cognitree/inject.md if it exists.
 */
export function clearInjectMd(cognitreeDir: string): void {
  try {
    const filePath = path.join(cognitreeDir, INJECT_FILENAME)
    fs.unlinkSync(filePath)
  } catch {
    // Already gone — no-op
  }
}
