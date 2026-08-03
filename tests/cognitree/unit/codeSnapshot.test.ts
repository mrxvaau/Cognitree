/**
 * COGNITREE — codeSnapshot.test.ts
 * 6 tests
 *
 * Tests snapshot capture, manifest format, MAX_FILE_SIZE skip,
 * deduplication, and read/exists helpers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { initCognitreeDir } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint } from '../../../src/cognitree/core/checkpoint.js'
import {
  captureSnapshot,
  readSnapshot,
  snapshotExists,
  MAX_FILE_SIZE,
} from '../../../src/cognitree/codebase/codeSnapshot.js'
import { listAllBlobHashes } from '../../../src/cognitree/codebase/blobStore.js'

let tmpDir: string
let cognitreeDir: string
let projectDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-snap-test-'))
  projectDir = tmpDir
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'snap-test')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeFile(relPath: string, content: string): void {
  const full = path.join(projectDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
}

function createCp(): string {
  const cp = createCheckpoint({ cognitreeDir, prompt: 'test' })
  return cp!.id
}

describe('codeSnapshot', () => {
  it('captures snapshot with correct file count', () => {
    writeFile('src/app.ts', 'export const x = 1')
    writeFile('src/utils.ts', 'export const y = 2')
    writeFile('package.json', '{"name":"test"}')

    const cpId = createCp()
    const manifest = captureSnapshot(cognitreeDir, projectDir, cpId)

    expect(manifest.file_count).toBe(3)
    expect(manifest.checkpoint_id).toBe(cpId)
    expect(manifest.version).toBe(1)
    expect(Object.keys(manifest.files)).toHaveLength(3)
    expect(manifest.files['src/app.ts']).toBeDefined()
    expect(manifest.files['src/utils.ts']).toBeDefined()
    expect(manifest.files['package.json']).toBeDefined()
  })

  it('snapshot.json written to checkpoint directory', () => {
    writeFile('src/main.ts', 'console.log("hi")')

    const cpId = createCp()
    captureSnapshot(cognitreeDir, projectDir, cpId)

    const snapPath = path.join(cognitreeDir, 'checkpoints', cpId, 'snapshot.json')
    expect(fs.existsSync(snapPath)).toBe(true)

    const parsed = JSON.parse(fs.readFileSync(snapPath, 'utf8'))
    expect(parsed.version).toBe(1)
    expect(parsed.checkpoint_id).toBe(cpId)
  })

  it('skips files larger than MAX_FILE_SIZE', () => {
    writeFile('src/small.ts', 'export {}')
    // Create a file just over the limit
    writeFile('src/huge.json', 'x'.repeat(MAX_FILE_SIZE + 1))

    const cpId = createCp()
    const manifest = captureSnapshot(cognitreeDir, projectDir, cpId)

    expect(manifest.skipped).toContain('src/huge.json')
    expect(manifest.files['src/huge.json']).toBeDefined() // hash is tracked
    expect(manifest.files['src/small.ts']).toBeDefined()
  })

  it('blobs are deduplicated across files with same content', () => {
    const sameContent = 'export const shared = true'
    writeFile('src/copy1.ts', sameContent)
    writeFile('src/copy2.ts', sameContent)
    writeFile('src/copy3.ts', sameContent)

    const cpId = createCp()
    const manifest = captureSnapshot(cognitreeDir, projectDir, cpId)

    // All 3 files should have the same hash
    expect(manifest.files['src/copy1.ts']).toBe(manifest.files['src/copy2.ts'])
    expect(manifest.files['src/copy2.ts']).toBe(manifest.files['src/copy3.ts'])

    // Only 1 unique blob stored
    const allBlobs = listAllBlobHashes(cognitreeDir)
    expect(allBlobs.size).toBe(1)
  })

  it('readSnapshot returns null for missing checkpoint', () => {
    expect(readSnapshot(cognitreeDir, 'cp_999')).toBeNull()
  })

  it('snapshotExists returns correct boolean', () => {
    writeFile('src/app.ts', 'test')
    const cpId = createCp()

    expect(snapshotExists(cognitreeDir, cpId)).toBe(false)
    captureSnapshot(cognitreeDir, projectDir, cpId)
    expect(snapshotExists(cognitreeDir, cpId)).toBe(true)
  })
})
