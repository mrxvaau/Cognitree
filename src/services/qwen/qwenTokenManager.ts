/**
 * Shared Token Manager for Qwen OAuth credentials.
 *
 * Adapted from qwen-code (packages/core/src/qwen/sharedTokenManager.ts)
 * Provides cross-session token management with:
 * - In-memory caching with file modification time tracking
 * - Automatic token refresh 30s before expiry
 * - Thread-safe refresh (deduplicates concurrent refresh calls)
 */

import {
  type QwenCredentials,
  QwenOAuth2Client,
  loadCachedCredentials,
  cacheQwenCredentials,
} from './qwenOAuth.js'

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

/** Refresh tokens 30 seconds before they expire */
const TOKEN_EXPIRY_BUFFER_MS = 30_000

// ──────────────────────────────────────────────────────────────────
// SharedTokenManager
// ──────────────────────────────────────────────────────────────────

export class SharedTokenManager {
  private static instance: SharedTokenManager | null = null

  private memoryCache: {
    credentials: QwenCredentials | null
    lastCheck: number
  } = {
    credentials: null,
    lastCheck: 0,
  }

  private refreshPromise: Promise<QwenCredentials | null> | null = null
  private oauthClient: QwenOAuth2Client

  private constructor() {
    this.oauthClient = new QwenOAuth2Client()
  }

  static getInstance(): SharedTokenManager {
    if (!SharedTokenManager.instance) {
      SharedTokenManager.instance = new SharedTokenManager()
    }
    return SharedTokenManager.instance
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    SharedTokenManager.instance = null
  }

  /**
   * Check if a token is valid (exists + not expired with buffer)
   */
  isTokenValid(credentials: QwenCredentials | null): boolean {
    if (!credentials?.access_token) return false
    if (!credentials.expiry_date) return true // No expiry = assume valid
    return credentials.expiry_date > Date.now() + TOKEN_EXPIRY_BUFFER_MS
  }

  /**
   * Get valid credentials, refreshing if needed.
   *
   * This is the primary entry point used by the API client.
   * Returns null if no credentials are available and can't be obtained.
   */
  async getValidCredentials(): Promise<QwenCredentials | null> {
    // 1. Check memory cache
    if (this.isTokenValid(this.memoryCache.credentials)) {
      return this.memoryCache.credentials
    }

    // 2. Try loading from file
    const fileCredentials = await loadCachedCredentials()
    if (this.isTokenValid(fileCredentials)) {
      this.memoryCache = {
        credentials: fileCredentials,
        lastCheck: Date.now(),
      }
      return fileCredentials
    }

    // 3. Try refreshing
    if (fileCredentials?.refresh_token) {
      return this.refreshToken(fileCredentials)
    }

    return null
  }

  /**
   * Force-refresh the token using the refresh_token grant.
   * Deduplicates concurrent refresh calls.
   */
  private async refreshToken(
    credentials: QwenCredentials,
  ): Promise<QwenCredentials | null> {
    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = this._doRefresh(credentials)

    try {
      return await this.refreshPromise
    } finally {
      this.refreshPromise = null
    }
  }

  private async _doRefresh(
    credentials: QwenCredentials,
  ): Promise<QwenCredentials | null> {
    try {
      this.oauthClient.setCredentials(credentials)
      await this.oauthClient.refreshAccessToken()

      const refreshedCredentials = this.oauthClient.getCredentials()

      // Cache to memory and file
      this.memoryCache = {
        credentials: refreshedCredentials,
        lastCheck: Date.now(),
      }
      await cacheQwenCredentials(refreshedCredentials)

      process.stderr.write('[Qwen OAuth] Token refreshed successfully\n')
      return refreshedCredentials
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      process.stderr.write(
        `[Qwen OAuth] Token refresh failed: ${errorMessage}\n`,
      )

      // If refresh token is invalid, clear everything
      if (
        errorMessage.includes('expired') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('re-authenticate')
      ) {
        this.clearCache()
        return null
      }

      // For transient errors, return stale credentials if they exist
      if (this.memoryCache.credentials?.access_token) {
        process.stderr.write(
          '[Qwen OAuth] Using stale credentials after refresh failure\n',
        )
        return this.memoryCache.credentials
      }

      return null
    }
  }

  /**
   * Set new credentials (e.g., after initial device auth flow)
   */
  async setCredentials(credentials: QwenCredentials): Promise<void> {
    this.memoryCache = {
      credentials,
      lastCheck: Date.now(),
    }
    this.oauthClient.setCredentials(credentials)
    await cacheQwenCredentials(credentials)
  }

  /**
   * Clear all cached credentials
   */
  clearCache(): void {
    this.memoryCache = {
      credentials: null,
      lastCheck: 0,
    }
    this.refreshPromise = null
  }

  /**
   * Get the current cached credentials (may be expired)
   */
  getCurrentCredentials(): QwenCredentials | null {
    return this.memoryCache.credentials
  }

  /**
   * Check if there's an ongoing refresh operation
   */
  isRefreshInProgress(): boolean {
    return this.refreshPromise !== null
  }

  /**
   * Get debug info about the current state
   */
  getDebugInfo(): {
    hasCredentials: boolean
    credentialsExpired: boolean
    isRefreshing: boolean
    cacheAge: number
  } {
    const hasCredentials = !!this.memoryCache.credentials
    const credentialsExpired = hasCredentials
      ? !this.isTokenValid(this.memoryCache.credentials)
      : false

    return {
      hasCredentials,
      credentialsExpired,
      isRefreshing: this.isRefreshInProgress(),
      cacheAge: Date.now() - this.memoryCache.lastCheck,
    }
  }
}
