/**
 * COGNITREE — checkpoint.test.ts (Phase 1)
 *
 * Tests: 6 unit tests for checkpoint create/load/list
 * Expected: PASS with 0 failures
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  createCheckpoint,
  loadCheckpoint,
  listCheckpoints,
} from '../../../src/cognitree/core/checkpoint.js'
import { initCognitreeDir, readLayer } from '../../../src/cognitree/core/storage.js'

// ═══════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════

let tmpDir: string
let cognitreeDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-checkpoint-test-'))
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'test-project')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('checkpoint', () => {
  it('creates cp_001 for new project', () => {
    const result = createCheckpoint({
      cognitreeDir,
      prompt: 'Initial checkpoint',
    })

    expect(result).not.toBeNull()
    expect(result!.id).toBe('cp_001')
    expect(result!.branch).toBe('main')

    // Directory must exist
    const cpDir = path.join(cognitreeDir, 'checkpoints', 'cp_001')
    expect(fs.existsSync(cpDir)).toBe(true)
  })

  it('creates cp_002 after cp_001 exists', () => {
    createCheckpoint({ cognitreeDir, prompt: 'First' })
    const second = createCheckpoint({ cognitreeDir, prompt: 'Second' })

    expect(second).not.toBeNull()
    expect(second!.id).toBe('cp_002')
  })

  it('loads checkpoint by id', () => {
    createCheckpoint({ cognitreeDir, prompt: 'Load me' })

    const meta = loadCheckpoint(cognitreeDir, 'cp_001')
    expect(meta).not.toBeNull()
    expect(meta!.checkpoint_id).toBe('cp_001')
    expect(meta!.branch).toBe('main')
    expect(meta!.confidence).toBe(1.0)
  })

  it('lists all checkpoints in order', () => {
    createCheckpoint({ cognitreeDir, prompt: 'A' })
    createCheckpoint({ cognitreeDir, prompt: 'B' })
    createCheckpoint({ cognitreeDir, prompt: 'C' })

    const list = listCheckpoints(cognitreeDir)
    expect(list).toHaveLength(3)
    expect(list[0].id).toBe('cp_001')
    expect(list[1].id).toBe('cp_002')
    expect(list[2].id).toBe('cp_003')
  })

  it('creates branch checkpoint correctly', () => {
    // Create a main checkpoint first
    createCheckpoint({ cognitreeDir, prompt: 'Main base' })

    // Create a branch checkpoint manually using branch option
    const branchResult = createCheckpoint({
      cognitreeDir,
      prompt: 'Branch start',
      branch: 'branch-a',
      parentId: 'cp_001',
    })

    expect(branchResult).not.toBeNull()
    expect(branchResult!.branch).toBe('branch-a')
    // Branch checkpoints get letter suffix
    expect(branchResult!.id).toMatch(/^cp_\d{3}a$/)
  })

  it('meta.json written with correct shape', () => {
    createCheckpoint({ cognitreeDir, prompt: 'Meta test', sessionModel: 'test-model' })

    const meta = loadCheckpoint(cognitreeDir, 'cp_001')
    expect(meta).not.toBeNull()
    expect(meta!.checkpoint_id).toBe('cp_001')
    expect(meta!.branch).toBe('main')
    expect(typeof meta!.created_at).toBe('string')
    expect(meta!.session_model).toBe('test-model')
    expect(meta!.turn_count).toBe(0)
    expect(meta!.confidence).toBe(1.0)

    // Validate it's valid ISO timestamp
    expect(() => new Date(meta!.created_at).toISOString()).not.toThrow()

    // Validate layer files were written with correct { delta, value } shape
    const goalLayer = readLayer<string>(
      path.join(cognitreeDir, 'checkpoints', 'cp_001', 'goal.json'),
    )
    expect(goalLayer).not.toBeNull()
    expect(typeof goalLayer!.delta).toBe('boolean')
    expect('value' in goalLayer!).toBe(true)
  })
})
