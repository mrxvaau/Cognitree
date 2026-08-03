/**
 * COGNITREE — blobStore.test.ts
 * 8 tests
 *
 * Tests the content-addressable blob store: SHA-256 hashing, gzip
 * compression round-trip, deduplication, fan-out layout, and diagnostics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  hashContent,
  writeBlob,
  readBlob,
  hasBlob,
  deleteBlob,
  listAllBlobHashes,
  getBlobStoreSizeBytes,
} from '../../../src/cognitree/codebase/blobStore.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-blob-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('blobStore', () => {
  it('writes blob and returns SHA-256 hash', () => {
    const content = Buffer.from('hello world')
    const hash = writeBlob(tmpDir, content)

    // SHA-256 hash is 64 hex chars
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)

    // Hash matches hashContent directly
    expect(hash).toBe(hashContent(content))
  })

  it('reads back blob with correct content', () => {
    const original = Buffer.from('TypeScript is great for building memory systems')
    const hash = writeBlob(tmpDir, original)

    const restored = readBlob(tmpDir, hash)
    expect(restored).not.toBeNull()
    expect(restored!.toString()).toBe(original.toString())
  })

  it('deduplicates identical content (no double write)', () => {
    const content = Buffer.from('same content everywhere')

    const hash1 = writeBlob(tmpDir, content)
    const hash2 = writeBlob(tmpDir, content)

    // Same hash
    expect(hash1).toBe(hash2)

    // Only one blob file on disk
    const allHashes = listAllBlobHashes(tmpDir)
    expect(allHashes.size).toBe(1)
  })

  it('hasBlob returns true for existing blob', () => {
    const content = Buffer.from('test content')
    const hash = writeBlob(tmpDir, content)

    expect(hasBlob(tmpDir, hash)).toBe(true)
  })

  it('hasBlob returns false for missing blob', () => {
    expect(hasBlob(tmpDir, 'deadbeef'.repeat(8))).toBe(false)
  })

  it('readBlob returns null for missing hash', () => {
    const result = readBlob(tmpDir, 'nonexistent'.repeat(6))
    expect(result).toBeNull()
  })

  it('content survives gzip round-trip', () => {
    // Test with various content types
    const texts = [
      '',                              // empty
      'a',                             // single char
      'x'.repeat(100000),             // large
      'function foo() { return 42 }', // code
      '日本語テキスト',                  // unicode
    ]

    for (const text of texts) {
      const content = Buffer.from(text)
      const hash = writeBlob(tmpDir, content)
      const restored = readBlob(tmpDir, hash)!
      expect(restored.toString()).toBe(text)
    }
  })

  it('fan-out uses first 2 chars of hash', () => {
    const content = Buffer.from('fan-out test')
    const hash = writeBlob(tmpDir, content)

    const fanoutDir = path.join(tmpDir, 'blobs', hash.slice(0, 2))
    expect(fs.existsSync(fanoutDir)).toBe(true)

    const blobFile = path.join(fanoutDir, `${hash}.gz`)
    expect(fs.existsSync(blobFile)).toBe(true)
  })
})
