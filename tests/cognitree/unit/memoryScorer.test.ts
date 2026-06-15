/**
 * COGNITREE — memoryScorer.test.ts (Phase 3)
 * 5 tests
 */

import { describe, it, expect } from 'vitest'
import { scoreLayers, selectLayersForBudget } from '../../../src/cognitree/injection/memoryScorer.js'
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
      confidence: 1.0,
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

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('memoryScorer', () => {
  it('scores relevant layers higher than irrelevant', () => {
    const cp = makeCheckpoint({
      mistakes: { delta: false, value: [{ pattern: 'bug', evidence: 'e', hint: 'h', timestamp: '' }] },
      progress: { delta: false, value: ['some progress'] },
    })

    const scored = scoreLayers(cp, DEBUG_SIGNAL)
    const mistakeScore = scored.find(s => s.layer === 'mistakes')!.relevanceScore
    const progressScore = scored.find(s => s.layer === 'progress')!.relevanceScore

    // mistakes is in debug relevantLayers; progress is not
    expect(mistakeScore).toBeGreaterThan(progressScore)
  })

  it('scores empty layers as 0', () => {
    const cp = makeCheckpoint() // all layers empty/null

    const scored = scoreLayers(cp, DEBUG_SIGNAL)
    for (const sl of scored) {
      expect(sl.relevanceScore).toBe(0)
    }
  })

  it('fills budget greedily by score', () => {
    const cp = makeCheckpoint({
      goal:      { delta: false, value: 'Fix the MCP server' },
      mistakes:  { delta: false, value: [{ pattern: 'repeated_tool', evidence: 'e', hint: 'check idempotency', timestamp: '' }] },
      progress:  { delta: false, value: ['did something'] },
    })

    const scored = scoreLayers(cp, DEBUG_SIGNAL)
    const selected = selectLayersForBudget(scored, 500)

    // Layers with score 1.0 (relevant) should be included before score 0.3 (not relevant)
    const includedLayers = selected.filter(s => s.include).map(s => s.layer)
    const notIncluded = selected.filter(s => !s.include && s.relevanceScore === 1.0)

    // If any score-1.0 layer was excluded, all score-0.3 layers must also be excluded
    if (notIncluded.length > 0) {
      const includedLowScore = selected.filter(s => s.include && s.relevanceScore < 1.0)
      expect(includedLowScore).toHaveLength(0)
    }

    expect(includedLayers.length).toBeGreaterThan(0)
  })

  it('partial include when layer doesnt fully fit', () => {
    const longContent = 'A'.repeat(500)
    const cp = makeCheckpoint({
      goal: { delta: false, value: longContent },
    })

    const signal: TaskSignal = {
      category: 'implement',
      confidence: 0.85,
      keywords: [],
      relevantLayers: ['goal', 'decisions', 'next', 'progress'],
    }

    const scored = scoreLayers(cp, signal)
    // Budget too small for full goal content but enough for partial
    const selected = selectLayersForBudget(scored, 100)

    const goalEntry = selected.find(s => s.layer === 'goal')!
    expect(goalEntry.include).toBe(true)
    // Content should be truncated (shorter than original 500)
    expect(goalEntry.content.length).toBeLessThan(500)
  })

  it('never exceeds budget', () => {
    const cp = makeCheckpoint({
      goal:      { delta: false, value: 'A'.repeat(300) },
      progress:  { delta: false, value: ['B'.repeat(200)] },
      decisions: { delta: false, value: ['C'.repeat(100)] },
      mistakes:  { delta: false, value: [{ pattern: 'p', evidence: 'e', hint: 'D'.repeat(100), timestamp: '' }] },
    })

    const signal: TaskSignal = {
      category: 'debug',
      confidence: 0.85,
      keywords: [],
      relevantLayers: ['mistakes', 'warnings', 'changed', 'goal'],
    }

    const budget = 150
    const scored = scoreLayers(cp, signal)
    const selected = selectLayersForBudget(scored, budget)

    const totalChars = selected
      .filter(s => s.include)
      .reduce((sum, s) => sum + s.charCount, 0)

    // Total selected content chars should be within budget (overhead accounted for in selector)
    expect(totalChars).toBeLessThanOrEqual(budget)
  })
})
