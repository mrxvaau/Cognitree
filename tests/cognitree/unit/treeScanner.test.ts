/**
 * COGNITREE — treeScanner.test.ts
 * 9 tests
 *
 * Tests scanSourceTree() and diffTrees() in isolation using a real
 * temp filesystem (no mocks). Each test sets up its own file structure.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { scanSourceTree, diffTrees } from '../../../src/cognitree/codebase/treeScanner.js'
import type { SourceTree } from '../../../src/cognitree/codebase/treeScanner.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-tree-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ─── helpers ────────────────────────────────────────────────────────────

function write(relPath: string, content: string): void {
  const full = path.join(tmpDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
}

describe('treeScanner', () => {
  it('scans source files and ignores node_modules', () => {
    write('src/index.ts', 'export {}')
    write('node_modules/lodash/index.js', 'module.exports = {}')

    const tree = scanSourceTree(tmpDir)

    const paths = tree.files.map(f => f.path)
    expect(paths).toContain('src/index.ts')
    expect(paths.some(p => p.includes('node_modules'))).toBe(false)
  })

  it('ignores .cognitree directory', () => {
    write('src/main.ts', 'console.log(1)')
    write('.cognitree/active.json', '{"checkpoint_id":null}')
    write('.cognitree/tree.json', '{}')

    const tree = scanSourceTree(tmpDir)

    const paths = tree.files.map(f => f.path)
    expect(paths.some(p => p.startsWith('.cognitree'))).toBe(false)
    expect(paths).toContain('src/main.ts')
  })

  it('ignores bun.lock and package-lock.json', () => {
    write('bun.lock', 'lockfile content')
    write('package-lock.json', '{}')
    write('src/app.ts', 'export {}')

    const tree = scanSourceTree(tmpDir)

    const paths = tree.files.map(f => f.path)
    expect(paths).not.toContain('bun.lock')
    expect(paths).not.toContain('package-lock.json')
    expect(paths).toContain('src/app.ts')
  })

  it('only includes allowed extensions', () => {
    write('src/main.ts', 'export {}')
    write('src/style.css', '.foo {}')
    write('src/image.png', 'fake-binary')
    write('README.md', '# Hello')
    write('config.yaml', 'key: value')

    const tree = scanSourceTree(tmpDir)

    const paths = tree.files.map(f => f.path)
    expect(paths).toContain('src/main.ts')
    expect(paths).toContain('README.md')
    expect(paths).toContain('config.yaml')
    expect(paths).not.toContain('src/style.css')
    expect(paths).not.toContain('src/image.png')
  })

  it('produces stable sorted output', () => {
    // Write in reverse-alpha order
    write('src/z.ts', 'z')
    write('src/a.ts', 'a')
    write('src/m.ts', 'm')

    const tree = scanSourceTree(tmpDir)
    const paths = tree.files.map(f => f.path)

    expect(paths).toEqual([...paths].sort())
  })

  it('detects added files in diff', () => {
    write('src/old.ts', 'old content')
    const prev = scanSourceTree(tmpDir)

    write('src/new.ts', 'new content')
    const curr = scanSourceTree(tmpDir)

    const diff = diffTrees(prev, curr)
    expect(diff.added).toContain('src/new.ts')
    expect(diff.modified).toHaveLength(0)
    expect(diff.deleted).toHaveLength(0)
  })

  it('detects modified files in diff (hash change)', () => {
    write('src/app.ts', 'version 1')
    const prev = scanSourceTree(tmpDir)

    write('src/app.ts', 'version 2 — changed content')
    const curr = scanSourceTree(tmpDir)

    const diff = diffTrees(prev, curr)
    expect(diff.modified).toContain('src/app.ts')
    expect(diff.added).toHaveLength(0)
    expect(diff.deleted).toHaveLength(0)
  })

  it('detects deleted files in diff', () => {
    write('src/keep.ts', 'keep this')
    write('src/remove.ts', 'will be deleted')
    const prev = scanSourceTree(tmpDir)

    fs.rmSync(path.join(tmpDir, 'src/remove.ts'))
    const curr = scanSourceTree(tmpDir)

    const diff = diffTrees(prev, curr)
    expect(diff.deleted).toContain('src/remove.ts')
    expect(diff.added).toHaveLength(0)
    expect(diff.modified).toHaveLength(0)
  })

  it('returns empty diff when nothing changed', () => {
    write('src/stable.ts', 'no changes')
    const prev = scanSourceTree(tmpDir)
    const curr = scanSourceTree(tmpDir)

    const diff = diffTrees(prev, curr)
    expect(diff.added).toHaveLength(0)
    expect(diff.modified).toHaveLength(0)
    expect(diff.deleted).toHaveLength(0)
  })
})
