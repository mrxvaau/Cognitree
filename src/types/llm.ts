// ============================================================
// CONTENT BLOCK TYPES — what messages can contain
// ============================================================

export type TextBlock = {
  type: 'text'
  text: string
  /** Prompt caching (Anthropic-specific, ignored by generic provider) */
  cache_control?: { type: 'ephemeral'; scope?: 'global' | 'org'; ttl?: '5m' | '1h' } | null
}

export type ToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export type ToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: string | Array<TextBlock | ImageBlock>
  is_error?: boolean
}

export type ImageBlock = {
  type: 'image'
  source:
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'url'; url: string }
}

/** The base64 image source shape — used by inboundMessages normalization */
export type Base64ImageSource = { type: 'base64'; media_type: string; data: string }

export type ThinkingBlock = {
  type: 'thinking'
  thinking: string
  /** Redacted thinking support (Anthropic-specific, treated as empty by generic) */
  signature?: string
}

export type RedactedThinkingBlock = {
  type: 'redacted_thinking'
  data: string
}

export type DocumentBlock = {
  type: 'document'
  source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string }
  title?: string
  context?: string
}

/** Server tool use (Anthropic web search etc) — structural compat only */
export type ServerToolUseBlock = {
  type: 'server_tool_use'
  id: string
  name: string
  input: Record<string, unknown> | string
}

/** MCP tool use block */
export type McpToolUseBlock = {
  type: 'mcp_tool_use'
  id: string
  name: string
  input: Record<string, unknown> | string
}

/** MCP tool result block */
export type McpToolResultBlock = {
  type: 'mcp_tool_result'
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
}

/** Web search result block */
export type WebSearchResultBlock = {
  type: 'web_search_result'
  url: string
  title: string
  encrypted_content?: string
  page_age?: string
}

/** Web search tool result block */
export type WebSearchToolResultBlock = {
  type: 'web_search_tool_result'
  tool_use_id: string
  content: WebSearchResultBlock[] | string
}

/** Code execution result */
export type CodeExecutionBlock = {
  type: 'code_execution_tool_result'
  tool_use_id: string
  content: { type: 'code_execution_output'; stdout?: string; stderr?: string; return_code?: number }[]
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock
  | ThinkingBlock
  | RedactedThinkingBlock
  | DocumentBlock
  | ServerToolUseBlock
  | McpToolUseBlock
  | McpToolResultBlock
  | WebSearchResultBlock
  | WebSearchToolResultBlock
  | CodeExecutionBlock

// ============================================================
// MESSAGE TYPES
// ============================================================

/** Unified message param — covers user, assistant, and system roles */
export type LLMMessageParam = {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

// ============================================================
// RESPONSE MESSAGE — what the API returns
// ============================================================

/** The full message object returned after a non-streaming call, or assembled from a stream */
export type LLMMessage = {
  id: string
  type: 'message'
  role: 'assistant'
  content: ContentBlock[]
  model: string
  stop_reason: LLMStopReason | null
  stop_sequence: string | null
  usage: LLMUsage
}

// ============================================================
// TOOL DEFINITION TYPES — two shapes:
//   LLMToolDefinition      = OpenAI function-calling format (for LLMClient)
//   LLMToolDefinitionAnthropic = Anthropic LLMToolDefinitionAnthropic-compatible shape (for claude.ts etc.)
// ============================================================

/** OpenAI function-calling format (sent to generic provider) */
export type LLMToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown> // JSON Schema
  }
}

/** Anthropic LLMToolDefinitionAnthropic-compatible shape (used by api.ts, claude.ts, etc.) */
export type LLMToolDefinitionAnthropic = {
  name: string
  description: string
  input_schema: Record<string, unknown>
  /** Structured output strict mode (Anthropic-specific, ignored by generic provider) */
  strict?: boolean
  /** Fine-grained tool streaming (Anthropic-specific, ignored by generic provider) */
  eager_input_streaming?: boolean
  /** Tool search lazy loading (Anthropic-specific, ignored by generic provider) */
  defer_loading?: boolean
  /** Prompt caching (Anthropic-specific cache mark) */
  cache_control?: { type: string; scope?: string; ttl?: string } | null
}

/** Union: LLMToolUnion equivalent */
export type LLMToolUnion = LLMToolDefinitionAnthropic

// ============================================================
// STREAMING EVENT TYPES — what the SSE stream yields
// ============================================================

export type ContentBlockStartEvent = {
  type: 'content_block_start'
  index: number
  content_block: ContentBlock
}

export type ContentBlockDeltaEvent = {
  type: 'content_block_delta'
  index: number
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'input_json_delta'; partial_json: string }
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'signature_delta'; signature: string }
    | { type: 'citations_delta'; citations: unknown[] }
    | { type: 'connector_text_delta'; text: string }
    | { type: string; [key: string]: unknown }
}

export type ContentBlockStopEvent = {
  type: 'content_block_stop'
  index: number
}

export type MessageStartEvent = {
  type: 'message_start'
  message: {
    id: string
    type: 'message'
    role: 'assistant'
    content: ContentBlock[]
    model: string
    stop_reason: string | null
    stop_sequence: string | null
    usage: LLMUsage
  }
}

export type MessageDeltaEvent = {
  type: 'message_delta'
  delta: {
    stop_reason: LLMStopReason | null
    stop_sequence: string | null
  }
  usage: LLMUsage
}

export type MessageStopEvent = {
  type: 'message_stop'
}

export type PingEvent = {
  type: 'ping'
}

export type LLMStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent

// ============================================================
// USAGE / TOKEN COUNTS
// ============================================================

export type LLMUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  /** Cache deleted tokens (microcompact cache editing) */
  cache_deleted_input_tokens?: number
  /** Server tool use tokens */
  server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number }
  /** Cache creation breakdown (ephemeral vs persistent) */
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
  /** Extended thinking iterations */
  iterations?: number
  /** Speed mode used */
  speed?: string
}

// ============================================================
// STOP REASONS
// ============================================================

export type LLMStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'tool_use'
  | 'stop_sequence'
  | 'error'
  | 'model_context_window_exceeded'
  | (string & {})

// ============================================================
// STREAM PARAMS TYPE — the full request object shape (Anthropic-compatible)
// ============================================================

export type LLMMessageStreamParams = {
  model: string
  max_tokens: number
  system?: string | Array<{ type: string; text: string; cache_control?: { type: string; scope?: string; ttl?: string } | null }>
  messages: LLMMessageParam[]
  tools?: LLMToolDefinitionAnthropic[]
  stream?: boolean
  temperature?: number
  tool_choice?: { type: 'auto' } | { type: 'tool'; name: string } | { type: 'any' }
  /** Extended thinking (Anthropic-specific, ignored by generic provider) */
  thinking?: { type: 'enabled'; budget_tokens: number } | { type: 'disabled' } | { type: 'adaptive' }
  /** Speed mode (Anthropic-specific, ignored by generic provider) */
  speed?: 'standard' | 'turbo' | 'fast'
  /** Output format config (Anthropic-specific, ignored by generic provider) */
  output?: unknown
  /** Betas header (Anthropic-specific, ignored by generic provider) */
  betas?: string[]
}

// ============================================================
// ERROR CLASSES
// ============================================================

export class LLMError extends Error {
  readonly status?: number
  readonly code?: string
  readonly requestId?: string
  /** @deprecated Anthropic SDK used requestID (uppercase D); both work now */
  readonly requestID?: string
  /** Response headers — always a Headers object so .get() always works */
  readonly headers?: Headers
  /** Raw error body from the API response (compat with Anthropic SDK APIError.error) */
  readonly error?: unknown

  constructor(
    message: string,
    status?: number,
    code?: string,
    requestId?: string,
    /** Accept either Headers or plain object at construction time */
    headers?: Headers | Record<string, string | null | undefined>,
    error?: unknown,
  ) {
    super(message)
    this.name = 'LLMError'
    this.status = status
    this.code = code
    this.requestId = requestId
    ;(this as { requestID?: string }).requestID = requestId
    // Normalize to Headers object so .get() / .has() always work
    if (headers instanceof Headers) {
      this.headers = headers
    } else if (headers) {
      const h = new Headers()
      for (const [k, v] of Object.entries(headers)) {
        if (v != null) h.set(k, v)
      }
      this.headers = h
    }
    this.error = error
  }

  /** Compat: get header value — delegates to this.headers.get() */
  getHeader(name: string): string | null {
    return this.headers?.get(name) ?? null
  }
}

export class LLMConnectionError extends LLMError {
  constructor(message: string, status?: number, code?: string) {
    super(message, status, code)
    this.name = 'LLMConnectionError'
  }
}

export class LLMConnectionTimeoutError extends LLMConnectionError {
  constructor(message: string = 'Request timed out') {
    super(message)
    this.name = 'LLMConnectionTimeoutError'
  }
}

export class LLMUserAbortError extends LLMError {
  constructor(message: string = 'Request was aborted') {
    super(message)
    this.name = 'LLMUserAbortError'
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(message: string, status = 429, requestId?: string, headers?: Headers | Record<string, string | null | undefined>) {
    super(message, status, 'rate_limit_error', requestId, headers)
    this.name = 'LLMRateLimitError'
  }
}

export class LLMAuthenticationError extends LLMError {
  constructor(message: string, status = 401, requestId?: string) {
    super(message, status, 'authentication_error', requestId)
    this.name = 'LLMAuthenticationError'
  }
}

export class LLMInvalidRequestError extends LLMError {
  constructor(message: string, status = 400, requestId?: string) {
    super(message, status, 'invalid_request_error', requestId)
    this.name = 'LLMInvalidRequestError'
  }
}

// ============================================================
// COMPAT TYPE ALIASES
// Files that still import Anthropic SDK type names by their old names
// will find them here. All resolve to the real types defined above.
// ============================================================

export type BetaToolChoiceAuto = { type: 'auto' }
export type BetaToolChoiceTool = { type: 'tool'; name: string }
export type ContentBlockParam = ContentBlock
export type TextBlockParam = TextBlock
export type ToolUseBlockParam = ToolUseBlock
export type ToolResultBlockParam = ToolResultBlock
export type ImageBlockParam = ImageBlock
export type MessageParam = LLMMessageParam

// Value-level compat for error classes (old names → new names)
// These are exported as both value and type so `instanceof` works.
export { LLMError as APIError }
export { LLMConnectionError as APIConnectionError }
export { LLMConnectionTimeoutError as APIConnectionTimeoutError }
export { LLMUserAbortError as APIUserAbortError }

// Anthropic SDK compat: NotFoundError and AuthenticationError
export class NotFoundError extends LLMError {
  constructor(message: string, status = 404, requestId?: string) {
    super(message, status, 'not_found_error', requestId)
    this.name = 'NotFoundError'
  }
}

export { LLMAuthenticationError as AuthenticationError }

// Dummy Anthropic namespace object/type so files that use
// `Anthropic.Beta.Messages.*` or `Anthropic.Tool.InputSchema` still compile.
export type Anthropic = {
  Tool: {
    InputSchema: Record<string, unknown>
  }
  Beta: {
    Messages: {
      BetaMessage: LLMMessage
      BetaMessageParam: LLMMessageParam
      BetaContentBlock: ContentBlock
      BetaToolUnion: LLMToolUnion
      BetaUsage: LLMUsage
    }
  }
}

// ClientOptions stub - some files destructure this from sdk imports
export type ClientOptions = {
  apiKey?: string
  baseURL?: string
  maxRetries?: number
  timeout?: number
  fetch?: typeof fetch
  [key: string]: unknown
}

// Stream stub - some files import Stream from streaming.mjs
export type Stream<T> = AsyncIterable<T>

// BetaOutputConfig / BetaJSONOutputFormat — Anthropic-specific output shaping.
// These are no-ops for the generic provider; types kept for structural compat.
export type BetaJSONOutputFormat = {
  type: 'json'
  json_schema?: Record<string, unknown>
}

export type BetaOutputConfig = {
  effort?: string | number
  task_budget?: unknown
  [key: string]: unknown
}

// BetaImageBlockParam, BetaContentBlockParam, BetaRequestDocumentBlock — mapped to our types
export type BetaImageBlockParam = ImageBlock
export type BetaContentBlockParam = ContentBlock
export type BetaRequestDocumentBlock = DocumentBlock

// BetaMessageDeltaUsage alias
export type BetaMessageDeltaUsage = LLMUsage
