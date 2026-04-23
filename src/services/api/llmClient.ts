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

    // ── BYOK TOKEN OPTIMIZER ──────────────────────────────────────────────
    // Claude Code was designed for Anthropic's prompt-caching API.
    // With BYOK providers (no caching), the system prompt + tool schemas are
    // billed at full price every call. These transforms cut ~40-50% of tokens
    // with no functional loss for most coding tasks.
    //
    // Cuts applied (BYOK only):
    //  1. Strip x-anthropic-* billing headers from system (useless on BYOK)
    //  2. Trim tool descriptions to first sentence (keeps intent, drops fluff)
    //  3. Strip parameter-level descriptions (model infers from param name)
    //  4. Strip <system-reminder> deferred-tools blocks from user messages

    const _isByok = !!this.baseURL // always true in this client — it IS the BYOK client

    /** Strip Anthropic-internal headers from the raw system string */
    function _cleanSystem(raw: string): string {
      return raw
        // Remove x-anthropic-* header lines (billing metadata, useless for BYOK)
        .replace(/^x-anthropic-[^\n]*\n/gm, '')
        .trim()
    }

    /** Strip <system-reminder>…</system-reminder> blocks from a user text */
    function _stripSystemReminders(text: string): string {
      return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
    }

    /** Compress a tool parameter schema: remove description, $schema, additionalProperties */
    function _compressParams(params: unknown): unknown {
      if (!params || typeof params !== 'object') return params
      const p = params as Record<string, unknown>
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(p)) {
        // Strip top-level metadata that models don't need
        if (k === '$schema' || k === 'additionalProperties') continue
        if (k === 'properties' && v && typeof v === 'object') {
          const compressed: Record<string, unknown> = {}
          for (const [prop, def] of Object.entries(v as Record<string, unknown>)) {
            if (def && typeof def === 'object') {
              // Keep only type, enum, items, $ref, required — drop description, $schema, additionalProperties
              const { description: _desc, $schema: _s, additionalProperties: _ap, ...rest } = def as Record<string, unknown>
              compressed[prop] = rest
            } else {
              compressed[prop] = def
            }
          }
          result[k] = compressed
        } else {
          result[k] = v
        }
      }
      return result
    }

    /** Trim a tool description to its first sentence (up to 120 chars) */
    function _trimDesc(desc: string | undefined): string | undefined {
      if (!desc) return desc
      const dot = desc.search(/\.\s/)
      const cut = dot > 0 && dot < 120 ? dot + 1 : Math.min(desc.length, 120)
      return desc.slice(0, cut).trim()
    }
    // ── END OPTIMIZER HELPERS ─────────────────────────────────────────────

    // Prepend system message if provided
    if (params.system) {
      let systemText =
        typeof params.system === 'string'
          ? params.system
          : params.system.map((s) => s.text).join('\n')
      systemText = _cleanSystem(systemText)
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
            // Strip <system-reminder> deferred-tools blocks from user messages.
            // These list 13 background tools the model can't use on BYOK anyway.
            // Saves ~3,700 actual tokens per call.
            const cleaned = msg.role === 'user'
              ? _stripSystemReminders(block.text)
              : block.text
            if (!cleaned) continue  // block was pure system-reminder — drop it
            parts.push({ type: 'text', text: cleaned })
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
          // Flatten text-only messages to plain string (saves array wrapper overhead)
          const allText = parts.every((p: unknown) => (p as { type: string }).type === 'text')
          if (allText) {
            const text = parts.map((p: unknown) => (p as { text: string }).text).join('')
            messages.push({ role: msg.role, content: text })
          } else {
            messages.push({ role: msg.role, content: parts })
          }
        }
      }
    }

    // Map LLMToolDefinition[] → OpenAI tools
    // BYOK optimizer: compress schemas to cut ~15,000 tokens per call.
    //  • Tool description trimmed to first sentence (keeps intent)
    //  • Parameter-level descriptions stripped (model infers from param name)
    const tools =
      params.tools && params.tools.length > 0
        ? params.tools.map((t: any) => {
            // Claude Code sometimes passes tools that are already partially or fully in the OpenAI format.
            // If we access t.name on an OpenAI formatted tool { type: 'function', function: { name: '...' } },
            // we get undefined, which causes HTTP 400 'Invalid function name' on providers like Google.
            const n = t.name ?? t.function?.name
            const d = t.description ?? t.function?.description
            const p = t.input_schema ?? t.function?.parameters

            return {
              type: 'function' as const,
              function: {
                name: n,
                description: _trimDesc(d),       // ← trim to first sentence
                parameters: _compressParams(p),   // ← strip param descriptions
              },
            }
          })
        : undefined

    // Strip tools if the model previously rejected them
    const effectiveTools = _modelToolsUnsupported ? undefined : tools

    // ── BYOK prompt trimmer ─────────────────────────────────────────
    // Strip heavyweight Anthropic-specific sections from the system prompt
    // for non-Anthropic endpoints. Saves ~3,600 tokens per request.
    // This is a safety net — if CLAUDE_CODE_SIMPLE correctly fires, the
    // system prompt is already tiny and these regexes will be no-ops.
    const isNonAnthropicEndpoint = !this.baseURL.includes('anthropic') &&
      !this.baseURL.includes('claude')
    if (isNonAnthropicEndpoint) {
      const sysIdx = messages.findIndex((m: Record<string, unknown>) => m.role === 'system')
      if (sysIdx >= 0) {
        const sysMsg = messages[sysIdx] as Record<string, unknown>
        let content = String(sysMsg.content ?? '')
        if (content.length > 500) {
          // Strip "# auto memory" section (~2,200 tokens of memory management instructions)
          content = content.replace(/# auto memory[\s\S]*?(?=\n# [A-Z]|$)/i, '')
          // Strip "# Executing actions with care" section (~800 tokens of safety warnings)
          content = content.replace(/# Executing actions with care[\s\S]*?(?=\n# [A-Z]|$)/i, '')
          // Strip XML <types>...</types> blocks (~600 tokens of memory type examples)
          content = content.replace(/<types>[\s\S]*?<\/types>/g, '')
          // Strip "# Session-specific guidance" section
          content = content.replace(/# Session-specific guidance[\s\S]*?(?=\n# [A-Z]|$)/i, '')
          // Collapse multiple blank lines left by removals
          content = content.replace(/\n{3,}/g, '\n\n')
          messages[sysIdx] = { ...sysMsg, content: content.trim() }
        }
      }
    }

    // Detect providers that don't support all OpenAI request fields.
    // Google's generativelanguage endpoint rejects 'stream_options' with HTTP 400.
    const isGoogleEndpoint = this.baseURL.includes('googleapis.com')

    // Clamp max_tokens for providers with known limits.
    // Alibaba MaaS (DashScope/Qwen): cap at 2048 to prevent "looping content"
    // errors — Qwen's server-side filter triggers when the model generates too
    // much repetitive text. Shorter responses = much less looping.
    const isAlibabaEndpoint = this.baseURL.includes('aliyuncs.com') || this.baseURL.includes('dashscope')
    const maxTokensCap = isAlibabaEndpoint ? 2048 : undefined
    const effectiveMaxTokens = maxTokensCap
      ? Math.min(params.max_tokens, maxTokensCap)
      : params.max_tokens

    // Alibaba/Qwen: inject loop detection bypass into messages.
    // Qwen's server-side filter rejects model output it considers "looping".
    // The API error says: "add the tag [ignoring loop detection] to your output"
    // We inject it into BOTH the system message and the last user message
    // to maximize the chance the model echoes/includes it in output context.
    if (isAlibabaEndpoint) {
      const loopTag = '\n[ignoring loop detection]'

      // Inject into system message
      const sysIdx = messages.findIndex((m: Record<string, unknown>) => m.role === 'system')
      if (sysIdx >= 0) {
        const sysMsg = messages[sysIdx] as Record<string, unknown>
        const content = String(sysMsg.content ?? '')
        if (!content.includes('[ignoring loop detection]')) {
          messages[sysIdx] = { ...sysMsg, content: content + loopTag }
        }
      }

      // Also inject into the last user message
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i] as Record<string, unknown>
        if (m.role === 'user') {
          const c = typeof m.content === 'string' ? m.content : ''
          if (c && !c.includes('[ignoring loop detection]')) {
            messages[i] = { ...m, content: c + loopTag }
          }
          break
        }
      }
    }

    // Alibaba/Qwen: default temperature to 0.7 to reduce repetitive output.
    // Low/no temperature = deterministic = more likely to trigger loop detection.
    const effectiveTemp = isAlibabaEndpoint && params.temperature === undefined
      ? 0.7
      : params.temperature

    const body: Record<string, unknown> = {
      model: params.model || this.model,
      messages,
      max_tokens: effectiveMaxTokens,
      stream: true,
      // stream_options is OpenAI-specific — Google (and some others) reject it
      ...(!isGoogleEndpoint ? { stream_options: { include_usage: true } } : {}),
      ...(effectiveTools ? { tools: effectiveTools } : {}),
      ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
      ...(params.tool_choice && !_modelToolsUnsupported ? { tool_choice: params.tool_choice.type } : {}),
      // Alibaba/Qwen: penalty params to reduce repetition in output.
      ...(isAlibabaEndpoint ? { frequency_penalty: 0.8, presence_penalty: 0.5 } : {}),
    }

    // Build the completion URL.
    // Google: baseURL = https://generativelanguage.googleapis.com/v1beta/openai
    //   → append /chat/completions directly (the path is already the full mount point)
    // Standard OpenAI-style: baseURL = https://openrouter.ai/api/v1
    //   → strip any trailing /v1 then append /v1/chat/completions
    const base = this.baseURL.replace(/\/+$/, '') // strip trailing slashes
    let url: string
    if (isGoogleEndpoint) {
      // Google's full-path endpoint — just append the method
      url = `${base}/chat/completions`
    } else if (base.endsWith('/chat/completions')) {
      // Already a complete URL
      url = base
    } else {
      // Standard OpenAI convention: normalize so we always have exactly one /v1/
      const withoutV1 = base.endsWith('/v1') ? base.slice(0, -3) : base
      url = `${withoutV1}/v1/chat/completions`
    }

    // ── REQUEST CAPTURE ────────────────────────────────────────────────────
    // Activated by: --capture / -cap flag  or  CLAUDE_CAPTURE=1 env var
    //
    // Outputs:
    //   1. ~/.claude/captures/capture-<N>.json  — FULL raw request (nothing skipped)
    //   2. ~/.claude/captures/index.json        — cumulative index of all captures
    //   3. stderr                               — colorized real-time analysis
    //
    // Each capture file contains:
    //   - Exact raw JSON body (what the server receives)
    //   - Every message with FULL content (no truncation)
    //   - Per-message token estimates
    //   - All tool schemas with names and sizes
    //   - Timestamps (ISO, local, epoch ms)
    //   - Request metadata (url, model, max_tokens, temperature, etc.)
    const _captureStartMs = Date.now()
    if (process.env.CLAUDE_CAPTURE === '1') {
      try {
        const _fs   = require('fs')   as typeof import('fs')
        const _os   = require('os')   as typeof import('os')
        const _path = require('path') as typeof import('path')

        const captureDir = _path.join(_os.homedir(), '.claude', 'captures')
        _fs.mkdirSync(captureDir, { recursive: true })

        const indexPath = _path.join(captureDir, 'index.json')
        const now = new Date()
        const bodyStr = JSON.stringify(body)

        // ── Parse all messages ─────────────────────────────────────────
        const allMsgs = (body.messages ?? []) as Array<{role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string; name?: string}>
        const msgDetails = allMsgs.map((m, i) => {
          const raw = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
          return {
            index: i,
            role: m.role,
            content_full: raw,                       // ← FULL content, NOTHING skipped
            content_chars: raw.length,
            content_est_tokens: Math.round(raw.length / 4),
            ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            ...(m.name ? { name: m.name } : {}),
          }
        })

        // ── Parse tools ────────────────────────────────────────────────
        const rawTools = (body.tools ?? []) as Array<{function?: {name?: string; description?: string; parameters?: unknown}; name?: string; type?: string}>
        const toolDetails = rawTools.map((t, i) => {
          const tStr = JSON.stringify(t)
          return {
            index: i,
            name: t?.function?.name ?? t?.name ?? '?',
            type: t?.type ?? 'function',
            description_preview: (t?.function?.description ?? '').slice(0, 200),
            schema_chars: tStr.length,
            schema_est_tokens: Math.round(tStr.length / 4),
          }
        })

        // ── Per-role aggregation ───────────────────────────────────────
        const byRole = (role: string) => msgDetails.filter(m => m.role === role)
        const sumTokens = (arr: typeof msgDetails) => arr.reduce((s, m) => s + m.content_est_tokens, 0)
        const sumChars  = (arr: typeof msgDetails) => arr.reduce((s, m) => s + m.content_chars, 0)

        const systemMsgs = byRole('system')
        const userMsgs   = byRole('user')
        const assistMsgs = byRole('assistant')
        const toolMsgs   = byRole('tool')

        const toolSchemaChars = rawTools.reduce((s, t) => s + JSON.stringify(t).length, 0)
        const totalEstTokens  = Math.round(bodyStr.length / 4)

        // ── Build the capture index entry ──────────────────────────────
        let idx = 1
        try {
          const existing = JSON.parse(_fs.readFileSync(indexPath, 'utf8'))
          if (Array.isArray(existing)) idx = existing.length + 1
        } catch { /* fresh start */ }

        const captureFile = _path.join(captureDir, `capture-${String(idx).padStart(4, '0')}.json`)

        const capture = {
          // ── Metadata ──────────────────────────────────────────────────
          capture_index: idx,
          timestamps: {
            iso:       now.toISOString(),
            local:     now.toLocaleString(),
            epoch_ms:  now.getTime(),
            timezone:  Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          request: {
            url,
            method: 'POST',
            model: body.model,
            max_tokens: body.max_tokens,
            temperature: body.temperature ?? '(not set)',
            stream: body.stream,
            frequency_penalty: body.frequency_penalty ?? '(not set)',
            presence_penalty: body.presence_penalty ?? '(not set)',
            tool_choice: body.tool_choice ?? '(not set)',
          },

          // ── Token Summary ─────────────────────────────────────────────
          token_summary: {
            total_body_chars: bodyStr.length,
            total_est_tokens: totalEstTokens,
            breakdown: {
              system:    { messages: systemMsgs.length, chars: sumChars(systemMsgs), est_tokens: sumTokens(systemMsgs) },
              user:      { messages: userMsgs.length,   chars: sumChars(userMsgs),   est_tokens: sumTokens(userMsgs) },
              assistant: { messages: assistMsgs.length, chars: sumChars(assistMsgs), est_tokens: sumTokens(assistMsgs) },
              tool:      { messages: toolMsgs.length,   chars: sumChars(toolMsgs),   est_tokens: sumTokens(toolMsgs) },
              tools_schema: { count: rawTools.length, chars: toolSchemaChars, est_tokens: Math.round(toolSchemaChars / 4) },
            },
          },

          // ── Every message — FULL content ──────────────────────────────
          messages: msgDetails,

          // ── Tool schemas — names and sizes ────────────────────────────
          tools: toolDetails,

          // ── RAW body — the EXACT JSON sent to the server ──────────────
          raw_body: body,
        }

        // ── Write individual capture file ──────────────────────────────
        _fs.writeFileSync(captureFile, JSON.stringify(capture, null, 2), { encoding: 'utf8', mode: 0o600 })

        // ── Update index ───────────────────────────────────────────────
        let indexArr: Array<{index: number; time: string; model: unknown; est_tokens: number; file: string}> = []
        try {
          const existing = JSON.parse(_fs.readFileSync(indexPath, 'utf8'))
          if (Array.isArray(existing)) indexArr = existing
        } catch { /* fresh */ }
        indexArr.push({
          index: idx,
          time: now.toISOString(),
          model: body.model,
          est_tokens: totalEstTokens,
          file: `capture-${String(idx).padStart(4, '0')}.json`,
        })
        _fs.writeFileSync(indexPath, JSON.stringify(indexArr, null, 2), { encoding: 'utf8', mode: 0o600 })

        // ── STDERR: Real-time analysis ─────────────────────────────────
        const c = (code: string, s: string | number) => `\x1b[${code}m${s}\x1b[0m`
        const bar = (label: string, tokens: number, total: number) => {
          const pct = total > 0 ? Math.round((tokens / total) * 100) : 0
          const barLen = Math.min(30, Math.max(0, Math.round((tokens / Math.max(1, total)) * 30)))
          const barStr = '█'.repeat(barLen) + '░'.repeat(30 - barLen)
          return `  ${label.padEnd(14)} ${barStr}  ${String(tokens).padStart(7)} tok  ${String(pct).padStart(3)}%`
        }

        const sysTokens   = sumTokens(systemMsgs)
        const usrTokens   = sumTokens(userMsgs)
        const asstTokens  = sumTokens(assistMsgs)
        const tlMsgTokens = sumTokens(toolMsgs)
        const schTokens   = Math.round(toolSchemaChars / 4)
        const otherTokens = Math.max(0, totalEstTokens - sysTokens - usrTokens - asstTokens - tlMsgTokens - schTokens)

        // Top user message preview (last one sent)
        const lastUser = userMsgs[userMsgs.length - 1]
        const userPreview = lastUser
          ? lastUser.content_full.slice(0, 120) + (lastUser.content_full.length > 120 ? '…' : '')
          : '(none)'

        const toolNamesList = toolDetails.map(t => t.name)

        const lines = [
          '',
          c('36;1', `┌─ 📡 CAPTURE #${idx} ─────────────────────────────────────────`),
          c('36',   `│ ${now.toLocaleString()}  ·  ${Intl.DateTimeFormat().resolvedOptions().timeZone}`),
          c('36',   `│ Model: ${c('1', body.model as string)}  ·  max_tokens: ${body.max_tokens}`),
          c('36',   `│ URL: ${url}`),
          c('36',   `├─────────────────────────────────────────────────────────────`),
          c('33;1', `│ Total: ~${totalEstTokens.toLocaleString()} tokens  (${bodyStr.length.toLocaleString()} chars)`),
          `│`,
          `│ ${c('1', 'TOKEN BREAKDOWN')}`,
          `│ ${bar('System',       sysTokens,    totalEstTokens)}`,
          `│ ${bar('Tool Schemas', schTokens,    totalEstTokens)}`,
          `│ ${bar('User Msgs',    usrTokens,    totalEstTokens)}`,
          `│ ${bar('Asst Msgs',    asstTokens,   totalEstTokens)}`,
          `│ ${bar('Tool Results', tlMsgTokens,  totalEstTokens)}`,
          `│ ${bar('Other',        otherTokens,  totalEstTokens)}`,
          `│`,
          `│ ${c('1', 'MESSAGES')}  ${allMsgs.length} total  (${systemMsgs.length} sys, ${userMsgs.length} user, ${assistMsgs.length} asst, ${toolMsgs.length} tool)`,
          `│ ${c('1', 'YOUR MSG')}  ${c('33', userPreview)}`,
          `│`,
          `│ ${c('1', `TOOLS (${rawTools.length})`)}  ${toolNamesList.length > 0 ? toolNamesList.join(', ') : '(none)'}`,
          `│`,
          c('2', `│ Full capture: ${captureFile}`),
          c('36;1', `└─────────────────────────────────────────────────────────────`),
          '',
        ].join('\n')
        process.stderr.write(lines)

      } catch (captureErr) {
        // Log capture errors to stderr but never break the request
        try { process.stderr.write(`[capture error] ${captureErr}\n`) } catch { /* */ }
      }
    }
    // ── END CAPTURE ────────────────────────────────────────────────────────

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
      // [DEBUG] Log response status
      try {
        const resDebug = `  → Response: ${response.status} ${response.statusText}\n\n`
        require('fs').appendFileSync(require('path').join(require('os').homedir(), '.claude', 'llm-debug.log'), resDebug)
      } catch { /* non-fatal */ }
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

    // Track error text across both !response.ok blocks so the body is only
    // consumed once (HTTP bodies are single-read streams).
    let _cachedErrorText: string | undefined

    if (!response.ok) {
      // ── Fallback: retry without tools if model doesn't support them ────
      if (response.status === 400 && body.tools) {
        _cachedErrorText = await response.text()
        if (_cachedErrorText.includes('does not support tools') || _cachedErrorText.includes('tools is not supported')) {
          _modelToolsUnsupported = true
          process.stderr.write(
            `[LLMClient] Model does not support tools, retrying without them.\n` +
            `[LLMClient] Hint: pull the official model (e.g. "ollama pull qwen2.5-coder:3b") for tool support.\n`
          )
          delete body.tools
          delete body.tool_choice
          _cachedErrorText = undefined // reset — new response will have its own body
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
      // Reuse already-consumed body if available, otherwise read fresh
      let errorText = ''
      try {
        errorText = _cachedErrorText ?? await response.text()
      } catch { /* ignore read errors */ }

      // [DEBUG] Log error details
      try {
        const errDebug = `  → ERROR: ${response.status} ${response.statusText}\n  → Body: ${errorText.slice(0, 500)}\n\n`
        require('fs').appendFileSync(require('path').join(require('os').homedir(), '.claude', 'llm-debug.log'), errDebug)
      } catch { /* non-fatal */ }

      if (response.status === 429) {
        // Parse into a clean human-readable message instead of dumping raw JSON
        const friendlyMsg = _parseRateLimitMessage(errorText, this.baseURL)
        throw new LLMRateLimitError(
          friendlyMsg,
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
        // Qwen/Alibaba: "looping content" error is not retryable — it's a
        // content-level rejection from their safety filter.
        if (errorText.includes('looping content') || errorText.includes('InvalidParameter')) {
          // Extract the actual message from the JSON error
          let userMsg = errorText
          try {
            const parsed = JSON.parse(errorText)
            userMsg = parsed?.error?.message || parsed?.message || errorText
          } catch { /* use raw */ }
          throw new LLMConnectionError(
            `API Error: ${userMsg}`,
            response.status,
          )
        }
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
// RATE LIMIT MESSAGE PARSER
// ============================================================

/**
 * Parse a raw 429 response body into a clean, human-readable error message.
 *
 * Handles:
 *  - Google Gemini:  { error: { message: "...", status: "RESOURCE_EXHAUSTED" } }
 *  - OpenAI style:   { error: { message: "..." } }
 *  - Plain string fallback
 *
 * Returns a concise single-line string suitable for display in the TUI.
 */
function _parseRateLimitMessage(rawBody: string, baseURL: string): string {
  const isGoogle = baseURL.includes('googleapis.com')

  // Try to parse JSON — handle both object {…} and array [{…}] shapes
  let parsed: Record<string, unknown> | null = null
  try {
    const j = JSON.parse(rawBody)
    if (Array.isArray(j) && j.length > 0 && typeof j[0] === 'object') {
      // e.g. [{"error": {...}}]
      parsed = j[0] as Record<string, unknown>
    } else if (j && typeof j === 'object' && !Array.isArray(j)) {
      parsed = j as Record<string, unknown>
    }
  } catch { /* not JSON — fall through */ }

  if (parsed) {
    // Google / OpenAI envelope: { "error": { "message": "...", ... } }
    const errObj = parsed.error as Record<string, unknown> | undefined
    if (errObj && typeof errObj.message === 'string') {
      const raw = errObj.message as string

      if (isGoogle) {
        // Google's message is multi-line with quota metric details.
        // Extract just the first sentence (up to first newline or period).
        const firstLine = raw.split('\n')[0]!.trim()
        // Strip "Please retry in Xs" from the first line if it's there,
        // we'll re-add it cleanly below.
        const mainMsg = firstLine
          .replace(/\s*Please retry in[\d\s.]+s\.?/i, '')
          .trim()

        // Extract retry hint: "Please retry in 15.09s"
        const retryMatch = raw.match(/Please retry in ([\d.]+)s/i)
        const retryHint = retryMatch
          ? ` — please retry in ~${Math.ceil(Number(retryMatch[1]))}s`
          : ''

        // Try to extract which model is exhausted
        const modelMatch = raw.match(/model:\s*([\w.\-/]+)/)
        const modelHint = modelMatch ? ` (model: ${modelMatch[1]})` : ''

        return `⚠️  Rate limit exceeded${modelHint}: ${mainMsg}${retryHint}`
      }

      // Generic OpenAI-style — just return the message trimmed
      return `⚠️  Rate limit exceeded: ${raw.split('\n')[0]!.trim()}`
    }

    // Some providers return { "message": "..." } at root level
    if (typeof parsed.message === 'string') {
      return `⚠️  Rate limit exceeded: ${(parsed.message as string).split('\n')[0]!.trim()}`
    }
  }

  // Fallback: raw body was not JSON (or had unexpected shape)
  if (rawBody && rawBody.length > 0) {
    // Take first 200 chars to avoid flooding the TUI
    const snippet = rawBody.slice(0, 200).replace(/\n+/g, ' ').trim()
    return `⚠️  Rate limit exceeded: ${snippet}`
  }

  return '⚠️  Rate limit exceeded — please wait and try again'
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
