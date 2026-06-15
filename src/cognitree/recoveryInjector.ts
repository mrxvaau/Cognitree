/**
 * COGNITREE — Recovery Injector
 *
 * Track 7: Self-Healing Agent Loop
 *
 * Builds escalating recovery messages when the StuckDetector fires:
 *   - Attempt 1: gentle redirect + recovery hint
 *   - Attempt 2: stronger interrupt + inject past mistakes from memory
 *   - Attempt 3: surface to user — "I'm stuck, here's what I tried"
 *
 * Recovery messages are USER messages (role: 'user') to keep
 * the conversation valid for the API.
 */

import type { StuckSignal } from './stuckDetector.js'

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface RecoveryContext {
  attempt: number // 1, 2, or 3
  signal: StuckSignal
  pastMistakes: string[]
  injectionText: string
}

// ═══════════════════════════════════════════════════════════════════════
// RECOVERY INJECTOR
// ═══════════════════════════════════════════════════════════════════════

export const MAX_RECOVERY_ATTEMPTS = 3

export class RecoveryInjector {
  /**
   * Build a RecoveryContext with the full injection text.
   */
  buildRecovery(
    signal: StuckSignal,
    attempt: number,
    pastMistakes: string[],
  ): RecoveryContext {
    const injectionText = this.buildRecoveryMessage({
      attempt,
      signal,
      pastMistakes,
      injectionText: '',
    })
    return { attempt, signal, pastMistakes, injectionText }
  }

  /**
   * Build the recovery message string to inject as a user message.
   * Escalates severity with each attempt.
   */
  buildRecoveryMessage(ctx: RecoveryContext): string {
    const { attempt, signal, pastMistakes } = ctx
    const lines: string[] = []

    // Header
    lines.push(`[SYSTEM RECOVERY — attempt ${attempt}/${MAX_RECOVERY_ATTEMPTS}]`)
    lines.push('')
    lines.push(`Stuck pattern detected: ${signal.pattern}`)
    lines.push(`Evidence: ${signal.evidence}`)
    lines.push(`Recovery hint: ${signal.recoveryHint}`)

    // Past mistakes (attempt 2+)
    if (attempt >= 2 && pastMistakes.length > 0) {
      lines.push('')
      lines.push('Known mistakes to avoid:')
      for (const mistake of pastMistakes.slice(0, 3)) {
        lines.push(`- ${mistake}`)
      }
    }

    // Instructions (escalate per attempt)
    lines.push('')
    lines.push('Instructions:')
    lines.push('1. STOP the current approach entirely')
    lines.push('2. Re-read the original goal')
    lines.push(`3. ${signal.recoveryHint}`)

    if (attempt >= MAX_RECOVERY_ATTEMPTS) {
      lines.push(
        '4. This is the FINAL recovery attempt — explain to the user what is blocking you and ask for guidance',
      )
      lines.push('')
      lines.push(
        'You have exhausted all automatic recovery attempts. Tell the user:',
      )
      lines.push('- What you were trying to do')
      lines.push('- What specific error or pattern keeps occurring')
      lines.push('- What you need from them to proceed')
    } else {
      lines.push(
        `4. You have ${MAX_RECOVERY_ATTEMPTS - attempt} recovery attempt(s) remaining`,
      )
    }

    lines.push('')
    lines.push(
      'Do NOT repeat any tool call you have already tried with the same input.',
    )

    return lines.join('\n')
  }
}
