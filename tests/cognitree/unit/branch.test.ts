/**
 * COGNITREE — branch.test.ts (Phase 1)
 *
 * Tests: 4 unit tests for branch creation
 * Expected: PASS with 0 failures
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createBranch, listBranches } from '../../../src/cognitree/core/branch.js'
import { createCheckpoint } from '../../../src/cognitree/core/checkpoint.js'
import { initCognitreeDir, readLayer } from '../../../src/cognitree/core/storage.js'

// ═══════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════

let tmpDir: string
let cognitreeDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-branch-test-'))
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'test-project')

  // Create a base checkpoint to fork from
  createCheckpoint({ cognitreeDir, prompt: 'Base checkpoint' })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('branch', () => {
  it('creates branch-a from cp_001', () => {
    const result = createBranch({ cognitreeDir, forkCheckpointId: 'cp_001' })

    expect(result).not.toBeNull()
    expect(result!.branchName).toBe('branch-a')
    // ID should have 'a' suffix
    expect(result!.checkpointId).toMatch(/^cp_\d{3}a$/)

    // Branch checkpoint directory must exist
    const cpDir = path.join(cognitreeDir, 'checkpoints', result!.checkpointId)
    expect(fs.existsSync(cpDir)).toBe(true)
  })

  it('returns null if fork checkpoint does not exist', () => {
    const result = createBranch({ cognitreeDir, forkCheckpointId: 'cp_999' })
    expect(result).toBeNull()
  })

  it('inherits warnings from fork checkpoint', () => {
    // Write warnings to cp_001
    const warningsPath = path.join(cognitreeDir, 'checkpoints', 'cp_001', 'warnings.json')
    const warnings = { delta: false, value: ['inject.md must be UTF-8', 'Never skip tests'] }
    fs.writeFileSync(warningsPath, JSON.stringify(warnings, null, 2), 'utf8')

    const result = createBranch({ cognitreeDir, forkCheckpointId: 'cp_001' })

    expect(result).not.toBeNull()
    expect(result!.inheritedWarnings).toBe(2)

    // Read the branch checkpoint's warnings.json and verify inheritance
    const branchWarningsPath = path.join(
      cognitreeDir,
      'checkpoints',
      result!.checkpointId,
      'warnings.json',
    )
    const branchWarnings = readLayer<string[]>(branchWarningsPath)
    expect(branchWarnings).not.toBeNull()
    expect(branchWarnings!.value).toHaveLength(2)
    expect(branchWarnings!.value).toContain('inject.md must be UTF-8')
  })

  it('confidence is 1.0 on new branch regardless of fork confidence', () => {
    // Create branch
    const result = createBranch({ cognitreeDir, forkCheckpointId: 'cp_001' })
    expect(result).not.toBeNull()

    // Read meta.json from branch checkpoint
    const metaPath = path.join(
      cognitreeDir,
      'checkpoints',
      result!.checkpointId,
      'meta.json',
    )
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    expect(meta.confidence).toBe(1.0)
  })
})
