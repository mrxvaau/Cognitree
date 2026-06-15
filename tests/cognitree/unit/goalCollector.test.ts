/**
 * COGNITREE — goalCollector.test.ts (Phase 2)
 * 5 tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { captureGoal } from '../../../src/cognitree/events/collectors/goalCollector.js'
import { initCognitreeDir, readLayer } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint } from '../../../src/cognitree/core/checkpoint.js'

let tmpDir: string
let cognitreeDir: string
const CP = 'cp_001'

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-goal-test-'))
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'test')
  createCheckpoint({ cognitreeDir, prompt: 'init' })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('goalCollector', () => {
  it('extracts goal from short prompt', () => {
    const ok = captureGoal('fix the MCP server', cognitreeDir, CP)
    expect(ok).toBe(true)

    const layer = readLayer<string>(path.join(cognitreeDir, 'checkpoints', CP, 'goal.json'))
    expect(layer?.value).toBe('fix the MCP server')
  })

  it('truncates goal from long prompt at 200 chars', () => {
    const longPrompt = 'a'.repeat(300)
    captureGoal(longPrompt, cognitreeDir, CP)

    const layer = readLayer<string>(path.join(cognitreeDir, 'checkpoints', CP, 'goal.json'))
    expect(layer?.value?.length).toBe(200)
  })

  it('writes correct JSON format to goal.json', () => {
    captureGoal('build the feature', cognitreeDir, CP)

    const layer = readLayer<string>(path.join(cognitreeDir, 'checkpoints', CP, 'goal.json'))
    expect(layer).not.toBeNull()
    expect(typeof layer!.delta).toBe('boolean')
    expect(layer!.delta).toBe(false)
    expect(typeof layer!.value).toBe('string')
  })

  it('only captures FIRST prompt, ignores subsequent', () => {
    captureGoal('first goal', cognitreeDir, CP)
    const skipped = captureGoal('second goal', cognitreeDir, CP)

    expect(skipped).toBe(false)
    const layer = readLayer<string>(path.join(cognitreeDir, 'checkpoints', CP, 'goal.json'))
    expect(layer?.value).toBe('first goal')
  })

  it('handles empty prompt gracefully', () => {
    const ok = captureGoal('', cognitreeDir, CP)
    expect(ok).toBe(false)

    // goal.json should still have null value (unchanged from init)
    const layer = readLayer<string>(path.join(cognitreeDir, 'checkpoints', CP, 'goal.json'))
    expect(layer?.value).toBeNull()
  })
})
