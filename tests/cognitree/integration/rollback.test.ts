/**
 * COGNITREE — rollback.test.ts
 * 9 integration tests
 *
 * Tests the full rollback engine: file restoration from blobs,
 * file deletion, safety checkpoint creation, build dir cleanup,
 * missing blob handling, active.json updates, and round-trips.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { initCognitreeDir, readActive } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint } from '../../../src/cognitree/core/checkpoint.js'
import { captureSnapshot, readSnapshot } from '../../../src/cognitree/codebase/codeSnapshot.js'
import { rollbackToCheckpoint } from '../../../src/cognitree/codebase/rollback.js'

let tmpDir: string
let cognitreeDir: string
let projectDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-rollback-test-'))
  projectDir = tmpDir
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'rollback-test')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeFile(relPath: string, content: string): void {
  const full = path.join(projectDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
}

function readFile(relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(projectDir, relPath), 'utf8')
  } catch {
    return null
  }
}

function createCpAndSnapshot(prompt: string): string {
  const cp = createCheckpoint({ cognitreeDir, prompt })!
  captureSnapshot(cognitreeDir, projectDir, cp.id)
  return cp.id
}

describe('rollback', () => {
  it('restores files to target checkpoint state', () => {
    // cp_001: file has version 1
    writeFile('src/app.ts', 'version 1')
    const cp1 = createCpAndSnapshot('v1')

    // cp_002: file changed to version 2
    writeFile('src/app.ts', 'version 2')
    createCpAndSnapshot('v2')

    // Current state: file is version 2
    expect(readFile('src/app.ts')).toBe('version 2')

    // Rollback to cp_001
    const result = rollbackToCheckpoint(cognitreeDir, projectDir, cp1, {
      createSafetyCheckpoint: false,
    })

    expect(result.success).toBe(true)
    expect(result.filesRestored).toBeGreaterThanOrEqual(1)
    expect(readFile('src/app.ts')).toBe('version 1')
  })

  it('deletes files that did not exist at target checkpoint', () => {
    // cp_001: only one file
    writeFile('src/original.ts', 'original')
    const cp1 = createCpAndSnapshot('original')

    // cp_002: added a new file
    writeFile('src/new-file.ts', 'added later')
    createCpAndSnapshot('with new file')

    expect(readFile('src/new-file.ts')).toBe('added later')

    // Rollback to cp_001
    const result = rollbackToCheckpoint(cognitreeDir, projectDir, cp1, {
      createSafetyCheckpoint: false,
    })

    expect(result.success).toBe(true)
    expect(result.filesDeleted).toBeGreaterThanOrEqual(1)
    expect(readFile('src/new-file.ts')).toBeNull()
    expect(readFile('src/original.ts')).toBe('original')
  })

  it('creates safety checkpoint before rollback', () => {
    writeFile('src/app.ts', 'v1')
    const cp1 = createCpAndSnapshot('v1')

    writeFile('src/app.ts', 'v2')
    createCpAndSnapshot('v2')

    const result = rollbackToCheckpoint(cognitreeDir, projectDir, cp1, {
      createSafetyCheckpoint: true,
    })

    expect(result.success).toBe(true)
    expect(result.safetyCheckpoint).not.toBeNull()

    // Safety checkpoint should have a snapshot
    const safetyCp = result.safetyCheckpoint!
    const snap = readSnapshot(cognitreeDir, safetyCp)
    expect(snap).not.toBeNull()
    expect(snap!.file_count).toBeGreaterThan(0)
  })

  it('deletes build directories on rollback', () => {
    writeFile('src/app.ts', 'code')
    const cp1 = createCpAndSnapshot('v1')

    // Create build directories
    fs.mkdirSync(path.join(projectDir, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'dist', 'bundle.js'), 'built output')
    fs.mkdirSync(path.join(projectDir, 'build'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'build', 'output.js'), 'built output')

    const result = rollbackToCheckpoint(cognitreeDir, projectDir, cp1, {
      createSafetyCheckpoint: false,
    })

    expect(result.success).toBe(true)
    expect(result.buildDirsDeleted).toContain('dist')
    expect(result.buildDirsDeleted).toContain('build')
    expect(fs.existsSync(path.join(projectDir, 'dist'))).toBe(false)
    expect(fs.existsSync(path.join(projectDir, 'build'))).toBe(false)
  })

  it('handles missing blobs gracefully', () => {
    writeFile('src/app.ts', 'code')
    const cp1 = createCpAndSnapshot('v1')

    writeFile('src/app.ts', 'modified code')
    createCpAndSnapshot('v2')

    // Corrupt the blob store by deleting all blobs
    const blobsDir = path.join(cognitreeDir, 'blobs')
    if (fs.existsSync(blobsDir)) {
      fs.rmSync(blobsDir, { recursive: true, force: true })
    }

    const result = rollbackToCheckpoint(cognitreeDir, projectDir, cp1, {
      createSafetyCheckpoint: false,
    })

    expect(result.success).toBe(true)
    expect(result.blobsMissing.length).toBeGreaterThan(0)
  })

  it('updates active.json to target checkpoint', () => {
    writeFile('src/app.ts', 'v1')
    const cp1 = createCpAndSnapshot('v1')

    writeFile('src/app.ts', 'v2')
    createCpAndSnapshot('v2')

    rollbackToCheckpoint(cognitreeDir, projectDir, cp1, {
      createSafetyCheckpoint: false,
    })

    const active = readActive(cognitreeDir)
    expect(active).not.toBeNull()
    expect(active!.checkpoint_id).toBe(cp1)
  })

  it('skips unchanged files (no unnecessary writes)', () => {
    writeFile('src/stable.ts', 'never changes')
    writeFile('src/changes.ts', 'v1')
    const cp1 = createCpAndSnapshot('v1')

    writeFile('src/changes.ts', 'v2')
    createCpAndSnapshot('v2')

    const result = rollbackToCheckpoint(cognitreeDir, projectDir, cp1, {
      createSafetyCheckpoint: false,
    })

    expect(result.success).toBe(true)
    // stable.ts didn't change → should not be in filesRestored
    // Only changes.ts was different
    expect(result.filesRestored).toBe(1)
    expect(readFile('src/stable.ts')).toBe('never changes')
    expect(readFile('src/changes.ts')).toBe('v1')
  })

  it('returns error for checkpoint without snapshot', () => {
    writeFile('src/app.ts', 'code')
    // Create checkpoint but DON'T capture snapshot
    const cp = createCheckpoint({ cognitreeDir, prompt: 'no snapshot' })!

    const result = rollbackToCheckpoint(cognitreeDir, projectDir, cp.id, {
      createSafetyCheckpoint: false,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('No snapshot found')
  })

  it('full round-trip: capture → modify → rollback → verify', () => {
    // Set up a multi-file project at cp_001
    writeFile('src/main.ts', 'main v1')
    writeFile('src/utils.ts', 'utils v1')
    writeFile('src/config.json', '{"version": 1}')
    const cp1 = createCpAndSnapshot('v1 stable')

    // cp_002: extensive changes
    writeFile('src/main.ts', 'main v2 — completely rewritten')
    writeFile('src/utils.ts', 'utils v2 — refactored')
    writeFile('src/config.json', '{"version": 2}')
    writeFile('src/new-feature.ts', 'brand new file')
    fs.mkdirSync(path.join(projectDir, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'dist', 'out.js'), 'built')
    createCpAndSnapshot('v2 broken')

    // Verify current state is v2
    expect(readFile('src/main.ts')).toBe('main v2 — completely rewritten')
    expect(readFile('src/new-feature.ts')).toBe('brand new file')

    // ROLLBACK to v1
    const result = rollbackToCheckpoint(cognitreeDir, projectDir, cp1)

    expect(result.success).toBe(true)

    // Code restored to v1
    expect(readFile('src/main.ts')).toBe('main v1')
    expect(readFile('src/utils.ts')).toBe('utils v1')
    expect(readFile('src/config.json')).toBe('{"version": 1}')

    // New file from v2 deleted
    expect(readFile('src/new-feature.ts')).toBeNull()

    // Build dir deleted
    expect(fs.existsSync(path.join(projectDir, 'dist'))).toBe(false)

    // Safety checkpoint exists
    expect(result.safetyCheckpoint).not.toBeNull()

    // Active points to cp_001
    const active = readActive(cognitreeDir)
    expect(active!.checkpoint_id).toBe(cp1)
  })
})
