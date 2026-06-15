/**
 * COGNITREE — recovery.test.ts (Phase 4)
 * 4 tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { MockLLM } from '../mocks/mockLLM.js'
import { initCognitreeDir, readLayer, writeLayer } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint, loadCheckpoint } from '../../../src/cognitree/core/checkpoint.js'
import { collectMistake } from '../../../src/cognitree/events/collectors/mistakeCollector.js'
import { buildInjectString } from '../../../src/cognitree/injection/injector.js'
import { classifyTask } from '../../../src/cognitree/injection/taskClassifier.js'
import type { Mistake } from '../../../src/cognitree/core/types.js'

let tmpDir: string
let cognitreeDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-recovery-test-'))
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'test')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('recovery integration', () => {
  it('Simulates stuck state and collects mistake', () => {
    const cp = createCheckpoint({ cognitreeDir, prompt: 'fix infinite loop' })
    
    // Simulate detecting a stuck state
    const mistake = collectMistake('looping tool', 'Called read 10 times', 'Add logic to stop', cognitreeDir, cp!.id)
    
    expect(mistake).not.toBeNull()
    const mistakesLayer = readLayer<Mistake[]>(path.join(cognitreeDir, 'checkpoints', cp!.id, 'mistakes.json'))
    expect(mistakesLayer?.value?.length).toBe(1)
    expect(mistakesLayer?.value?.[0].pattern).toBe('looping tool')
  })

  it('Reconstructs memory from valid checkpoint', () => {
    // We emulate reconstructing memory by checking if loadCheckpoint properly restores meta
    // In Phase 1 `checkpoint.ts`, loading gets the base meta.
    const cp = createCheckpoint({ cognitreeDir, prompt: 'base' })
    writeLayer(path.join(cognitreeDir, 'checkpoints', cp!.id, 'goal.json'), { delta: false, value: 'Base Goal' })
    
    const loadedCp = loadCheckpoint(cognitreeDir, cp!.id)
    expect(loadedCp).not.toBeNull()
    
    const goal = readLayer<string>(path.join(cognitreeDir, 'checkpoints', cp!.id, 'goal.json'))
    expect(goal?.value).toBe('Base Goal')
  })

  it('Injection correctly drops low relevance layers on recovery', () => {
    const cp = createCheckpoint({ cognitreeDir, prompt: 'base' })
    
    writeLayer(path.join(cognitreeDir, 'checkpoints', cp!.id, 'goal.json'), { delta: false, value: 'Original goal' })
    writeLayer(path.join(cognitreeDir, 'checkpoints', cp!.id, 'progress.json'), { delta: false, value: ['did something'] })
    writeLayer(path.join(cognitreeDir, 'checkpoints', cp!.id, 'mistakes.json'), { delta: false, value: [{ pattern: 'error', hint: 'fix it' }] })
    
    // Load state
    const goal = readLayer<string>(path.join(cognitreeDir, 'checkpoints', cp!.id, 'goal.json'))
    const progress = readLayer<string[]>(path.join(cognitreeDir, 'checkpoints', cp!.id, 'progress.json'))
    const mistakes = readLayer<Mistake[]>(path.join(cognitreeDir, 'checkpoints', cp!.id, 'mistakes.json'))
    
    const cpData = {
      meta: { ...cp!, checkpoint_id: cp!.id, confidence: 0.5 } as any,
      goal: goal || { delta: false, value: null },
      progress: progress || { delta: false, value: [] },
      decisions: { delta: false, value: [] },
      mistakes: mistakes || { delta: false, value: [] },
      changed: { delta: false, value: [] },
      next: { delta: false, value: [] },
      warnings: { delta: false, value: [] }
    }
    
    // Debug task cares about mistakes, warnings, changed, goal
    // It does NOT care about progress.
    const signal = classifyTask('fix the bug')
    const injectStr = buildInjectString(cpData, signal)
    
    expect(injectStr).toContain('MISTAKES TO AVOID:')
    expect(injectStr).toContain('GOAL:')
    expect(injectStr).not.toContain('PROGRESS:')
    expect(injectStr).toContain('skipped: progress')
  })

  it('Handles empty/null checkpoint gracefully', () => {
    // If we try to load a non-existent checkpoint
    const loaded = loadCheckpoint(cognitreeDir, 'non_existent_id')
    expect(loaded).toBeNull()
    
    // If we try to inject with null checkpoint
    const signal = classifyTask('implement feature')
    const injectStr = buildInjectString(null, signal)
    expect(injectStr).toBe('')
  })
})
