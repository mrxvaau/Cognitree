/**
 * COGNITREE — mistakeCollector.test.ts (Phase 2)
 * 4 tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { collectMistake } from '../../../src/cognitree/events/collectors/mistakeCollector.js'
import { initCognitreeDir, readLayer } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint } from '../../../src/cognitree/core/checkpoint.js'
import type { Mistake } from '../../../src/cognitree/core/types.js'

let tmpDir: string
let cognitreeDir: string
const CP = 'cp_001'

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-mistake-test-'))
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'test')
  createCheckpoint({ cognitreeDir, prompt: 'init' })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function getMistakes(): Mistake[] {
  const layer = readLayer<Mistake[]>(
    path.join(cognitreeDir, 'checkpoints', CP, 'mistakes.json'),
  )
  return layer?.value ?? []
}

describe('mistakeCollector', () => {
  it('appends structured mistake to mistakes[]', () => {
    const result = collectMistake('repeated_tool', 'Called Write 5 times', 'Check idempotency', cognitreeDir, CP)
    expect(result).not.toBeNull()
    expect(getMistakes()).toHaveLength(1)
  })

  it('written mistake has correct fields', () => {
    const result = collectMistake('same_error', 'Got 404 three times', 'Verify the endpoint', cognitreeDir, CP)
    expect(result).not.toBeNull()
    expect(result!.pattern).toBe('same_error')
    expect(result!.evidence).toBe('Got 404 three times')
    expect(result!.hint).toBe('Verify the endpoint')
    expect(typeof result!.timestamp).toBe('string')
    // Valid ISO timestamp
    expect(() => new Date(result!.timestamp).toISOString()).not.toThrow()
  })

  it('accumulates multiple mistakes', () => {
    collectMistake('repeated_tool', 'evidence1', 'hint1', cognitreeDir, CP)
    collectMistake('same_error', 'evidence2', 'hint2', cognitreeDir, CP)
    collectMistake('no_progress', 'evidence3', 'hint3', cognitreeDir, CP)

    expect(getMistakes()).toHaveLength(3)
  })

  it('returns null on empty pattern', () => {
    const result = collectMistake('', 'some evidence', 'some hint', cognitreeDir, CP)
    expect(result).toBeNull()
    expect(getMistakes()).toHaveLength(0)
  })
})
