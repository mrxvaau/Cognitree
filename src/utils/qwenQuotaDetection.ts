/**
 * Qwen / DashScope quota and rate-limit error detection.
 *
 * DashScope returns errors in a JSON body:
 *   { "code": "...", "message": "...", "request_id": "..." }
 *
 * Known quota/rate-limit codes:
 *   - "insufficient_quota"  → free-tier 1000 req/day exhausted
 *   - "rate_limit_exceeded" → per-minute or per-second throttle
 *   - "Throttling"          → legacy DashScope throttle code
 *   - "Arrearage"           → unpaid balance (if upgrading to paid)
 */

import { LLMError } from 'src/types/llm.js'

// ──────────────────────────────────────────────────────────────────
// DashScope error body shape
// ──────────────────────────────────────────────────────────────────

interface DashScopeErrorBody {
  code?: string
  message?: string
  request_id?: string
}

/**
 * Try to extract a DashScope error body from an LLMError.
 * The error message from LLMClient is typically the raw body text
 * or "HTTP 429: Too Many Requests" — both may contain JSON.
 */
export function parseDashScopeError(error: unknown): DashScopeErrorBody | null {
  if (!(error instanceof LLMError)) return null

  const msg = error.message || ''

  // Try parsing the whole message as JSON
  try {
    const parsed = JSON.parse(msg)
    if (parsed && typeof parsed === 'object' && parsed.code) {
      return parsed as DashScopeErrorBody
    }
  } catch {
    // Not JSON, try extracting JSON from the message
  }

  // Try extracting JSON from within the message (e.g., "429 {"code":"...","message":"..."}")
  const jsonMatch = msg.match(/\{[^}]*"code"\s*:\s*"[^"]*"[^}]*\}/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as DashScopeErrorBody
    } catch {
      // Couldn't parse
    }
  }

  // Try extracting the code from the message text
  if (msg.includes('insufficient_quota')) {
    return { code: 'insufficient_quota', message: msg }
  }
  if (msg.includes('Throttling') || msg.includes('rate_limit_exceeded')) {
    return { code: 'rate_limit_exceeded', message: msg }
  }
  if (msg.includes('Arrearage')) {
    return { code: 'Arrearage', message: msg }
  }

  return null
}

// ──────────────────────────────────────────────────────────────────
// Quota exceeded detection
// ──────────────────────────────────────────────────────────────────

/**
 * Detect if an error is a Qwen/DashScope quota exceeded error.
 * This means the free daily quota (1000 requests) has been used up.
 */
export function isQwenQuotaExceededError(error: unknown): boolean {
  const dsError = parseDashScopeError(error)
  if (dsError?.code === 'insufficient_quota') return true
  if (dsError?.code === 'Arrearage') return true

  // Fall back to message text matching
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('free allocated quota exceeded')) return true
    if (msg.includes('insufficient_quota')) return true
    if (msg.includes('quota exceeded') && msg.includes('dashscope')) return true
  }

  return false
}

/**
 * Detect if an error is a Qwen/DashScope rate limit (throttle) error.
 * This is a temporary per-minute/per-second limit, NOT daily quota exhaustion.
 */
export function isQwenRateLimitError(error: unknown): boolean {
  const dsError = parseDashScopeError(error)
  if (dsError?.code === 'rate_limit_exceeded') return true
  if (dsError?.code === 'Throttling') return true

  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('throttling') && msg.includes('dashscope')) return true
    if (msg.includes('requests per') && msg.includes('limit')) return true
  }

  return false
}

/**
 * Whether the error is any kind of Qwen-specific error (quota or rate limit).
 */
export function isQwenAPIError(error: unknown): boolean {
  return isQwenQuotaExceededError(error) || isQwenRateLimitError(error)
}

// ──────────────────────────────────────────────────────────────────
// User-facing error messages
// ──────────────────────────────────────────────────────────────────

export function getQwenQuotaExceededMessage(): string {
  return 'Qwen daily quota exhausted · Your free tier allows 1000 requests/day. Try again tomorrow, or set a DashScope API key to continue.'
}

export function getQwenRateLimitMessage(): string {
  return 'Qwen rate limit · Too many requests per minute. Retrying automatically...'
}

export function getQwenAuthFailedMessage(): string {
  return 'Qwen authentication failed · Run the CLI again with QWEN_OAUTH=1 to re-authenticate.'
}
