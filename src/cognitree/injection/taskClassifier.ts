/**
 * COGNITREE — taskClassifier (Phase 2)
 *
 * Classify a user prompt into one of 9 task categories.
 * Pure pattern matching — NO LLM CALL.
 *
 * Categories: debug | implement | refactor | understand | git | test | config | review | unknown
 */

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export type TaskCategory =
  | 'debug'
  | 'implement'
  | 'refactor'
  | 'understand'
  | 'git'
  | 'test'
  | 'config'
  | 'review'
  | 'unknown'

export type MemoryLayer =
  | 'goal'
  | 'progress'
  | 'decisions'
  | 'mistakes'
  | 'changed'
  | 'next'
  | 'warnings'

export interface TaskSignal {
  category: TaskCategory
  confidence: number
  keywords: string[]
  relevantLayers: MemoryLayer[]
}

// ═══════════════════════════════════════════════════════════════════════
// RELEVANT LAYERS PER CATEGORY
// ═══════════════════════════════════════════════════════════════════════

const LAYERS_BY_CATEGORY: Record<TaskCategory, MemoryLayer[]> = {
  debug:      ['mistakes', 'warnings', 'changed', 'goal'],
  implement:  ['goal', 'decisions', 'next', 'progress'],
  refactor:   ['changed', 'decisions', 'goal'],
  understand: ['goal', 'progress', 'decisions'],
  git:        ['changed', 'goal'],
  test:       ['goal', 'mistakes', 'progress'],
  config:     ['goal', 'warnings', 'decisions'],
  review:     ['goal', 'decisions', 'progress'],
  unknown:    ['goal', 'progress'],
}

// ═══════════════════════════════════════════════════════════════════════
// KEYWORD PATTERNS
// ═══════════════════════════════════════════════════════════════════════

interface CategoryPattern {
  category: TaskCategory
  keywords: string[]
  confidence: number
}

const PATTERNS: CategoryPattern[] = [
  {
    category: 'debug',
    keywords: ['fix', 'bug', 'error', 'broken', 'crash', 'failing', 'wrong', 'issue', 'problem', 'not working', 'why is'],
    confidence: 0.85,
  },
  {
    category: 'implement',
    keywords: ['add', 'implement', 'create', 'build', 'new feature', 'write', 'make', 'develop'],
    confidence: 0.85,
  },
  {
    category: 'refactor',
    keywords: ['refactor', 'clean up', 'cleanup', 'restructure', 'reorganize', 'simplify', 'improve', 'optimize'],
    confidence: 0.85,
  },
  {
    category: 'understand',
    keywords: ['what does', 'how does', 'explain', 'understand', 'what is', 'how is', 'tell me', 'describe', 'why does'],
    confidence: 0.85,
  },
  {
    category: 'git',
    keywords: ['commit', 'push', 'pull', 'merge', 'branch', 'rebase', 'git', 'stash', 'diff'],
    confidence: 0.9,
  },
  {
    category: 'test',
    keywords: ['test', 'spec', 'run tests', 'testing', 'vitest', 'jest', 'assert', 'coverage'],
    confidence: 0.9,
  },
  {
    category: 'config',
    keywords: ['config', 'configure', 'setup', 'setting', 'env', 'environment', '.env', 'tsconfig', 'package.json'],
    confidence: 0.85,
  },
  {
    category: 'review',
    keywords: ['review', 'look at', 'check', 'audit', 'inspect', 'read through'],
    confidence: 0.8,
  },
]

// ═══════════════════════════════════════════════════════════════════════
// CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Classify a user prompt into a task category.
 * Never throws — returns 'unknown' with low confidence on any failure.
 */
export function classifyTask(prompt: string): TaskSignal {
  try {
    if (!prompt || !prompt.trim()) {
      return {
        category: 'unknown',
        confidence: 0.0,
        keywords: [],
        relevantLayers: LAYERS_BY_CATEGORY.unknown,
      }
    }

    const lower = prompt.toLowerCase()
    let bestMatch: CategoryPattern | null = null
    let bestMatchCount = 0
    let matchedKeywords: string[] = []

    for (const pattern of PATTERNS) {
      const hits = pattern.keywords.filter(kw => lower.includes(kw))
      if (hits.length > bestMatchCount) {
        bestMatchCount = hits.length
        bestMatch = pattern
        matchedKeywords = hits
      }
    }

    if (!bestMatch || bestMatchCount === 0) {
      return {
        category: 'unknown',
        confidence: 0.1,
        keywords: [],
        relevantLayers: LAYERS_BY_CATEGORY.unknown,
      }
    }

    return {
      category: bestMatch.category,
      confidence: bestMatch.confidence,
      keywords: matchedKeywords,
      relevantLayers: LAYERS_BY_CATEGORY[bestMatch.category],
    }
  } catch {
    return {
      category: 'unknown',
      confidence: 0.0,
      keywords: [],
      relevantLayers: LAYERS_BY_CATEGORY.unknown,
    }
  }
}
