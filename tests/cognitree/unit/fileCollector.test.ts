/**
 * COGNITREE — fileCollector.test.ts (Phase 2)
 * 5 tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { collectFile } from '../../../src/cognitree/events/collectors/fileCollector.js'
import { initCognitreeDir, readLayer } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint } from '../../../src/cognitree/core/checkpoint.js'

let tmpDir: string
let cognitreeDir: string
const CP = 'cp_001'

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-file-test-'))
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'test')
  createCheckpoint({ cognitreeDir, prompt: 'init' })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function getChanged(): string[] {
  const layer = readLayer<string[]>(
    path.join(cognitreeDir, 'checkpoints', CP, 'changed.json'),
  )
  return layer?.value ?? []
}

describe('fileCollector', () => {
  it('appends new file to changed[]', () => {
    const ok = collectFile('src/query.ts', cognitreeDir, CP)
    expect(ok).toBe(true)
    expect(getChanged()).toContain('src/query.ts')
  })

  it('does NOT duplicate existing file in changed[]', () => {
    collectFile('src/query.ts', cognitreeDir, CP)
    const ok = collectFile('src/query.ts', cognitreeDir, CP)
    expect(ok).toBe(false)
    expect(getChanged()).toHaveLength(1)
  })

  it('ignores node_modules paths', () => {
    const ok = collectFile('node_modules/some-package/index.js', cognitreeDir, CP)
    expect(ok).toBe(false)
    expect(getChanged()).toHaveLength(0)
  })

  it('ignores dist/ paths', () => {
    const ok = collectFile('dist/bundle.js', cognitreeDir, CP)
    expect(ok).toBe(false)
    expect(getChanged()).toHaveLength(0)
  })

  it('handles both Write and Edit tool names', () => {
    const ok1 = collectFile('src/a.ts', cognitreeDir, CP, 'Write')
    const ok2 = collectFile('src/b.ts', cognitreeDir, CP, 'Edit')
    expect(ok1).toBe(true)
    expect(ok2).toBe(true)
    expect(getChanged()).toHaveLength(2)
  })
})
