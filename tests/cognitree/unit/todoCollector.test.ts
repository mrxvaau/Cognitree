/**
 * COGNITREE — todoCollector.test.ts (Phase 2)
 * 4 tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { collectTodo } from '../../../src/cognitree/events/collectors/todoCollector.js'
import { initCognitreeDir, readLayer } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint } from '../../../src/cognitree/core/checkpoint.js'

let tmpDir: string
let cognitreeDir: string
const CP = 'cp_001'

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-todo-test-'))
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'test')
  createCheckpoint({ cognitreeDir, prompt: 'init' })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function getProgress(): string[] {
  const layer = readLayer<string[]>(
    path.join(cognitreeDir, 'checkpoints', CP, 'progress.json'),
  )
  return layer?.value ?? []
}

describe('todoCollector', () => {
  it('appends todo text to progress[]', () => {
    const ok = collectTodo('Fixed MCP path', cognitreeDir, CP)
    expect(ok).toBe(true)
    expect(getProgress()).toContain('Fixed MCP path')
  })

  it('accumulates multiple todos in order', () => {
    collectTodo('Step one', cognitreeDir, CP)
    collectTodo('Step two', cognitreeDir, CP)
    collectTodo('Step three', cognitreeDir, CP)

    const progress = getProgress()
    expect(progress).toHaveLength(3)
    expect(progress[0]).toBe('Step one')
    expect(progress[1]).toBe('Step two')
    expect(progress[2]).toBe('Step three')
  })

  it('writes correct JSON format to progress.json', () => {
    collectTodo('Done something', cognitreeDir, CP)

    const layer = readLayer<string[]>(
      path.join(cognitreeDir, 'checkpoints', CP, 'progress.json'),
    )
    expect(layer).not.toBeNull()
    expect(layer!.delta).toBe(true)
    expect(Array.isArray(layer!.value)).toBe(true)
  })

  it('handles empty text gracefully', () => {
    const ok = collectTodo('', cognitreeDir, CP)
    expect(ok).toBe(false)
    expect(getProgress()).toHaveLength(0)
  })
})
