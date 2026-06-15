/**
 * Live integration test — exercises the full Cognitree flow:
 * 1. Init .cognitree/ directory (initCognitreeDir)
 * 2. Create checkpoint (core/checkpoint.ts createCheckpoint)
 * 3. onSessionStart → MemoryManager listeners registered
 * 4. first_prompt event → goal.json captured
 * 5. file_changed events → changed.json updated
 * 6. decision_made event → decisions.json updated
 * 7. getCognitreeInjection → smart inject string
 * 8. Full checkpoint dir listing
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { initCognitreeDir, checkpointDir } from '../../src/cognitree/core/storage.js'
import { createCheckpoint } from '../../src/cognitree/core/checkpoint.js'
import { cognitreeEventBus } from '../../src/cognitree/events/eventBus.js'
import { onSessionStart, getCognitreeInjection, setCurrentUserPrompt } from '../../src/cognitree/manager/sessionLifecycle.js'
import { isCognitreeProject, loadCognitreeState } from '../../src/cognitree/startup.js'

describe('Cognitree Live Flow', () => {
  let tmpDir: string
  let cognitreeDir: string

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-live-'))
    cognitreeDir = path.join(tmpDir, '.cognitree')
  })

  afterAll(() => {
    cognitreeEventBus.removeAllListeners()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('STEP 1 — Init cognitree directory', () => {
    initCognitreeDir(cognitreeDir, 'live-test')

    console.log('\n=== STEP 1: Init cognitree ===')
    console.log('active.json exists:', fs.existsSync(path.join(cognitreeDir, 'active.json')))
    console.log('tree.json exists:', fs.existsSync(path.join(cognitreeDir, 'tree.json')))
    console.log('checkpoints/ exists:', fs.existsSync(path.join(cognitreeDir, 'checkpoints')))

    const active = JSON.parse(fs.readFileSync(path.join(cognitreeDir, 'active.json'), 'utf8'))
    console.log('active.json:', JSON.stringify(active, null, 2))

    const tree = JSON.parse(fs.readFileSync(path.join(cognitreeDir, 'tree.json'), 'utf8'))
    console.log('tree.json:', JSON.stringify(tree, null, 2))

    expect(fs.existsSync(path.join(cognitreeDir, 'active.json'))).toBe(true)
    expect(fs.existsSync(path.join(cognitreeDir, 'tree.json'))).toBe(true)
    expect(fs.existsSync(path.join(cognitreeDir, 'checkpoints'))).toBe(true)
  })

  it('STEP 2 — Create checkpoint cp_001', () => {
    const cp = createCheckpoint({ cognitreeDir, prompt: 'what files are in src/cognitree/' })

    console.log('\n=== STEP 2: Create checkpoint ===')
    console.log('result:', JSON.stringify(cp, null, 2))
    expect(cp).not.toBeNull()
    expect(cp!.id).toBe('cp_001')

    console.log('checkpoint_id:', cp!.id)
    console.log('cp_001/ exists:', fs.existsSync(checkpointDir(cognitreeDir, cp!.id)))

    const active = JSON.parse(fs.readFileSync(path.join(cognitreeDir, 'active.json'), 'utf8'))
    console.log('active.json (updated):', JSON.stringify(active, null, 2))

    expect(active.checkpoint_id).toBe('cp_001')
  })

  it('STEP 3 — onSessionStart initializes MemoryManager', () => {
    console.log('\n=== STEP 3: Session Start ===')
    const result = onSessionStart(tmpDir)
    console.log('onSessionStart result:', JSON.stringify(result))
    console.log('isCognitreeProject:', isCognitreeProject(tmpDir))
    console.log('loadCognitreeState:', JSON.stringify(loadCognitreeState(tmpDir), null, 2))

    expect(result.activeCheckpointId).toBe('cp_001')
  })

  it('STEP 4 — first_prompt event → goal.json captured', () => {
    console.log('\n=== STEP 4: First Prompt → Goal ===')

    const userPrompt = 'what files are in src/cognitree/'
    setCurrentUserPrompt(userPrompt)
    cognitreeEventBus.emit({ type: 'first_prompt', content: userPrompt })

    const goalPath = path.join(checkpointDir(cognitreeDir, 'cp_001'), 'goal.json')
    console.log('goal.json exists:', fs.existsSync(goalPath))

    const goal = JSON.parse(fs.readFileSync(goalPath, 'utf8'))
    console.log('goal.json:', JSON.stringify(goal, null, 2))

    expect(goal.value).toBe('what files are in src/cognitree/')
    expect(goal.delta).toBe(false)
  })

  it('STEP 5 — file_changed events → changed.json updated', () => {
    console.log('\n=== STEP 5: File Changed ===')

    cognitreeEventBus.emit({ type: 'file_changed', path: 'src/query.ts', tool: 'Edit' })
    cognitreeEventBus.emit({ type: 'file_changed', path: 'src/main.tsx', tool: 'Write' })

    const changedPath = path.join(checkpointDir(cognitreeDir, 'cp_001'), 'changed.json')
    console.log('changed.json exists:', fs.existsSync(changedPath))

    const changed = JSON.parse(fs.readFileSync(changedPath, 'utf8'))
    console.log('changed.json:', JSON.stringify(changed, null, 2))

    expect(changed.value).toContain('src/query.ts')
    expect(changed.value).toContain('src/main.tsx')
    expect(changed.delta).toBe(true)
  })

  it('STEP 6 — decision_made event → decisions.json updated', () => {
    console.log('\n=== STEP 6: Decision Made ===')

    cognitreeEventBus.emit({ type: 'decision_made', text: 'I decided to use a singleton pattern for the event bus instead of dependency injection' })

    const decisionsPath = path.join(checkpointDir(cognitreeDir, 'cp_001'), 'decisions.json')
    console.log('decisions.json exists:', fs.existsSync(decisionsPath))

    const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'))
    console.log('decisions.json:', JSON.stringify(decisions, null, 2))

    expect(decisions.value.length).toBeGreaterThan(0)
    expect(decisions.value[0]).toContain('I decided')
  })

  it('STEP 7 — getCognitreeInjection returns smart inject', async () => {
    console.log('\n=== STEP 7: Smart Inject ===')

    const injection = await getCognitreeInjection(tmpDir)
    console.log('injection is null:', injection === null)
    console.log('injection length:', injection?.length ?? 0)
    console.log('--- inject output ---')
    console.log(injection ?? '(null)')
    console.log('--- end inject ---')

    if (injection) {
      console.log('Contains goal text:', injection.includes('what files'))
      console.log('Contains changed files:', injection.includes('src/query.ts'))
      console.log('Contains decisions:', injection.includes('decided'))
    }

    expect(injection).not.toBeNull()
  })

  it('STEP 8 — Full checkpoint directory listing', () => {
    console.log('\n=== STEP 8: Checkpoint dir listing ===')
    const cpDir = checkpointDir(cognitreeDir, 'cp_001')
    const files = fs.readdirSync(cpDir)
    console.log('Files in cp_001/:', files)

    for (const f of files) {
      const content = fs.readFileSync(path.join(cpDir, f), 'utf8')
      console.log(`\n--- ${f} ---`)
      console.log(content)
    }

    expect(files).toContain('meta.json')
    expect(files).toContain('goal.json')
    expect(files).toContain('changed.json')
    expect(files).toContain('decisions.json')
  })
})
