/**
 * Multi-path LLM provider detection.
 *
 * PATH A (Anthropic): ANTHROPIC_API_KEY set, LLM_BASE_URL NOT set → return 'anthropic'
 * PATH B (Generic):   LLM_BASE_URL set                             → return 'generic'
 * PATH C (Qwen):      QWEN_OAUTH=1 set                            → return 'qwen'
 *
 * Legacy provider values ('firstParty', 'bedrock', 'vertex', 'foundry') are kept in
 * the type for compatibility with existing comparisons in the codebase —
 * getAPIProvider() will never return them, so those code paths are safely disabled.
 */

export type APIProvider = 'anthropic' | 'generic' | 'qwen' | 'firstParty' | 'bedrock' | 'vertex' | 'foundry'

export function getAPIProvider(): APIProvider {
  // Priority 1: Qwen OAuth mode (QWEN_OAUTH=1)
  // Once initQwenOAuth() runs, LLM_BASE_URL is set, so we check QWEN_OAUTH first
  const qwenVal = process.env.QWEN_OAUTH
  if (qwenVal === '1' || qwenVal === 'true') {
    return 'qwen'
  }
  // Priority 2: Anthropic wins if its key is set AND generic base URL is NOT set
  if (process.env.ANTHROPIC_API_KEY && !process.env.LLM_BASE_URL) {
    return 'anthropic'
  }
  // Priority 3: Generic if LLM_BASE_URL is set (regardless of ANTHROPIC_API_KEY)
  if (process.env.LLM_BASE_URL) {
    return 'generic'
  }
  // Default to anthropic (will fail at runtime without a key, matches original behavior)
  return 'anthropic'
}

/** True when running with Path A (real Anthropic SDK + full feature set) */
export function isAnthropic(): boolean {
  return getAPIProvider() === 'anthropic'
}

/** True when running with Path B (generic OpenAI-compatible provider) or Path C (Qwen OAuth) */
export function isGenericLLM(): boolean {
  const provider = getAPIProvider()
  return provider === 'generic' || provider === 'qwen'
}

/** True when running with Path C (Qwen OAuth device flow) */
export function isQwenOAuth(): boolean {
  return getAPIProvider() === 'qwen'
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Only meaningful for Path A (isAnthropic() === true).
 * Returns true when no override URL is configured (api.anthropic.com is default).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) return true
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}

/**
 * Get the API provider name as an analytics metadata string.
 * Used by logging.ts to tag events with the active provider.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAPIProviderForStatsig(): any {
  return getAPIProvider()
}
