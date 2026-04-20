/**
 * Generic OpenAI-compatible LLM client.
 *
 * Supports: text generation, tool use, image input, streaming
 * Does NOT support (Anthropic-only features, handled by Path A):
 * - Prompt caching (cache_control on content blocks)
 * - Extended thinking blocks
 * - anthropic-beta headers
 *
 * When LLM_BASE_URL is set, this client is used via the fake
 * Anthropic wrapper in client.ts. When ANTHROPIC_API_KEY is set,
 * the real Anthropic SDK is used instead.
 */
import {
  LLMConnectionError,
  LLMConnectionTimeoutError,
  LLMUserAbortError,
  LLMRateLimitError,
  LLMAuthenticationError,
  type LLMStreamEvent,
  type LLMMessageStreamParams,
  type LLMUsage,
  type ContentBlock,
} from '../../types/llm.js'
import { isQwenOAuth } from '../../utils/model/providers.js'

// ============================================================
// OPENAI RESPONSE TYPES (internal to this module)
// ============================================================

interface OpenAIToolCall {
  index: number
  id?: string
  type?: string
  function?: {
    name?: string
    arguments?: string
  }
}

interface OpenAIChunkDelta {
  role?: string
  content?: string | null
  tool_calls?: OpenAIToolCall[]
}

interface OpenAIStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: OpenAIChunkDelta
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// Module-level flag: set to true when the model rejects tools with 400.
// Persists across LLMClient instances so retry loops don't re-send tools.
let _modelToolsUnsupported = false

// ============================================================
// LLM CLIENT
// ============================================================

interface LLMClientOptions {
  baseURL: string
  apiKey: string
  model: string
}

export class LLMClient {
  private baseURL: string
  private apiKey: string
  private model: string

  constructor(options: LLMClientOptions) {
    // Normalize: strip trailing slash
    this.baseURL = options.baseURL.replace(/\/$/, '')
    this.apiKey = options.apiKey
    this.model = options.model
  }

  async createMessage(
    params: LLMMessageStreamParams,
    options: { signal: AbortSignal },
  ): Promise<{
    data: AsyncIterable<LLMStreamEvent>
    response: Response
    request_id: string
  }> {
    // Build the OpenAI messages array
    const messages: Array<{ role: string; content: string | unknown[] }> = []

    // Prepend system message if provided
    if (params.system) {
      const systemText =
        typeof params.system === 'string'
          ? params.system
          : params.system.map((s) => s.text).join('\n')
      messages.push({ role: 'system', content: systemText })
    }

    // Map LLMMessageParam[] → OpenAI messages
    for (const msg of params.messages) {
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content })
      } else {
        // Convert content blocks to OpenAI format
        const parts: unknown[] = []
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ type: 'text', text: block.text })
          } else if (block.type === 'tool_use') {
            // tool_use blocks from assistant → tool_calls format is handled below
            // For now push as text representation
            parts.push({ type: 'text', text: JSON.stringify(block.input) })
          } else if (block.type === 'tool_result') {
            // Tool result goes as a separate 'tool' role message
            const contentStr =
              typeof block.content === 'string'
                ? block.content
                : Array.isArray(block.content)
                  ? (block.content as Array<{ type: string; text?: string }>)
                      .filter((b) => b.type === 'text')
                      .map((b) => b.text ?? '')
                      .join('')
                  : ''
            messages.push({
              role: 'tool',
              // @ts-expect-error — tool_call_id is required by OpenAI but not in our generic type
              tool_call_id: block.tool_use_id,
              content: contentStr,
            })
            continue
          } else if (block.type === 'image') {
            const src = block.source
            if (src.type === 'base64') {
              parts.push({
                type: 'image_url',
                image_url: {
                  url: `data:${src.media_type};base64,${src.data}`,
                },
              })
            }
          }
        }
        if (parts.length > 0) {
          messages.push({ role: msg.role, content: parts })
        }
      }
    }

    // Map LLMToolDefinition[] → OpenAI tools
    const tools =
      params.tools && params.tools.length > 0
        ? params.tools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.input_schema,
            },
          }))
        : undefined

    // Strip tools if the model previously rejected them
    const effectiveTools = _modelToolsUnsupported ? undefined : tools

    const body: Record<string, unknown> = {
      model: params.model || this.model,
      messages,
      max_tokens: params.max_tokens,
      stream: true,
      stream_options: { include_usage: true },
      ...(effectiveTools ? { tools: effectiveTools } : {}),
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
      ...(params.tool_choice && !_modelToolsUnsupported ? { tool_choice: params.tool_choice.type } : {}),
    }

    // Normalize: if baseURL already ends with /v1, don't double it
    const base = this.baseURL.replace(/\/v1\/?$/, '')
    const url = `${base}/v1/chat/completions`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: options.signal,
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LLMUserAbortError('Request aborted by user')
      }
      if (
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.message.includes('timeout'))
      ) {
        throw new LLMConnectionTimeoutError(`Request timed out: ${err.message}`)
      }
      throw new LLMConnectionError(
        `Connection error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!response.ok) {
      // ── Fallback: retry without tools if model doesn't support them ────
      if (response.status === 400 && body.tools) {
        const errorText = await response.text()
        if (errorText.includes('does not support tools') || errorText.includes('tools is not supported')) {
          _modelToolsUnsupported = true
          process.stderr.write(
            `[LLMClient] Model does not support tools, retrying without them.\n` +
            `[LLMClient] Hint: pull the official model (e.g. "ollama pull qwen2.5-coder:3b") for tool support.\n`
          )
          delete body.tools
          delete body.tool_choice
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
            },
            body: JSON.stringify(body),
            signal: options.signal,
          })
        }
      }
    }

    if (!response.ok) {
      // ── Parse error body (DashScope returns JSON with code/message) ──
      let errorText = ''
      try {
        errorText = await response.text()
      } catch { /* ignore read errors */ }

      if (response.status === 429) {
        // Carry the full error body so quota detection can parse it
        throw new LLMRateLimitError(
          errorText || 'Rate limit exceeded',
          response.status,
          undefined,
          response.headers,
        )
      }

      if (response.status === 401 || response.status === 403) {
        // ── Qwen OAuth: auto-refresh token and retry once ──
        if (isQwenOAuth()) {
          try {
            const { getQwenAccessToken } = await import('../../services/qwen/index.js')
            const freshToken = await getQwenAccessToken()
            if (freshToken && freshToken !== this.apiKey) {
              process.stderr.write('[LLMClient] Qwen token expired, refreshing...\n')
              this.apiKey = freshToken
              process.env.LLM_API_KEY = freshToken

              // Retry the request with fresh token
              const retryResponse = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${freshToken}`,
                },
                body: JSON.stringify(body),
                signal: options.signal,
              })

              if (retryResponse.ok) {
                response = retryResponse
              } else {
                throw new LLMAuthenticationError(
                  errorText || 'Qwen authentication failed after token refresh',
                  retryResponse.status,
                )
              }
            } else {
              throw new LLMAuthenticationError(
                errorText || 'Qwen authentication failed',
                response.status,
              )
            }
          } catch (refreshErr) {
            if (refreshErr instanceof LLMAuthenticationError) throw refreshErr
            throw new LLMAuthenticationError(
              errorText || 'Authentication failed',
              response.status,
            )
          }
        } else {
          throw new LLMAuthenticationError(
            errorText || 'Authentication failed',
            response.status,
          )
        }
      }

      if (response && !response.ok) {
        throw new LLMConnectionError(
          errorText || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
        )
      }
    }

    const requestId =
      response.headers.get('x-request-id') ||
      response.headers.get('request-id') ||
      `llm-${Date.now()}`

    const stream = this._buildEventStream(response, options.signal)

    return {
      data: stream,
      response,
      request_id: requestId,
    }
  }

  private async *_buildEventStream(
    response: Response,
    signal: AbortSignal,
  ): AsyncIterable<LLMStreamEvent> {
    if (!response.body) {
      throw new LLMConnectionError('Response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    // Accumulated state for assembling events
    let messageId = `msg-${Date.now()}`
    let modelName = ''
    let inputTokens = 0
    let outputTokens = 0

    // Track tool calls being assembled (index → partial data)
    const toolCallMap: Map<
      number,
      { id: string; name: string; argsBuffer: string; blockIndex: number }
    > = new Map()
    let nextBlockIndex = 0
    let hasEmittedMessageStart = false

    try {
      while (true) {
        if (signal.aborted) {
          reader.cancel()
          throw new LLMUserAbortError('Stream aborted')
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process all complete SSE lines in buffer
        const lines = buffer.split('\n')
        // Keep the last (potentially incomplete) line in buffer
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === '') continue
          if (!trimmed.startsWith('data:')) continue

          const jsonStr = trimmed.slice('data:'.length).trim()
          if (jsonStr === '[DONE]') continue

          let chunk: OpenAIStreamChunk
          try {
            chunk = JSON.parse(jsonStr) as OpenAIStreamChunk
          } catch {
            // Skip malformed SSE lines
            continue
          }

          // Extract metadata from first chunk
          if (chunk.id) messageId = chunk.id
          if (chunk.model) modelName = chunk.model

          // Accumulate usage if present in chunk (stream_options usage)
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens
            outputTokens = chunk.usage.completion_tokens
          }

          // Emit message_start on first content
          if (!hasEmittedMessageStart) {
            hasEmittedMessageStart = true
            const usage: LLMUsage = {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
            }
            yield {
              type: 'message_start',
              message: {
                id: messageId,
                type: 'message' as const,
                role: 'assistant' as const,
                content: [] as ContentBlock[],
                model: modelName,
                stop_reason: null,
                stop_sequence: null,
                usage,
                container: null,
                context_management: null,
              },
            } satisfies LLMStreamEvent
          }

          for (const choice of chunk.choices) {
            const delta = choice.delta

            // ── Text content delta ────────────────────────────────────
            if (delta.content != null && delta.content !== '') {
              // Emit content_block_start for text if not yet opened
              // We use blockIndex 0 for text
              if (nextBlockIndex === 0) {
                const textBlock: ContentBlock = { type: 'text', text: '' }
                yield {
                  type: 'content_block_start',
                  index: 0,
                  content_block: textBlock,
                } satisfies LLMStreamEvent
                nextBlockIndex = 1
              }

              yield {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: delta.content },
              } satisfies LLMStreamEvent
            }

            // ── Tool call deltas ──────────────────────────────────────
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const tcIdx = tc.index ?? 0

                if (!toolCallMap.has(tcIdx)) {
                  // New tool call — assign a block index
                  const blockIndex = nextBlockIndex++
                  const toolId = tc.id || `tool-${blockIndex}`
                  const toolName = tc.function?.name || ''

                  toolCallMap.set(tcIdx, {
                    id: toolId,
                    name: toolName,
                    argsBuffer: '',
                    blockIndex,
                  })

                  // Emit content_block_start for this tool_use
                  const toolUseBlock: ContentBlock = {
                    type: 'tool_use',
                    id: toolId,
                    name: toolName,
                    input: {},
                  }
                  yield {
                    type: 'content_block_start',
                    index: blockIndex,
                    content_block: toolUseBlock,
                  } satisfies LLMStreamEvent
                }

                const entry = toolCallMap.get(tcIdx)!

                // Update name if it arrives in a later chunk
                if (tc.function?.name) {
                  entry.name = tc.function.name
                }

                // Accumulate args fragment
                if (tc.function?.arguments) {
                  entry.argsBuffer += tc.function.arguments
                  yield {
                    type: 'content_block_delta',
                    index: entry.blockIndex,
                    delta: {
                      type: 'input_json_delta',
                      partial_json: tc.function.arguments,
                    },
                  } satisfies LLMStreamEvent
                }
              }
            }

            // ── Finish reason → close open blocks ─────────────────────
            if (choice.finish_reason) {
              // Close text block if opened
              if (nextBlockIndex > 0 && toolCallMap.size === 0) {
                yield {
                  type: 'content_block_stop',
                  index: 0,
                } satisfies LLMStreamEvent
              }

              // Close all tool_use blocks
              for (const entry of toolCallMap.values()) {
                yield {
                  type: 'content_block_stop',
                  index: entry.blockIndex,
                } satisfies LLMStreamEvent
              }

              // Map finish_reason to Anthropic stop_reason
              const stopReason =
                choice.finish_reason === 'tool_calls'
                  ? 'tool_use'
                  : choice.finish_reason === 'length'
                    ? 'max_tokens'
                    : 'end_turn'

              const finalUsage: LLMUsage = {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
              }

              yield {
                type: 'message_delta',
                delta: {
                  stop_reason: stopReason,
                  stop_sequence: null,
                },
                usage: finalUsage,
              } satisfies LLMStreamEvent

              yield {
                type: 'message_stop',
              } satisfies LLMStreamEvent
            }
          }
        }
      }
    } finally {
      try {
        reader.cancel()
      } catch {
        // ignore cancel errors
      }
    }
  }

  /**
   * Compatibility shim: `client.beta` mirrors the Anthropic SDK's beta namespace.
   * All `beta.messages.*` calls are routed to `this.createMessage()`.
   */
  get beta(): {
    messages: {
      create: (params: LLMMessageStreamParams, options?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ data: AsyncIterable<LLMStreamEvent>; response: Response; request_id: string }>
      stream: (params: LLMMessageStreamParams, options?: { headers?: Record<string, string>; signal?: AbortSignal }) => AsyncIterable<LLMStreamEvent> & { controller: AbortController; on: (event: string, cb: unknown) => void; finalMessage: () => Promise<unknown> }
    }
  } {
    const self = this
    return {
      messages: {
        create: (params: LLMMessageStreamParams, options?: { headers?: Record<string, string>; signal?: AbortSignal }) => {
          const signal = options?.signal || new AbortController().signal
          return self.createMessage(params, { signal })
        },
        stream: (params: LLMMessageStreamParams, options?: { headers?: Record<string, string>; signal?: AbortSignal }) => {
          const controller = new AbortController()
          if (options?.signal) {
            options.signal.addEventListener('abort', () => controller.abort())
          }
          const streamPromise = self.createMessage(params, { signal: controller.signal })
          const callbacks: Map<string, Array<(...args: unknown[]) => void>> = new Map()
          const streamObj = {
            controller,
            on(event: string, cb: unknown) {
              if (!callbacks.has(event)) callbacks.set(event, [])
              callbacks.get(event)!.push(cb as (...args: unknown[]) => void)
              return streamObj
            },
            async finalMessage() {
              const result = await streamPromise
              return result
            },
            async *[Symbol.asyncIterator]() {
              const result = await streamPromise
              yield* result.data
            },
          } as unknown as AsyncIterable<LLMStreamEvent> & { controller: AbortController; on: (event: string, cb: unknown) => void; finalMessage: () => Promise<unknown> }
          return streamObj
        },
      },
    }
  }

  /**
   * Compatibility: direct `.messages` property matching Anthropic SDK top-level.
   */
  get messages() {
    return this.beta.messages
  }
}
