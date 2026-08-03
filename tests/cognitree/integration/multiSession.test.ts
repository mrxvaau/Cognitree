/**
 * COGNITREE — multiSession.test.ts (Phase 4)
 * 5 tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { initCognitreeDir, readLayer, writeLayer, writeActive } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint, loadCheckpoint } from '../../../src/cognitree/core/checkpoint.js'
import { createBranch } from '../../../src/cognitree/core/branch.js'
import { getCognitreeInjection } from '../../../src/cognitree/manager/sessionLifecycle.js'

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

  it('getCognitreeInjection falls back to inject.md when active checkpoint is empty', async () => {
    // Step 1: create cp_001 with a real goal (simulates completed session)
    const cp1 = createCheckpoint({ cognitreeDir, prompt: 'fix MCP connection' })
    expect(cp1).not.toBeNull()
    writeLayer(
      path.join(cognitreeDir, 'checkpoints', cp1!.id, 'goal.json'),
      { delta: false, value: 'fix the broken MCP connection in .mcp.json' },
    )

    // Step 2: write inject.md with cp_001's goal (simulates what onSessionEnd writes)
    const injectContent = `[COGNITREE — ${cp1!.id} · main · confidence 1.00]\nGOAL: fix the broken MCP connection in .mcp.json\n`
    fs.writeFileSync(path.join(cognitreeDir, 'inject.md'), injectContent, 'utf8')

    // Step 3: create cp_002 (empty seal) and set it as active in active.json
    // This exactly mirrors what onSessionEnd does: createCheckpoint creates the seal
    // and writeActive sets it as active for the next session.
    const cp2 = createCheckpoint({ cognitreeDir, prompt: 'Session ended', parentId: cp1!.id })
    expect(cp2).not.toBeNull()
    // active.json now points to cp_002 (empty seal) — written by createCheckpoint internally

    // Step 4: call getCognitreeInjection with tmpDir as cwd
    // It must detect cp_002 has no useful data and fall back to inject.md
    const result = await getCognitreeInjection(tmpDir)

    // Assertions
    expect(result).not.toBeNull()
    expect(result).toContain('fix the broken MCP connection in .mcp.json')
    expect(result).toContain(cp1!.id)  // inject.md references the session CP, not the seal

    // Confirm cp_002 really is empty (no goal) — the fallback was necessary
    const cp2Goal = readLayer<string>(path.join(cognitreeDir, 'checkpoints', cp2!.id, 'goal.json'))
    expect(cp2Goal?.value).toBeNull()
  })
})
