/**
 * COGNITREE — EventBus (Phase 2)
 *
 * Central typed event emitter. No LLM dependency.
 * All event emission and subscription goes through this module.
 */

import { EventEmitter } from 'events'

// ═══════════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════

export type StuckPattern = 'repeated_tool' | 'same_error' | 'no_progress'

export type CognitreeEvent =
  | { type: 'first_prompt'; content: string }
  | { type: 'file_changed'; path: string; tool: 'Write' | 'Edit' | 'MultiEdit' }
  | { type: 'todo_completed'; text: string }
  | { type: 'stuck_detected'; pattern: StuckPattern; evidence: string; hint: string }
  | { type: 'decision_made'; text: string }
  | { type: 'session_end'; turn_count: number }

type EventType = CognitreeEvent['type']
type EventPayload<T extends EventType> = Extract<CognitreeEvent, { type: T }>

// ═══════════════════════════════════════════════════════════════════════
// EVENT BUS CLASS
// ═══════════════════════════════════════════════════════════════════════

export class CognitreeEventBus {
  private emitter = new EventEmitter()

  emit<T extends EventType>(event: Extract<CognitreeEvent, { type: T }>): void {
    this.emitter.emit(event.type, event)
  }

  on<T extends EventType>(
    type: T,
    handler: (event: EventPayload<T>) => void,
  ): void {
    this.emitter.on(type, handler as (e: unknown) => void)
  }

  off<T extends EventType>(
    type: T,
    handler: (event: EventPayload<T>) => void,
  ): void {
    this.emitter.off(type, handler as (e: unknown) => void)
  }

  removeAllListeners(type?: EventType): void {
    this.emitter.removeAllListeners(type)
  }
}

/** Singleton event bus for the current session */
export const cognitreeEventBus = new CognitreeEventBus()
