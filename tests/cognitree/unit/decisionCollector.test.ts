/**
 * COGNITREE — decisionCollector.test.ts (Phase 2)
 * 5 tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  detectDecisions,
  collectDecisions,
} from '../../../src/cognitree/events/collectors/decisionCollector.js'
import { initCognitreeDir, readLayer } from '../../../src/cognitree/core/storage.js'
import { createCheckpoint } from '../../../src/cognitree/core/checkpoint.js'

let tmpDir: string
let cognitreeDir: string
const CP = 'cp_001'

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognitree-decision-test-'))
  cognitreeDir = path.join(tmpDir, '.cognitree')
  initCognitreeDir(cognitreeDir, 'test')
  createCheckpoint({ cognitreeDir, prompt: 'init' })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('decisionCollector', () => {
  it('detects "I decided" pattern', () => {
    const results = detectDecisions('I decided to use TypeScript for better safety.')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].text).toMatch(/I decided/i)
    expect(results[0].confidence).toBeGreaterThanOrEqual(0.7)
  })

  it('detects "I chose" pattern', () => {
    const results = detectDecisions('I chose Vitest over Jest for speed.')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].text).toMatch(/I chose/i)
  })

  it('does NOT match generic text', () => {
    const results = detectDecisions('Hello world, how are you today?')
    expect(results).toHaveLength(0)
  })

  it('writes correct JSON format to decisions.json', () => {
    collectDecisions('I will use bun instead of node.', cognitreeDir, CP)

    const layer = readLayer<string[]>(
      path.join(cognitreeDir, 'checkpoints', CP, 'decisions.json'),
    )
    expect(layer).not.toBeNull()
    expect(layer!.delta).toBe(true)
    expect(Array.isArray(layer!.value)).toBe(true)
    expect(layer!.value!.length).toBeGreaterThan(0)
  })

  it('handles multiple decision phrases in one message', () => {
    const text = 'I decided to use TypeScript. I chose Vitest for tests. I will use bun to run it.'
    const count = collectDecisions(text, cognitreeDir, CP)
    expect(count).toBeGreaterThanOrEqual(2)

    const layer = readLayer<string[]>(
      path.join(cognitreeDir, 'checkpoints', CP, 'decisions.json'),
    )
    expect(layer!.value!.length).toBeGreaterThanOrEqual(2)
  })

  it('deduplicates overlapping matches — keeps longest when one contains another', () => {
    // "I decided to use X instead of Y" can match BOTH:
    //   "I decided to use X instead of Y"  (full phrase)
    //   "instead of Y"                      (fragment)
    // The dedup logic must keep only the longer containing match.
    const text = 'I decided to use TypeScript instead of JavaScript.'
    const matches = detectDecisions(text)

    // Should not contain a fragment that is a substring of a longer match
    for (let i = 0; i < matches.length; i++) {
      for (let j = 0; j < matches.length; j++) {
        if (i === j) continue
        // If matches[j].text contains matches[i].text, matches[i] should not exist
        if (matches[j].text.includes(matches[i].text) && matches[j].text.length > matches[i].text.length) {
          expect(false).toBe(true) // Should never reach here after dedup
        }
      }
    }

    // The full phrase should be present
    expect(matches.some(m => m.text.includes('I decided'))).toBe(true)
  })
})
