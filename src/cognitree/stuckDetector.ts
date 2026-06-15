/**
 * COGNITREE — Stuck Detector
 *
 * Track 7: Self-Healing Agent Loop
 *
 * Detects 4 stuck patterns in the agent loop:
 *   1. repeated_tool    — same tool + same input hash 3+ times in last 6 turns
 *   2. repeated_error   — same error message 3+ times in last 6 turns
 *   3. circular_reasoning — assistant message >85% similar to 2 turns ago
 *   4. empty_progress   — 10+ turns with zero file changes
 *
 * Stateless across sessions — new instance per queryLoop invocation.
 * Zero external dependencies.
 */

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export type StuckPattern =
  | 'repeated_tool'
  | 'repeated_error'
  | 'circular_reasoning'
  | 'tool_chain_loop'
  | 'empty_progress'

export interface StuckSignal {
  detected: boolean
  pattern: StuckPattern | null
  evidence: string
  turnCount: number
  recoveryHint: string
}

export interface ToolCallRecord {
  toolName: string
  inputHash: string
  result: string
  turnIndex: number
}

// ═══════════════════════════════════════════════════════════════════════
// SIMILARITY (zero-dep)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Simple word-overlap similarity (Jaccard index on words > 3 chars).
 * No external dependencies — pure string math.
 */
function cosineSimilaritySimple(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3),
  )
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3),
  )
  if (wordsA.size === 0 && wordsB.size === 0) return 0

  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return union === 0 ? 0 : intersection / union
}

// ═══════════════════════════════════════════════════════════════════════
// INPUT HASHING (zero-dep)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Simple deterministic hash of JSON.stringify(input).
 * djb2 algorithm — fast, no crypto deps.
 */
function hashInput(input: unknown): string {
  const str = typeof input === 'string' ? input : JSON.stringify(input ?? '')
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

// ═══════════════════════════════════════════════════════════════════════
// STUCK DETECTOR
// ═══════════════════════════════════════════════════════════════════════

const NO_STUCK: StuckSignal = {
  detected: false,
  pattern: null,
  evidence: '',
  turnCount: 0,
  recoveryHint: '',
}

export class StuckDetector {
  private history: ToolCallRecord[] = []
  private assistantMessages: string[] = []
  private turnCount: number = 0

  /** Call after every tool execution. */
  recordToolCall(toolName: string, input: unknown, result: string): void {
    this.history.push({
      toolName,
      inputHash: hashInput(input),
      result: result.substring(0, 200),
      turnIndex: this.turnCount,
    })
  }

  /** Call after every assistant message. */
  recordAssistantMessage(content: string): void {
    this.assistantMessages.push(content.substring(0, 500))
  }

  /** Call at start of each loop iteration. */
  incrementTurn(): void {
    this.turnCount++
  }

  /** Reset after a recovery attempt succeeds. */
  reset(): void {
    this.history = []
    this.assistantMessages = []
    // turnCount is NOT reset — it tracks total turns in the session
  }

  /**
   * Check for stuck patterns. Call after each turn.
   * Returns immediately on first detected pattern (priority order).
   */
  check(): StuckSignal {
    // ─── Pattern 1: repeated_tool ───────────────────────────────────
    // Same tool + same input hash seen 3+ times in last 6 tool calls
    const recentCalls = this.history.slice(-6)
    const callCounts = new Map<string, number>()
    for (const call of recentCalls) {
      const key = `${call.toolName}:${call.inputHash}`
      callCounts.set(key, (callCounts.get(key) || 0) + 1)
    }
    for (const [key, count] of callCounts) {
      if (count >= 3) {
        const [toolName] = key.split(':')
        return {
          detected: true,
          pattern: 'repeated_tool',
          evidence: `${toolName} called with identical input ${count} times`,
          turnCount: this.turnCount,
          recoveryHint: `Try a different tool or different input for ${toolName}`,
        }
      }
    }

    // ─── Pattern 2: repeated_error ──────────────────────────────────
    // Same error substring seen 3+ times in last 6 tool calls
    const recentErrors = recentCalls
      .filter(c => c.result.startsWith('ERROR:'))
      .map(c => c.result.substring(0, 100))
    const errorCounts = new Map<string, number>()
    for (const err of recentErrors) {
      errorCounts.set(err, (errorCounts.get(err) || 0) + 1)
    }
    for (const [err, count] of errorCounts) {
      if (count >= 3) {
        return {
          detected: true,
          pattern: 'repeated_error',
          evidence: `Same error repeated ${count} times: ${err}`,
          turnCount: this.turnCount,
          recoveryHint:
            'The current approach is failing. Check dependencies, permissions, or try a different method.',
        }
      }
    }

    // ─── Pattern 3: circular_reasoning ──────────────────────────────
    // Assistant message similarity > 85% to a message 2+ turns ago
    if (this.assistantMessages.length >= 3) {
      const latest = this.assistantMessages[this.assistantMessages.length - 1]!
      const previous = this.assistantMessages[this.assistantMessages.length - 3]!
      const similarity = cosineSimilaritySimple(latest, previous)
      if (similarity > 0.85) {
        return {
          detected: true,
          pattern: 'circular_reasoning',
          evidence: `Assistant reasoning is circular (${(similarity * 100).toFixed(0)}% similar to 2 turns ago)`,
          turnCount: this.turnCount,
          recoveryHint:
            'Step back. Re-read the original goal. Try a completely different approach.',
        }
      }
    }

    // ─── Pattern 4: empty_progress ──────────────────────────────────
    // 10+ turns, zero FileEdit/FileWrite tool calls
    if (this.turnCount >= 10) {
      const fileChanges = this.history.filter(
        c =>
          c.toolName === 'Write' ||
          c.toolName === 'Edit' ||
          c.toolName === 'MultiEdit' ||
          c.toolName === 'write_to_file' ||
          c.toolName === 'edit_file' ||
          c.toolName === 'FileWriteTool' ||
          c.toolName === 'FileEditTool',
      )
      if (fileChanges.length === 0) {
        return {
          detected: true,
          pattern: 'empty_progress',
          evidence: `${this.turnCount} turns with no file changes`,
          turnCount: this.turnCount,
          recoveryHint:
            'You have been planning but not executing. Make a concrete change now.',
        }
      }
    }

    return { ...NO_STUCK, turnCount: this.turnCount }
  }
}
