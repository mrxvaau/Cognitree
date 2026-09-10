/**
 * LLMClient._buildEventStream — SSE → Anthropic stream event adapter.
 *
 * Regression coverage for the duplicated-reply bug: gateways that repeat
 * finish_reason on a trailing chunk (typically the usage summary chunk sent
 * with stream_options.include_usage) must produce exactly ONE closing
 * sequence. The consumer (services/api/claude.ts) builds one assistant
 * message per content_block_stop, so a repeated content_block_stop renders
 * the reply twice in the TUI and records it twice in the transcript.
 */
import { describe, it, expect } from 'vitest'
import { LLMClient } from '../../src/services/api/llmClient.js'
import type { LLMStreamEvent } from '../../src/types/llm.js'

function sseResponse(lines: string[]): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l + '\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

async function collect(lines: string[]): Promise<LLMStreamEvent[]> {
  const client = new LLMClient({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: 'test',
    model: 'test-model',
  })
  // _buildEventStream is private — tests drive it directly to bypass fetch.
  const stream = (
    client as unknown as {
      _buildEventStream: (
        response: Response,
        signal: AbortSignal,
      ) => AsyncIterable<LLMStreamEvent>
    }
  )._buildEventStream(sseResponse(lines), new AbortController().signal)

  const events: LLMStreamEvent[] = []
  for await (const ev of stream) events.push(ev)
  return events
}

function countByType(events: LLMStreamEvent[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const ev of events) counts[ev.type] = (counts[ev.type] ?? 0) + 1
  return counts
}

describe('LLMClient _buildEventStream closing sequence', () => {
  it('emits one closing sequence for a well-behaved single finish chunk', async () => {
    const events = await collect([
      'data: {"id":"gen-1","model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}',
      'data: {"id":"gen-1","choices":[{"index":0,"delta":{"content":" world"}}]}',
      'data: {"id":"gen-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}',
      'data: [DONE]',
    ])
    const counts = countByType(events)
    expect(counts['content_block_stop']).toBe(1)
    expect(counts['message_delta']).toBe(1)
    expect(counts['message_stop']).toBe(1)
    const delta = events.find(e => e.type === 'message_delta')
    expect(delta?.usage).toEqual({ input_tokens: 10, output_tokens: 2 })
  })

  it('emits ONE closing sequence when finish_reason is repeated on the usage chunk', async () => {
    // OpenRouter-style gateways repeat finish_reason on the final chunk that
    // carries usage. Previously this emitted content_block_stop twice → the
    // consumer created two identical assistant messages (duplicated reply).
    const events = await collect([
      'data: {"id":"gen-1","model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":"Hi"}}]}',
      'data: {"id":"gen-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      'data: {"id":"gen-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2130,"completion_tokens":68}}',
      'data: [DONE]',
    ])
    const counts = countByType(events)
    expect(counts['content_block_stop']).toBe(1)
    expect(counts['message_delta']).toBe(1)
    expect(counts['message_stop']).toBe(1)
    // Late usage from the trailing chunk must still land in message_delta
    const delta = events.find(e => e.type === 'message_delta')
    expect(delta?.usage).toEqual({ input_tokens: 2130, output_tokens: 68 })
  })

  it('absorbs a spec-shaped usage-only trailing chunk with empty choices', async () => {
    const events = await collect([
      'data: {"id":"gen-1","model":"m","choices":[{"index":0,"delta":{"content":"Hi"}}]}',
      'data: {"id":"gen-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      'data: {"id":"gen-1","choices":[],"usage":{"prompt_tokens":555,"completion_tokens":7}}',
      'data: [DONE]',
    ])
    const counts = countByType(events)
    expect(counts['message_stop']).toBe(1)
    const delta = events.find(e => e.type === 'message_delta')
    expect(delta?.usage).toEqual({ input_tokens: 555, output_tokens: 7 })
  })

  it('closes exactly once on [DONE] even without any finish_reason', async () => {
    const events = await collect([
      'data: {"id":"gen-1","model":"m","choices":[{"index":0,"delta":{"content":"Hi"}}]}',
      'data: [DONE]',
    ])
    const counts = countByType(events)
    expect(counts['content_block_stop']).toBe(1)
    expect(counts['message_delta']).toBe(1)
    expect(counts['message_stop']).toBe(1)
    const delta = events.find(e => e.type === 'message_delta')
    expect(delta?.delta.stop_reason).toBe('end_turn')
  })

  it('closes each tool_use block once when finish_reason is repeated', async () => {
    const events = await collect([
      'data: {"id":"gen-1","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"Bash","arguments":""}}]}}]}',
      'data: {"id":"gen-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"command\\":\\"ls\\"}"}}]}}]}',
      'data: {"id":"gen-1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
      'data: {"id":"gen-1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":9,"completion_tokens":5}}',
      'data: [DONE]',
    ])
    const counts = countByType(events)
    expect(counts['content_block_start']).toBe(1)
    expect(counts['content_block_stop']).toBe(1)
    expect(counts['message_stop']).toBe(1)
    const delta = events.find(e => e.type === 'message_delta')
    expect(delta?.delta.stop_reason).toBe('tool_use')
  })

  it('still converts text-as-tool-call output exactly once', async () => {
    const events = await collect([
      'data: {"id":"gen-1","model":"m","choices":[{"index":0,"delta":{"content":"{\\"name\\": \\"Bash\\", \\"arguments\\": {\\"command\\": \\"ls\\"}}"}}]}',
      'data: {"id":"gen-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":5}}',
      'data: [DONE]',
    ])
    const counts = countByType(events)
    // text block closed + converted tool_use block closed = 2 stops total
    expect(counts['content_block_stop']).toBe(2)
    expect(counts['message_stop']).toBe(1)
    const toolStart = events.find(
      e => e.type === 'content_block_start' && e.content_block.type === 'tool_use',
    ) as Extract<LLMStreamEvent, { type: 'content_block_start' }> | undefined
    expect(toolStart?.content_block).toMatchObject({
      type: 'tool_use',
      name: 'Bash',
    })
  })
})
