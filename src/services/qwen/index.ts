/**
 * Qwen OAuth public API.
 *
 * This module is the main entry point for Qwen authentication.
 * Used by the API client layer and the startup/auth flow.
 */

export {
  type QwenCredentials,
  QwenOAuth2Client,
  loadCachedCredentials,
  cacheQwenCredentials,
  clearQwenCredentials,
  runQwenDeviceAuthFlow,
  getDashScopeBaseURL,
} from './qwenOAuth.js'

export { SharedTokenManager } from './qwenTokenManager.js'

/**
 * Check if Qwen OAuth mode is enabled.
 * Returns true when QWEN_OAUTH=1 or QWEN_OAUTH=true is set.
 */
export function isQwenOAuthEnabled(): boolean {
  const val = process.env.QWEN_OAUTH
  return val === '1' || val === 'true'
}

/**
 * Initialize Qwen OAuth — load cached credentials or run device auth flow.
 *
 * Returns the access token string, or null if auth fails.
 * On success, sets LLM_BASE_URL and LLM_API_KEY in the environment
 * so the existing Path B (generic LLM) infrastructure is used.
 */
export async function initQwenOAuth(): Promise<string | null> {
  const { SharedTokenManager: TokenMgr } = await import('./qwenTokenManager.js')
  const { loadCachedCredentials: loadCreds, runQwenDeviceAuthFlow: runAuth, getDashScopeBaseURL: getBaseURL } =
    await import('./qwenOAuth.js')

  const manager = TokenMgr.getInstance()

  // 1. Try to load existing credentials
  const cachedCreds = await loadCreds()
  if (cachedCreds) {
    await manager.setCredentials(cachedCreds)

    // Try to get valid (possibly refreshed) credentials
    const validCreds = await manager.getValidCredentials()
    if (validCreds?.access_token) {
      _setQwenEnvVars(validCreds, getBaseURL)
      process.stderr.write('[Qwen OAuth] Using cached credentials\n')
      return validCreds.access_token
    }
  }

  // 2. No valid cached credentials — run interactive device auth flow
  try {
    const newCreds = await runAuth()
    await manager.setCredentials(newCreds)
    _setQwenEnvVars(newCreds, getBaseURL)
    return newCreds.access_token || null
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[Qwen OAuth] Authentication failed: ${msg}\n`)
    return null
  }
}

/**
 * Get a fresh Qwen access token. Used by the API client for dynamic token injection.
 */
export async function getQwenAccessToken(): Promise<string | null> {
  const manager = (await import('./qwenTokenManager.js')).SharedTokenManager.getInstance()
  const creds = await manager.getValidCredentials()
  return creds?.access_token || null
}

// ──────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────

type GetBaseURLFn = (creds?: import('./qwenOAuth.js').QwenCredentials | null) => string

function _setQwenEnvVars(
  creds: import('./qwenOAuth.js').QwenCredentials,
  getBaseURL: GetBaseURLFn,
): void {
  const baseUrl = getBaseURL(creds)
  process.env.LLM_BASE_URL = baseUrl
  process.env.LLM_API_KEY = creds.access_token || ''

  // Set default model if not already set
  if (!process.env.LLM_MODEL) {
    process.env.LLM_MODEL = 'qwen-coder-local'
  }
}
