/**
 * COGNITREE — taskClassifier.test.ts (Phase 2)
 * 7 tests
 */

import { describe, it, expect } from 'vitest'
import { classifyTask } from '../../../src/cognitree/injection/taskClassifier.js'

describe('taskClassifier', () => {
  it('classifies "fix the bug" as debug', () => {
    const signal = classifyTask('fix the bug in the auth module')
    expect(signal.category).toBe('debug')
    expect(signal.confidence).toBeGreaterThan(0.5)
  })

  it('classifies "add a new feature" as implement', () => {
    const signal = classifyTask('add a new feature for user login')
    expect(signal.category).toBe('implement')
    expect(signal.confidence).toBeGreaterThan(0.5)
  })

  it('classifies "what does this do" as understand', () => {
    const signal = classifyTask('what does this function do exactly')
    expect(signal.category).toBe('understand')
    expect(signal.confidence).toBeGreaterThan(0.5)
  })

  it('classifies "run the tests" as test', () => {
    const signal = classifyTask('run the tests and show me the output')
    expect(signal.category).toBe('test')
    expect(signal.confidence).toBeGreaterThan(0.5)
  })

  it('classifies "hello" as unknown with low confidence', () => {
    const signal = classifyTask('hello')
    expect(signal.category).toBe('unknown')
    expect(signal.confidence).toBeLessThan(0.5)
  })

  it('returns correct relevantLayers per category', () => {
    const debug = classifyTask('fix the crash')
    expect(debug.relevantLayers).toContain('mistakes')
    expect(debug.relevantLayers).toContain('warnings')

    const implement = classifyTask('implement the new endpoint')
    expect(implement.relevantLayers).toContain('goal')
    expect(implement.relevantLayers).toContain('next')
  })

  it('never throws on empty string', () => {
    expect(() => classifyTask('')).not.toThrow()
    const signal = classifyTask('')
    expect(signal.category).toBe('unknown')
    expect(signal.confidence).toBe(0.0)
  })
})
