# Blueprint: Add Generic OpenAI-Compatible LLM Provider

You are tasked with adding a generic OpenAI-compatible LLM provider to this codebase.
This project currently only works with Anthropic's Claude via `@anthropic-ai/sdk`.
Your goal: add support for ANY LLM that speaks OpenAI `/v1/chat/completions` format
(Ollama, OpenRouter, OpenAI, Groq, vLLM, etc.) — WITHOUT breaking the existing Anthropic path.

## CRITICAL RULES

1. **ZERO BREAKING CHANGES** — the existing Anthropic path must work identically after every change
2. At every step, the project must build (run `bun run tsc --noEmit` to verify)
3. Add new code alongside existing code. Do NOT delete anything in this phase
4. Use absolute file paths. All paths are relative to: `D:\Project\REFECTOR\CC`
5. Complete each phase fully before moving to the next

---

## PHASE 1: Create Shared Type Definitions

### NEW FILE: `src/types/llm.ts`

Create this file with our own type definitions that replace `@anthropic-ai/sdk` types.
These must match the shapes the Anthropic API returns so downstream code doesn't know the difference.

The file must export:

```typescript
// ============================================================
// CONTENT BLOCK TYPES — what messages can contain
// ============================================================

export type TextBlock = {
  type: 'text'
  text: string
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
  content: string | Array<TextBlock>
  is_error?: boolean
}

export type ImageBlock = {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}

export type ThinkingBlock = {
  type: 'thinking'
  thinking: string
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock
  | ThinkingBlock

// ============================================================
// MESSAGE TYPES
// ============================================================

export type LLMMessageParam = {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

// ============================================================
// TOOL DEFINITION TYPE — sent to the API to declare available tools
// ============================================================

export type LLMToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>  // JSON Schema
  }
}

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
}

export type ContentBlockStopEvent = {
  type: 'content_block_stop'
  index: number
}

export type MessageStartEvent = {
  type: 'message_start'
  message: {
    id: string
    model: string
    stop_reason: string | null
    stop_sequence: string | null
    usage: LLMUsage
  }
}

export type MessageDeltaEvent = {
  type: 'message_delta'
  delta: {
    stop_reason: string | null
    stop_sequence: string | null
  }
  usage: LLMUsage
}

export type MessageStopEvent = {
  type: 'message_stop'
  message: {
    id: string
    model: string
    stop_reason: string
    stop_sequence: string | null
    usage: LLMUsage
  }
}

export type LLMStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent

// ============================================================
// USAGE / TOKEN COUNTS
// ============================================================

export type LLMUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

// ============================================================
// ERROR CLASSES
// ============================================================

export class LLMError extends Error {
  readonly status?: number
  readonly code?: string
  constructor(message: string, status?: number, code?: string)
}

export class LLMConnectionError extends LLMError {}
export class LLMConnectionTimeoutError extends LLMConnectionError {}
export class LLMUserAbortError extends LLMError {}
export class LLMRateLimitError extends LLMError {}
export class LLMAuthenticationError extends LLMError {}

// ============================================================
// STOP REASONS
// ============================================================

export type LLMStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'tool_use'
  | 'stop_sequence'
  | 'error'

// ============================================================
// STREAM PARAMS TYPE — the request object shape
// ============================================================

export type LLMMessageStreamParams = {
  model: string
  max_tokens: number
  system?: string | Array<{ type: string; text: string; cache_control?: { type: string } }>
  messages: LLMMessageParam[]
  tools?: LLMToolDefinition[]
  stream: boolean
  temperature?: number
  tool_choice?: { type: 'auto' } | { type: 'tool'; name: string }
}
```

---

## PHASE 2: Create the Generic LLM Client

### NEW FILE: `src/services/api/llmClient.ts`

Create a client class that:
- Reads `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` from env
- Sends `POST` to `{baseURL}/v1/chat/completions`
- Handles SSE streaming
- Converts OpenAI SSE events → `LLMStreamEvent` shapes
- Returns the same shape as `anthropic.beta.messages.create().withResponse()`

**Implementation details:**

1. **Constructor** takes: `{ baseURL: string, apiKey: string, model: string }`
2. **Method** `createMessage(params: LLMMessageStreamParams, options: { signal: AbortSignal })`
3. **Build the request body:**
   - Map `system` string → `{ role: 'system', content: system }` message
   - Map `LLMMessageParam[]` → OpenAI messages array
   - Map `LLMToolDefinition[]` → OpenAI tools array
   - Set `stream: true`
4. **Headers:** `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
5. **Read the response as a stream:**
   - Use `response.body.getReader()`
   - Parse SSE lines: `data: {...}`
   - Map OpenAI events to `LLMStreamEvent`:
     - `"chunk"` → `ContentBlockDeltaEvent` with `text_delta`
     - `"tool_calls"` → `ContentBlockStartEvent` + `ContentBlockDeltaEvent` with `input_json_delta`
     - End → `MessageStopEvent` with usage
6. **Return:** `{ data: AsyncIterable<LLMStreamEvent>, response, request_id }`
7. **Handle errors:** wrap HTTP errors in `LLMConnectionError`, aborts in `LLMUserAbortError`

---

## PHASE 3: Add Generic Provider to the Provider System

### MODIFY: `src/utils/model/providers.ts`

Add `'generic'` to the `APIProvider` type and add a detection function.

```typescript
export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'generic'

export function getAPIProvider(): APIProvider {
  if (process.env.LLM_BASE_URL && !process.env.ANTHROPIC_API_KEY) {
    return 'generic'
  }
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
    ? 'bedrock'
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
      ? 'vertex'
      : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
        ? 'foundry'
        : 'firstParty'
}

export function isGenericLLM(): boolean {
  return getAPIProvider() === 'generic'
}
```

Keep all existing code unchanged. Only add the generic branch at the top.

---

## PHASE 4: Make `getAnthropicClient()` Return a Fake Anthropic Object for Generic LLM

### MODIFY: `src/services/api/client.ts`

Add this branch BEFORE the Bedrock check (around line 140, before `if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK))`):

```typescript
// Generic OpenAI-compatible LLM provider
if (isGenericLLM()) {
  const { LLMClient } = await import('./llmClient.js')
  const llmClient = new LLMClient({
    baseURL: process.env.LLM_BASE_URL || '',
    apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4',
  })

  // Return a fake Anthropic object that wraps our generic client
  return {
    beta: {
      messages: {
        async create(params: any, options: any) {
          // Translate Anthropic BetaMessageStreamParams → our LLM format
          const messages = (params.messages || []).map((msg: any) => ({
            role: msg.role,
            content: typeof msg.content === 'string'
              ? msg.content
              : msg.content.map((block: any) => {
                  if (block.type === 'text') return { type: 'text', text: block.text }
                  if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input }
                  if (block.type === 'tool_result') return { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content }
                  if (block.type === 'image') return { type: 'image', source: block.source }
                  return block
                }),
          }))

          const tools = (params.tools || []).map((tool: any) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema || { type: 'object', properties: {}, required: [] },
            },
          }))

          const result = await llmClient.createMessage({
            model: params.model || process.env.LLM_MODEL || 'gpt-4',
            max_tokens: params.max_tokens,
            system: params.system,
            messages,
            tools,
            stream: params.stream !== false,
            temperature: params.temperature,
          }, { signal: options?.signal })

          return {
            data: result.data,
            response: result.response,
            request_id: result.request_id,
          }
        },
      },
    },
  } as unknown as Anthropic
}
```

Do NOT modify any existing code. Only insert this new branch.

---

## PHASE 5: Add LLM Auth Functions

### MODIFY: `src/utils/auth.ts`

Add these new functions. Do NOT modify existing `getAnthropicApiKey()` or other functions.

```typescript
/**
 * Get the API key for generic LLM provider.
 * Falls back to ANTHROPIC_API_KEY for backwards compatibility.
 */
export function getLLMApiKey(): string {
  return process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || ''
}

/**
 * Check if LLM API key auth is available.
 */
export function hasLLMApiKeyAuth(): boolean {
  return !!getLLMApiKey()
}
```

---

## PHASE 6: Add LLM_MODEL Support to Model Selection

### MODIFY: `src/utils/model/model.ts`

In `getSmallFastModel()` and `getMainLoopModel()`, add checks for `isGenericLLM()`:

1. In `getSmallFastModel()`: if `isGenericLLM()`, return `process.env.LLM_SMALL_FAST_MODEL || process.env.LLM_MODEL || ''`
2. In `getMainLoopModel()`: if `isGenericLLM()`, return `process.env.LLM_MODEL || ''`
3. Add `LLM_MODEL` and `LLM_SMALL_FAST_MODEL` to any env var lists

Do NOT change existing Anthropic model logic.

---

## PHASE 7: Update CSP for Generic LLM

### MODIFY: `web/middleware.ts`

In the Content-Security-Policy header, add `LLM_BASE_URL` to `connect-src`:

```typescript
const llmBaseURL = process.env.LLM_BASE_URL
const connectSrc = `'self' wss: https://api.anthropic.com${llmBaseURL ? ` ${llmBaseURL}` : ''}`
```

---

## PHASE 8: Verify Build

Run: `bun run tsc --noEmit`

Fix any TypeScript errors. The project must compile cleanly.

---

## PHASE 9: Verify Runtime

The project now has TWO independent paths:

- **PATH A (existing):** `ANTHROPIC_API_KEY` set → Anthropic SDK → Claude
- **PATH B (new):** `LLM_BASE_URL` set → Our client → Any OpenAI-compatible LLM

Test that:
1. If only `ANTHROPIC_API_KEY` is set, Path A runs (unchanged behavior)
2. If only `LLM_BASE_URL` + `LLM_API_KEY` are set, Path B runs
3. If both are set, Path A wins (backwards compatible)

---

## IMPORTANT NOTES

- `@anthropic-ai/sdk` types are used as `import type` in ~138 files. Do NOT touch those files in this phase.
- The fake Anthropic object in `client.ts` is cast `as unknown as Anthropic`, so TypeScript accepts it even though the internal implementation is different.
- The `LLMClient` returns `LLMStreamEvent` which is shaped like Anthropic's `BetaRawMessageStreamEvent`, so downstream code in `claude.ts` doesn't know the difference.
- Prompt caching, extended thinking, and other Anthropic-specific features are NOT supported by the generic provider. That's fine — they'll just be no-ops when using generic LLM.
- Do NOT remove `@anthropic-ai/sdk`. Do NOT delete any existing code. This phase is ADD-ONLY.

**Start with Phase 1 and complete all phases in order.**
