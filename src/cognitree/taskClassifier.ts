/**
 * COGNITREE — Task Classifier (Track 6)
 *
 * Classifies user prompts into task categories to determine which
 * memory layers are relevant. Uses keyword matching with confidence scoring.
 *
 * 9 categories, each mapping to a set of keywords and relevant memory layers.
 * Confidence = matched_keywords / total_keywords_in_category.
 * Highest confidence wins; ties broken by more matches.
 */

import type { MemoryLayer, TaskCategory, TaskSignal } from './types.js'

// ═══════════════════════════════════════════════════════════════════════
// TASK PATTERNS — keywords → relevant layers
// ═══════════════════════════════════════════════════════════════════════

interface TaskPattern {
  keywords: string[]
  layers: MemoryLayer[]
}

const TASK_PATTERNS: Record<TaskCategory, TaskPattern> = {
  debug: {
    keywords: [
      'error', 'bug', 'broken', 'fix', 'fail', 'crash', 'why', 'wrong',
      'issue', 'problem', 'not working', 'exception', 'undefined', 'null',
      'trace', 'stack', 'segfault', 'panic', 'hang', 'timeout', 'leak',
    ],
    layers: ['mistakes', 'warnings', 'changed', 'decisions'],
  },
  implement: {
    keywords: [
      'build', 'create', 'add', 'implement', 'make', 'write', 'new',
      'feature', 'develop', 'port', 'wire', 'integrate', 'hook', 'connect',
    ],
    layers: ['goal', 'decisions', 'progress', 'next', 'codebase'],
  },
  refactor: {
    keywords: [
      'refactor', 'clean', 'restructure', 'improve', 'optimize', 'simplify',
      'reorganize', 'move', 'rename', 'extract', 'split', 'merge', 'deduplicate',
    ],
    layers: ['decisions', 'changed', 'warnings', 'codebase'],
  },
  understand: {
    keywords: [
      'what', 'how', 'explain', 'summarize', 'describe', 'understand',
      'show me', 'tell me', 'overview', 'architecture', 'diagram', 'map',
    ],
    layers: ['goal', 'progress', 'decisions', 'codebase'],
  },
  git: {
    keywords: [
      'commit', 'branch', 'diff', 'history', 'merge', 'push', 'pull',
      'stash', 'rebase', 'blame', 'log', 'cherry-pick', 'tag',
    ],
    layers: ['changed', 'progress', 'goal'],
  },
  test: {
    keywords: [
      'test', 'spec', 'coverage', 'unit', 'integration', 'vitest', 'jest',
      'assert', 'mock', 'stub', 'fixture', 'e2e', 'snapshot', 'regression',
    ],
    layers: ['mistakes', 'changed', 'decisions', 'warnings'],
  },
  config: {
    keywords: [
      'setup', 'install', 'config', 'env', 'settings', '.env', 'configure',
      'init', 'bootstrap', 'deploy', 'ci', 'docker', 'package.json', 'tsconfig',
    ],
    layers: ['decisions', 'warnings', 'mistakes'],
  },
  review: {
    keywords: [
      'review', 'audit', 'check', 'look at', 'inspect', 'analyze', 'assess',
      'evaluate', 'validate', 'verify', 'quality', 'lint', 'security',
    ],
    layers: ['decisions', 'changed', 'warnings', 'mistakes', 'goal'],
  },
  unknown: {
    keywords: [],
    layers: ['goal', 'progress'],
  },
}

// ═══════════════════════════════════════════════════════════════════════
// CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Classify a user prompt into a task category.
 *
 * Algorithm:
 * 1. Lowercase the prompt
 * 2. For each category, count keyword matches
 * 3. Normalize: confidence = matches / total keywords in category
 * 4. Pick highest confidence; unknown if < 0.05
 * 5. Return TaskSignal with category, confidence, matched keywords, relevant layers
 */
export function classifyTask(userPrompt: string): TaskSignal {
  if (!userPrompt || userPrompt.trim().length === 0) {
    return {
      category: 'unknown',
      confidence: 0,
      keywords: [],
      relevantLayers: TASK_PATTERNS.unknown.layers,
    }
  }

  const lower = userPrompt.toLowerCase()

  let bestCategory: TaskCategory = 'unknown'
  let bestConfidence = 0
  let bestKeywords: string[] = []

  for (const [category, pattern] of Object.entries(TASK_PATTERNS)) {
    if (category === 'unknown') continue

    const matchedKeywords: string[] = []
    for (const keyword of pattern.keywords) {
      if (lower.includes(keyword)) {
        matchedKeywords.push(keyword)
      }
    }

    if (matchedKeywords.length === 0) continue

    const confidence = matchedKeywords.length / pattern.keywords.length

    if (
      confidence > bestConfidence ||
      (confidence === bestConfidence && matchedKeywords.length > bestKeywords.length)
    ) {
      bestCategory = category as TaskCategory
      bestConfidence = confidence
      bestKeywords = matchedKeywords
    }
  }

  // Minimum confidence threshold
  if (bestConfidence < 0.05) {
    bestCategory = 'unknown'
    bestConfidence = 0
    bestKeywords = []
  }

  return {
    category: bestCategory,
    confidence: bestConfidence,
    keywords: bestKeywords,
    relevantLayers: TASK_PATTERNS[bestCategory].layers,
  }
}

export { TASK_PATTERNS }
