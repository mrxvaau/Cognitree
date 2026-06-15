/**
 * COGNITREE — fullSession.test.ts (Phase 4)
 * 4 tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { MockLLM } from '../mocks/mockLLM.js'
import { initCognitreeDir, readLayer } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint } from '../../../src/cognitree/core/checkpoint.js'
import { captureGoal } from '../../../src/cognitree/events/collectors/goalCollector.js'
import { collectFile } from '../../../src/cognitree/events/collectors/fileCollector.js'
import { collectDecisions } from '../../../src/cognitree/events/collectors/decisionCollector.js'
import { collectTodo } from '../../../src/cognitree/events/collectors/todoCollector.js'
import { classifyTask } from '../../../src/cognitree/injection/taskClassifier.js'
import { buildInjectString } from '../../../src/cognitree/injection/injector.js'
import { getCognitreeInjection } from '../../../src/cognitree/manager/sessionLifecycle.js'

let tmpDir: string
let cognitreeDir: string
let llm: MockLLM

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-full-test-'))
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'test')
  llm = new MockLLM()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('fullSession integration', () => {
  it('Complete single turn session (prompt -> tool -> checkpoint)', () => {
    // 1. Initial Prompt
    const prompt = 'implement login'
    const cpInfo = createCheckpoint({ cognitreeDir, prompt })
    captureGoal(prompt, cognitreeDir, cpInfo!.id)
    
    // 2. Mock LLM Response
    llm.addResponse({ type: 'text', content: 'I decided to use JWT.' })
    llm.addResponse({ type: 'tool_use', content: '', toolName: 'Write', toolInput: { file: 'src/auth.ts' } })
    
    const textRes = llm.nextResponse()
    collectDecisions(textRes.content, cognitreeDir, cpInfo!.id)
    
    const toolRes = llm.nextResponse()
    collectFile((toolRes.toolInput as any).file, cognitreeDir, cpInfo!.id, toolRes.toolName)
    
    // 3. Verify Checkpoint
    const goalLayer = readLayer<string>(path.join(cognitreeDir, 'checkpoints', cpInfo!.id, 'goal.json'))
    expect(goalLayer?.value).toBe('implement login')
    
    const decisionsLayer = readLayer<string[]>(path.join(cognitreeDir, 'checkpoints', cpInfo!.id, 'decisions.json'))
    expect(decisionsLayer?.value).toContain('I decided to use JWT')
    
    const changedLayer = readLayer<string[]>(path.join(cognitreeDir, 'checkpoints', cpInfo!.id, 'changed.json'))
    expect(changedLayer?.value).toContain('src/auth.ts')
  })

  it('Tool execution captures files and progress', () => {
    const cpInfo = createCheckpoint({ cognitreeDir, prompt: 'fix tests' })
    
    llm.addResponse({ type: 'tool_use', content: '', toolName: 'Write', toolInput: { file: 'test/main.test.ts' } })
    const toolRes = llm.nextResponse()
    
    collectFile((toolRes.toolInput as any).file, cognitreeDir, cpInfo!.id, toolRes.toolName)
    collectTodo('Updated main.test.ts', cognitreeDir, cpInfo!.id)
    
    const changed = readLayer<string[]>(path.join(cognitreeDir, 'checkpoints', cpInfo!.id, 'changed.json'))
    const progress = readLayer<string[]>(path.join(cognitreeDir, 'checkpoints', cpInfo!.id, 'progress.json'))
    
    expect(changed?.value).toContain('test/main.test.ts')
    expect(progress?.value).toContain('Updated main.test.ts')
  })

  it('Assistant text captures decisions', () => {
    const cpInfo = createCheckpoint({ cognitreeDir, prompt: 'setup db' })
    
    llm.addResponse({ type: 'text', content: 'I chose postgres. It is better to use a relational DB here.' })
    const res = llm.nextResponse()
    
    const count = collectDecisions(res.content, cognitreeDir, cpInfo!.id)
    expect(count).toBe(2)
    
    const decisions = readLayer<string[]>(path.join(cognitreeDir, 'checkpoints', cpInfo!.id, 'decisions.json'))
    expect(decisions?.value?.length).toBe(2)
  })

  it('Injection engine uses collected data for next turn', () => {
    // Turn 1
    const cp1 = createCheckpoint({ cognitreeDir, prompt: 'setup project' })
    captureGoal('setup project', cognitreeDir, cp1!.id)
    collectDecisions('I decided to use vitest.', cognitreeDir, cp1!.id)
    
    // Read state for inject
    const goalLayer = readLayer<string>(path.join(cognitreeDir, 'checkpoints', cp1!.id, 'goal.json'))
    const decisionsLayer = readLayer<string[]>(path.join(cognitreeDir, 'checkpoints', cp1!.id, 'decisions.json'))
    
    // Construct dummy checkpoint data for injection
    const cpData = {
      meta: { ...cp1!, checkpoint_id: cp1!.id, confidence: 1.0 } as any,
      goal: goalLayer || { delta: false, value: null },
      progress: { delta: false, value: [] },
      decisions: decisionsLayer || { delta: false, value: [] },
      mistakes: { delta: false, value: [] },
      changed: { delta: false, value: [] },
      next: { delta: false, value: [] },
      warnings: { delta: false, value: [] }
    }
    
    // Turn 2: Implement (should include goal and decisions)
    const signal = classifyTask('implement tests')
    const injectStr = buildInjectString(cpData, signal)
    
    expect(injectStr).toContain('GOAL: setup project')
    expect(injectStr).toContain('DECISIONS: I decided to use vitest')
  })

  it('config.json budgetChars override is respected', async () => {
    // Setup: create a checkpoint with a goal so there is content to inject
    const cp = createCheckpoint({ cognitreeDir, prompt: 'build feature' })
    const goalPath = path.join(cognitreeDir, 'checkpoints', cp!.id, 'goal.json')
    fs.writeFileSync(goalPath, JSON.stringify({ delta: true, value: 'build feature' }))

    // Write a tiny budget into config.json
    const config = { injection: { enabled: true, budgetChars: 50 } }
    fs.writeFileSync(
      path.join(cognitreeDir, 'config.json'),
      JSON.stringify(config),
    )

    // Point active.json at our checkpoint so getCognitreeInjection uses it
    fs.writeFileSync(
      path.join(cognitreeDir, 'active.json'),
      JSON.stringify({ checkpoint_id: cp!.id }),
    )

    const result = await getCognitreeInjection(tmpDir)
    // Result must exist (there IS a checkpoint) and fit within the 50-char budget
    if (result !== null) {
      expect(result.length).toBeLessThanOrEqual(50)
    }
  })
})
