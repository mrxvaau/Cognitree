/**
 * COGNITREE — injector.test.ts (Phase 3)
 * 10 tests
 */

import { describe, it, expect } from 'vitest'
import { buildInjectString } from '../../../src/cognitree/injection/injector.js'
import type { CheckpointData } from '../../../src/cognitree/core/types.js'
import type { TaskSignal } from '../../../src/cognitree/injection/taskClassifier.js'

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function makeCheckpoint(overrides: Partial<CheckpointData> = {}): CheckpointData {
  return {
    meta: {
      checkpoint_id: 'cp_001',
      branch: 'main',
      created_at: new Date().toISOString(),
      session_model: 'test',
      turn_count: 0,
      confidence: 0.94,
    },
    goal:      { delta: false, value: null },
    progress:  { delta: false, value: [] },
    decisions: { delta: false, value: [] },
    mistakes:  { delta: false, value: [] },
    changed:   { delta: false, value: [] },
    next:      { delta: false, value: [] },
    warnings:  { delta: false, value: [] },
    ...overrides,
  }
}

const DEBUG_SIGNAL: TaskSignal = {
  category: 'debug',
  confidence: 0.85,
  keywords: ['fix'],
  relevantLayers: ['mistakes', 'warnings', 'changed', 'goal'],
}

const IMPLEMENT_SIGNAL: TaskSignal = {
  category: 'implement',
  confidence: 0.85,
  keywords: ['add'],
  relevantLayers: ['goal', 'decisions', 'next', 'progress'],
}

const UNKNOWN_SIGNAL: TaskSignal = {
  category: 'unknown',
  confidence: 0.1,
  keywords: [],
  relevantLayers: ['goal', 'progress'],
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('injector', () => {
  it('output never exceeds budgetChars', () => {
    const cp = makeCheckpoint({
      goal:     { delta: false, value: 'A'.repeat(500) },
      progress: { delta: false, value: ['B'.repeat(300)] },
      mistakes: { delta: false, value: [{ pattern: 'p', evidence: 'e', hint: 'C'.repeat(200), timestamp: '' }] },
    })
    const budget = 200
    const output = buildInjectString(cp, DEBUG_SIGNAL, budget)
    expect(output.length).toBeLessThanOrEqual(budget)
  })

  it('includes goal when available', () => {
    const cp = makeCheckpoint({
      goal: { delta: false, value: 'Fix the MCP connection' },
    })
    const output = buildInjectString(cp, IMPLEMENT_SIGNAL)
    expect(output).toContain('Fix the MCP connection')
  })

  it('skips empty layers', () => {
    const cp = makeCheckpoint({
      goal: { delta: false, value: 'Only goal set' },
      // all other layers empty
    })
    const output = buildInjectString(cp, DEBUG_SIGNAL)
    // Empty layers should not appear as "MISTAKES TO AVOID: " etc.
    expect(output).not.toContain('MISTAKES TO AVOID:')
    expect(output).not.toContain('PROGRESS:')
  })

  it('lists skipped layers at bottom', () => {
    const cp = makeCheckpoint({
      goal:     { delta: false, value: 'Fix the MCP' },
      progress: { delta: false, value: ['some progress'] },
      // progress is relevant for implement but not for debug
    })
    const output = buildInjectString(cp, DEBUG_SIGNAL)
    // The output should mention "skipped" at the bottom for non-relevant layers that have content
    expect(output).toContain('skipped')
  })

  it('debug task includes mistakes + warnings + changed', () => {
    const cp = makeCheckpoint({
      mistakes: { delta: false, value: [{ pattern: 'repeated_tool', evidence: 'e', hint: 'check idempotency', timestamp: '' }] },
      warnings: { delta: false, value: ['inject.md must be UTF-8'] },
      changed:  { delta: false, value: ['src/query.ts'] },
    })
    const output = buildInjectString(cp, DEBUG_SIGNAL)
    expect(output).toContain('MISTAKES TO AVOID')
    expect(output).toContain('WARNINGS')
    expect(output).toContain('CHANGED FILES')
  })

  it('implement task includes goal + decisions + next', () => {
    const cp = makeCheckpoint({
      goal:      { delta: false, value: 'Build the feature' },
      decisions: { delta: false, value: ['Use TypeScript'] },
      next:      { delta: false, value: ['Write tests'] },
    })
    const output = buildInjectString(cp, IMPLEMENT_SIGNAL)
    expect(output).toContain('GOAL')
    expect(output).toContain('DECISIONS')
    expect(output).toContain('NEXT')
  })

  it('unknown task includes only goal + progress (minimal)', () => {
    const cp = makeCheckpoint({
      goal:      { delta: false, value: 'Some goal' },
      progress:  { delta: false, value: ['Did something'] },
      decisions: { delta: false, value: ['A decision'] },
      mistakes:  { delta: false, value: [{ pattern: 'p', evidence: 'e', hint: 'h', timestamp: '' }] },
    })
    const output = buildInjectString(cp, UNKNOWN_SIGNAL)
    // For unknown, relevantLayers = ['goal', 'progress']
    // decisions and mistakes are not relevant (score 0.3) — they should be skipped
    expect(output).toContain('GOAL')
    expect(output).toContain('skipped')
  })

  it('truncates individual layer content to fit budget', () => {
    const longGoal = 'Fix: ' + 'X'.repeat(400)
    const cp = makeCheckpoint({
      goal: { delta: false, value: longGoal },
    })
    // Budget just enough for header + partial goal
    const budget = 100
    const output = buildInjectString(cp, IMPLEMENT_SIGNAL, budget)

    expect(output.length).toBeLessThanOrEqual(budget)
    // Goal should appear but truncated
    expect(output).toContain('GOAL')
  })

  it('header line always included regardless of budget', () => {
    const cp = makeCheckpoint()
    // Very small budget — smaller than most content, but header should still be there
    const output = buildInjectString(cp, UNKNOWN_SIGNAL, 80)
    expect(output).toContain('[COGNITREE')
    expect(output).toContain('cp_001')
  })

  it('returns empty string when no .cognitree/ exists', () => {
    const output = buildInjectString(null, UNKNOWN_SIGNAL)
    expect(output).toBe('')
  })

  it('header contains checkpoint id, branch, and confidence', () => {
    const cp = makeCheckpoint()
    const output = buildInjectString(cp, DEBUG_SIGNAL)
    expect(output).toContain('cp_001')
    expect(output).toContain('main')
    expect(output).toContain('confidence')
    expect(output).toContain('0.94')
  })
})
