/**
 * COGNITREE — MockLLM (Phase 4)
 *
 * Returns pre-scripted responses — no real API calls.
 * Simulates: tool calls, assistant messages, session end.
 */

export type MockResponse = {
  type: 'text' | 'tool_use' | 'tool_result'
  content: string
  toolName?: string
  toolInput?: unknown
}

export class MockLLM {
  private queue: MockResponse[] = []

  /** Add a scripted response to the queue */
  addResponse(response: MockResponse): void {
    this.queue.push(response)
  }

  /** Pop the next response. Throws if queue is empty (test setup error). */
  nextResponse(): MockResponse {
    const response = this.queue.shift()
    if (!response) throw new Error('MockLLM queue is empty — add responses before calling nextResponse()')
    return response
  }

  hasResponses(): boolean {
    return this.queue.length > 0
  }

  /** Reset queue */
  reset(): void {
    this.queue = []
  }
}
