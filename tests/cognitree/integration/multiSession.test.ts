/**
 * COGNITREE — multiSession.test.ts (Phase 4)
 * 4 tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { initCognitreeDir, readLayer, writeLayer } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint, loadCheckpoint } from '../../../src/cognitree/core/checkpoint.js'
import { createBranch } from '../../../src/cognitree/core/branch.js'

let tmpDir: string
let cognitreeDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-multi-test-'))
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'test')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('multiSession integration', () => {
  it('Loads previous checkpoint correctly', () => {
    // Session 1
    const cp1 = createCheckpoint({ cognitreeDir, prompt: 'Session 1' })
    writeLayer(path.join(cognitreeDir, 'checkpoints', cp1!.id, 'goal.json'), { delta: false, value: 'Original Goal' })
    
    // Session 2 (reload)
    const loadedCp = loadCheckpoint(cognitreeDir, cp1!.id)
    expect(loadedCp).not.toBeNull()
    expect(loadedCp?.checkpoint_id).toBe(cp1!.id)
  })

  it('Branch creation isolates new changes', () => {
    const cp1 = createCheckpoint({ cognitreeDir, prompt: 'base' })
    writeLayer(path.join(cognitreeDir, 'checkpoints', cp1!.id, 'goal.json'), { delta: false, value: 'Base Goal' })
    
    // Branch
    const branchCp = createBranch({ cognitreeDir, forkCheckpointId: cp1!.id })
    expect(branchCp).not.toBeNull()
    
    // Modify branch
    writeLayer(path.join(cognitreeDir, 'checkpoints', branchCp!.checkpointId, 'goal.json'), { delta: false, value: 'Experiment Goal' })
    
    // Base is untouched
    const baseGoal = readLayer<string>(path.join(cognitreeDir, 'checkpoints', cp1!.id, 'goal.json'))
    expect(baseGoal?.value).toBe('Base Goal')
    
    const branchGoal = readLayer<string>(path.join(cognitreeDir, 'checkpoints', branchCp!.checkpointId, 'goal.json'))
    expect(branchGoal?.value).toBe('Experiment Goal')
  })

  it('Branch inherits warnings from parent', () => {
    const cp1 = createCheckpoint({ cognitreeDir, prompt: 'base' })
    writeLayer(path.join(cognitreeDir, 'checkpoints', cp1!.id, 'warnings.json'), { delta: false, value: ['Base warning'] })
    
    const branchCp = createBranch({ cognitreeDir, forkCheckpointId: cp1!.id })
    
    const branchWarnings = readLayer<string[]>(path.join(cognitreeDir, 'checkpoints', branchCp!.checkpointId, 'warnings.json'))
    expect(branchWarnings?.value).toEqual(['Base warning'])
  })

  it('Confidence resets to 1.0 on branch', () => {
    const cp1 = createCheckpoint({ cognitreeDir, prompt: 'base' })
    
    // Manually lower confidence on base
    const metaPath = path.join(cognitreeDir, 'checkpoints', cp1!.id, 'meta.json')
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    meta.confidence = 0.4
    fs.writeFileSync(metaPath, JSON.stringify(meta))
    
    const branchCp = createBranch({ cognitreeDir, forkCheckpointId: cp1!.id })
    
    const branchMeta = JSON.parse(fs.readFileSync(path.join(cognitreeDir, 'checkpoints', branchCp!.checkpointId, 'meta.json'), 'utf8'))
    expect(branchMeta.confidence).toBe(1.0)
  })
})
