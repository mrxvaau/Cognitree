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
        // For assistant messages, separate text content from tool_use blocks
        // because OpenAI format requires tool_calls as a sibling field, not inline
        const parts: unknown[] = []
        const toolCalls: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }> = []

        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ type: 'text', text: block.text })
          } else if (block.type === 'tool_use') {
            // Assistant tool_use → OpenAI tool_calls format
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            })
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

        // Build the message object
        if (msg.role === 'assistant' && toolCalls.length > 0) {
          // Assistant message with tool calls: use OpenAI's tool_calls field
          const assistantMsg: Record<string, unknown> = {
            role: 'assistant',
            tool_calls: toolCalls,
          }
          // Include text content if present alongside tool calls
          if (parts.length > 0) {
            const textContent = parts
              .filter((p: unknown) => (p as { type: string }).type === 'text')
              .map((p: unknown) => (p as { text: string }).text)
              .join('')
            if (textContent) {
              assistantMsg.content = textContent
            }
          }
          messages.push(assistantMsg as { role: string; content: string | unknown[] })
        } else if (parts.length > 0) {
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

    // Accumulate all text content so we can check for JSON tool calls
    // when the stream finishes. Small local models often output tool calls
    // as text ({"name": "X", "arguments": {...}}) instead of using the
    // OpenAI function calling format.
    let textAccumulator = ''
    let textBlockStarted = false

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
              textAccumulator += delta.content

              // Emit content_block_start for text if not yet opened
              if (!textBlockStarted) {
                textBlockStarted = true
                const textBlock: ContentBlock = { type: 'text', text: '' }
                yield {
                  type: 'content_block_start',
                  index: 0,
                  content_block: textBlock,
                } satisfies LLMStreamEvent
                nextBlockIndex = 1
              }

              // Yield text deltas in real-time for streaming display
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
              // Check if the accumulated text is actually a JSON tool call
              // Small local models (e.g. qwen2.5-coder, deepseek-r1) often
              // output tool calls as text instead of using function calling
              let parsedToolCall = _tryParseTextAsToolCall(textAccumulator.trim())

              // Normalize tool names and parameters for local model compatibility
              if (parsedToolCall) {
                parsedToolCall = _normalizeToolCall(parsedToolCall)
              }

              if (parsedToolCall && toolCallMap.size === 0) {
                // The model output a tool call as text — convert it!
                // Don't close the text block as normal; emit tool_use instead
                if (textBlockStarted) {
                  yield {
                    type: 'content_block_stop',
                    index: 0,
                  } satisfies LLMStreamEvent
                }

                const toolBlockIndex = nextBlockIndex++
                const toolId = `tool-text-${toolBlockIndex}`

                // Emit tool_use start
                yield {
                  type: 'content_block_start',
                  index: toolBlockIndex,
                  content_block: {
                    type: 'tool_use',
                    id: toolId,
                    name: parsedToolCall.name,
                    input: {},
                  },
                } satisfies LLMStreamEvent

                // Emit the arguments
                yield {
                  type: 'content_block_delta',
                  index: toolBlockIndex,
                  delta: {
                    type: 'input_json_delta',
                    partial_json: JSON.stringify(parsedToolCall.arguments),
                  },
                } satisfies LLMStreamEvent

                // Close tool block
                yield {
                  type: 'content_block_stop',
                  index: toolBlockIndex,
                } satisfies LLMStreamEvent

                // Emit message_delta with tool_use stop reason
                const finalUsage: LLMUsage = {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                }

                yield {
                  type: 'message_delta',
                  delta: {
                    stop_reason: 'tool_use',
                    stop_sequence: null,
                  },
                  usage: finalUsage,
                } satisfies LLMStreamEvent

                yield {
                  type: 'message_stop',
                } satisfies LLMStreamEvent
              } else {
                // Normal flow — close text block if opened
                if (textBlockStarted && toolCallMap.size === 0) {
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
      }
    } catch (streamErr) {
      // Handle connection drops gracefully (Ollama OOM, timeout, etc.)
      // Instead of letting the error propagate and crash the CLI,
      // log it and emit a clean error message
      if (streamErr instanceof LLMUserAbortError) {
        throw streamErr  // User-initiated abort should propagate
      }
      process.stderr.write(
        `[LLMClient] Stream error: ${streamErr instanceof Error ? streamErr.message : String(streamErr)}\n`
      )
      // If we haven't emitted message_start, do it now so the CLI
      // has a valid message to display
      if (!hasEmittedMessageStart) {
        const usage: LLMUsage = { input_tokens: 0, output_tokens: 0 }
        yield {
          type: 'message_start',
          message: {
            id: messageId, type: 'message' as const,
            role: 'assistant' as const, content: [] as ContentBlock[],
            model: modelName, stop_reason: null, stop_sequence: null,
            usage, container: null, context_management: null,
          },
        } satisfies LLMStreamEvent
      }
      // Emit error text so user sees something
      const errBlockIdx = nextBlockIndex++
      yield {
        type: 'content_block_start',
        index: errBlockIdx,
        content_block: { type: 'text', text: '' },
      } satisfies LLMStreamEvent
      yield {
        type: 'content_block_delta',
        index: errBlockIdx,
        delta: {
          type: 'text_delta',
          text: `\n⚠️ Connection to Ollama lost. This usually means the model ran out of memory (VRAM/RAM). Try:\n• Start a new conversation (shorter context)\n• Set OLLAMA_NUM_PARALLEL=1 to reduce memory\n• Use a smaller model\n`,
        },
      } satisfies LLMStreamEvent
      yield { type: 'content_block_stop', index: errBlockIdx } satisfies LLMStreamEvent
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { input_tokens: 0, output_tokens: 0 },
      } satisfies LLMStreamEvent
      yield { type: 'message_stop' } satisfies LLMStreamEvent
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

// ============================================================
// TEXT-AS-TOOL-CALL DETECTION
// ============================================================

/**
 * Try to parse text content as a JSON tool call.
 * Small local models (qwen2.5-coder, deepseek-r1, etc.) often output
 * tool calls as text like: {"name": "Bash", "arguments": {"command": "ls"}}
 * instead of using the OpenAI function calling format.
 *
 * Returns the parsed tool call if the text matches, or null otherwise.
 */
function _tryParseTextAsToolCall(
  text: string,
): { name: string; arguments: Record<string, unknown>; prefix: string } | null {
  if (!text) return null

  const trimmed = text.trim()

  // Strategy 1: The entire text is a JSON object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const result = _parseToolCallJson(trimmed)
    if (result) return { ...result, prefix: '' }
  }

  // Strategy 2: JSON inside markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    const result = _parseToolCallJson(fenceMatch[1]!.trim())
    if (result) {
      const prefix = trimmed.slice(0, trimmed.indexOf('```')).trim()
      return { ...result, prefix }
    }
  }

  // Strategy 3: Find a JSON object embedded in text
  // Look for all { ... } blocks and try to parse the ones containing "name"
  const jsonMatches: Array<{ json: string; startIdx: number }> = []
  let depth = 0
  let start = -1
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (trimmed[i] === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        jsonMatches.push({
          json: trimmed.slice(start, i + 1),
          startIdx: start,
        })
        start = -1
      }
    }
  }

  // Try each JSON match, prefer the largest (most likely to be the tool call)
  for (const match of jsonMatches.sort((a, b) => b.json.length - a.json.length)) {
    const result = _parseToolCallJson(match.json)
    if (result) {
      const prefix = trimmed.slice(0, match.startIdx).trim()
      return { ...result, prefix }
    }
  }

  return null
}

/**
 * Parse a JSON string as a tool call object.
 * Returns { name, arguments } if valid, null otherwise.
 */
function _parseToolCallJson(
  jsonText: string,
): { name: string; arguments: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(jsonText)

    // Must have 'name' field (string) — the tool name
    if (typeof parsed.name !== 'string' || !parsed.name) return null

    // Must have 'arguments' or 'parameters' or 'input' field (object)
    const args = parsed.arguments || parsed.parameters || parsed.input
    if (!args || typeof args !== 'object') {
      // Some models output: {"name": "X", "key1": "val1", ...}
      // where the args are top-level. Extract everything except 'name'.
      const { name, ...rest } = parsed
      if (Object.keys(rest).length > 0) {
        return { name: parsed.name, arguments: rest }
      }
      // Tool with no arguments
      return { name: parsed.name, arguments: {} }
    }

    return { name: parsed.name, arguments: args }
  } catch {
    return null
  }
}

// ============================================================
// TOOL NAME & PARAMETER NORMALIZATION
// ============================================================

/**
 * Normalize tool names and parameter keys for local model compatibility.
 * Small models (7B) often use plausible but incorrect tool names or
 * parameter names. This maps them to the actual Claude Code schema.
 */
function _normalizeToolCall(
  toolCall: { name: string; arguments: Record<string, unknown>; prefix: string },
): { name: string; arguments: Record<string, unknown>; prefix: string } {
  let { name, arguments: args } = toolCall

  // ── Tool name normalization ──────────────────────────────
  // Map common model mistakes to actual tool names
  const nameMap: Record<string, string> = {
    // Bash variants
    'bash': 'Bash',
    'shell': 'Bash',
    'execute': 'Bash',
    'run': 'Bash',
    'terminal': 'Bash',
    'cmd': 'Bash',
    'command': 'Bash',
    'powershell': 'Bash',
    // File read variants
    'read': 'Read',
    'fileread': 'Read',
    'readfile': 'Read',
    'cat': 'Read',
    'view': 'Read',
    // File write variants
    'write': 'Write',
    'filewrite': 'Write',
    'writefile': 'Write',
    'createfile': 'Write',
    'create': 'Write',
    'save': 'Write',
    // File edit variants
    'edit': 'Edit',
    'fileedit': 'Edit',
    'editfile': 'Edit',
    'modify': 'Edit',
    'patch': 'Edit',
    // Glob/search variants
    'glob': 'Glob',
    'globtool': 'Glob',
    'find': 'Glob',
    'search': 'Glob',
    'ls': 'Glob',
    'list': 'Glob',
    'listfiles': 'Glob',
    // Grep variants
    'grep': 'Grep',
    'greptool': 'Grep',
    'rg': 'Grep',
    'ripgrep': 'Grep',
    // Web fetch variants
    'webfetch': 'WebFetch',
    'fetch': 'WebFetch',
    'curl': 'WebFetch',
    'http': 'WebFetch',
  }

  const normalizedName = nameMap[name.toLowerCase()] || name

  // ── Parameter normalization per tool ────────────────────
  const normalizedArgs = { ...args }

  switch (normalizedName) {
    case 'Bash': {
      // Model says "script", "cmd", "bash", "shell_command" → should be "command"
      if (!normalizedArgs.command) {
        const cmd = normalizedArgs.script || normalizedArgs.cmd ||
          normalizedArgs.bash || normalizedArgs.shell_command ||
          normalizedArgs.shell || normalizedArgs.exec
        if (cmd) {
          normalizedArgs.command = cmd
          delete normalizedArgs.script
          delete normalizedArgs.cmd
          delete normalizedArgs.bash
          delete normalizedArgs.shell_command
          delete normalizedArgs.shell
          delete normalizedArgs.exec
        }
      }
      break
    }
    case 'Read': {
      // Model says "path", "filename", "filepath" → should be "file_path"
      if (!normalizedArgs.file_path) {
        const fp = normalizedArgs.path || normalizedArgs.filename ||
          normalizedArgs.filepath || normalizedArgs.file
        if (fp) {
          normalizedArgs.file_path = fp
          delete normalizedArgs.path
          delete normalizedArgs.filename
          delete normalizedArgs.filepath
          delete normalizedArgs.file
        }
      }
      break
    }
    case 'Write': {
      // Normalize path
      if (!normalizedArgs.file_path) {
        const fp = normalizedArgs.path || normalizedArgs.filename ||
          normalizedArgs.filepath || normalizedArgs.file
        if (fp) {
          normalizedArgs.file_path = fp
          delete normalizedArgs.path
          delete normalizedArgs.filename
          delete normalizedArgs.filepath
          delete normalizedArgs.file
        }
      }
      // Normalize content
      if (!normalizedArgs.content) {
        const c = normalizedArgs.text || normalizedArgs.data || normalizedArgs.body
        if (c) {
          normalizedArgs.content = c
          delete normalizedArgs.text
          delete normalizedArgs.data
          delete normalizedArgs.body
        }
      }
      break
    }
    case 'Glob': {
      // Model says "pattern", "glob", "query" → should be "pattern"
      if (!normalizedArgs.pattern) {
        const p = normalizedArgs.glob || normalizedArgs.query ||
          normalizedArgs.search || normalizedArgs.glob_pattern
        if (p) {
          normalizedArgs.pattern = p
          delete normalizedArgs.glob
          delete normalizedArgs.query
          delete normalizedArgs.search
          delete normalizedArgs.glob_pattern
        }
      }
      break
    }
    case 'Grep': {
      // Model says "query", "search", "text" → should be "pattern"
      if (!normalizedArgs.pattern) {
        const p = normalizedArgs.query || normalizedArgs.search ||
          normalizedArgs.text || normalizedArgs.regex
        if (p) {
          normalizedArgs.pattern = p
          delete normalizedArgs.query
          delete normalizedArgs.search
          delete normalizedArgs.text
          delete normalizedArgs.regex
        }
      }
      break
    }
  }

  return { name: normalizedName, arguments: normalizedArgs, prefix: toolCall.prefix }
}
