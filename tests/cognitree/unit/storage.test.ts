/**
 * COGNITREE — storage.test.ts (Phase 1)
 *
 * Tests: 5 unit tests for the storage layer
 * Expected: PASS with 0 failures
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  readLayer,
  writeLayer,
  createCheckpointDir,
  initCognitreeDir,
} from '../../../src/cognitree/core/storage.js'

// ═══════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-storage-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('storage', () => {
  it('writes and reads a layer correctly', () => {
    const layerPath = path.join(tmpDir, 'goal.json')
    const layer = { delta: false, value: 'Fix the MCP connection' }

    writeLayer(layerPath, layer)

    const result = readLayer<string>(layerPath)
    expect(result).not.toBeNull()
    expect(result!.delta).toBe(false)
    expect(result!.value).toBe('Fix the MCP connection')
  })

  it('creates checkpoint directory if missing', () => {
    const cognitreeDir = path.join(tmpDir, '.cognitree')
    fs.mkdirSync(cognitreeDir, { recursive: true })
    fs.mkdirSync(path.join(cognitreeDir, 'checkpoints'), { recursive: true })

    const cpDir = createCheckpointDir(cognitreeDir, 'cp_001')

    expect(fs.existsSync(cpDir)).toBe(true)
  })

  it('never overwrites existing checkpoint', () => {
    const cognitreeDir = path.join(tmpDir, '.cognitree')
    fs.mkdirSync(cognitreeDir, { recursive: true })
    fs.mkdirSync(path.join(cognitreeDir, 'checkpoints'), { recursive: true })

    // Create the checkpoint directory first
    createCheckpointDir(cognitreeDir, 'cp_001')

    // Attempting to create it again must throw
    expect(() => createCheckpointDir(cognitreeDir, 'cp_001')).toThrow()
  })

  it('throws if writing to wrong JSON format', () => {
    const layerPath = path.join(tmpDir, 'bad.json')

    // Must throw when the object is missing required shape
    expect(() =>
      writeLayer(layerPath, { notDelta: true, noValue: 'wrong' } as any),
    ).toThrow()
  })

  it('reads null if layer file missing', () => {
    const layerPath = path.join(tmpDir, 'nonexistent.json')

    const result = readLayer<string>(layerPath)
    expect(result).toBeNull()
  })
})
