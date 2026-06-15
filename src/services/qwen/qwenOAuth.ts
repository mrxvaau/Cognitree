/**
 * Qwen OAuth2 Device Flow implementation.
 *
 * Adapted from qwen-code (packages/core/src/qwen/qwenOAuth2.ts)
 * Implements RFC 8628 — OAuth 2.0 Device Authorization Grant with PKCE.
 *
 * Flow: CLI requests device code → user visits URL in browser →
 *       CLI polls for token → receives access_token + refresh_token →
 *       tokens cached to ~/.qwen/oauth_creds.json
 */

import crypto from 'crypto'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import * as os from 'os'

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

const QWEN_OAUTH_BASE_URL = 'https://chat.qwen.ai'
const QWEN_OAUTH_DEVICE_CODE_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`
const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`
const QWEN_OAUTH_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56'
const QWEN_OAUTH_SCOPE = 'openid profile email model.completion'
const QWEN_OAUTH_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

const QWEN_DIR = '.qwen'
const QWEN_CREDENTIAL_FILENAME = 'oauth_creds.json'

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export interface QwenCredentials {
  access_token?: string
  refresh_token?: string
  id_token?: string
  expiry_date?: number
  token_type?: string
  resource_url?: string
}

export interface DeviceAuthorizationData {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
}

interface ErrorData {
  error: string
  error_description: string
}

interface DeviceTokenData {
  access_token: string | null
  refresh_token?: string | null
  token_type: string
  expires_in: number | null
  scope?: string | null
  endpoint?: string
  resource_url?: string
}

interface DeviceTokenPendingData {
  status: 'pending'
  slowDown?: boolean
}

interface TokenRefreshData {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  resource_url?: string
}

type DeviceAuthorizationResponse = DeviceAuthorizationData | ErrorData
type DeviceTokenResponse = DeviceTokenData | DeviceTokenPendingData | ErrorData
type TokenRefreshResponse = TokenRefreshData | ErrorData

// ──────────────────────────────────────────────────────────────────
// PKCE Utilities
// ──────────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function generateCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

function generatePKCEPair(): { code_verifier: string; code_challenge: string } {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  return { code_verifier: codeVerifier, code_challenge: codeChallenge }
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function objectToUrlEncoded(data: Record<string, string>): string {
  return Object.keys(data)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key]!)}`)
    .join('&')
}

function isDeviceAuthorizationSuccess(
  response: DeviceAuthorizationResponse,
): response is DeviceAuthorizationData {
  return 'device_code' in response
}

function isDeviceTokenSuccess(
  response: DeviceTokenResponse,
): response is DeviceTokenData {
  return (
    'access_token' in response &&
    response.access_token !== null &&
    response.access_token !== undefined &&
    typeof response.access_token === 'string' &&
    response.access_token.length > 0
  )
}

function isDeviceTokenPending(
  response: DeviceTokenResponse,
): response is DeviceTokenPendingData {
  return (
    'status' in response &&
    (response as DeviceTokenPendingData).status === 'pending'
  )
}

function isErrorResponse(
  response: DeviceAuthorizationResponse | DeviceTokenResponse | TokenRefreshResponse,
): response is ErrorData {
  return 'error' in response
}

// ──────────────────────────────────────────────────────────────────
// Credential File I/O
// ──────────────────────────────────────────────────────────────────

function getQwenCachedCredentialPath(): string {
  return path.join(os.homedir(), QWEN_DIR, QWEN_CREDENTIAL_FILENAME)
}

export async function loadCachedCredentials(): Promise<QwenCredentials | null> {
  try {
    const filePath = getQwenCachedCredentialPath()
    const content = await fs.readFile(filePath, 'utf-8')
    const data = JSON.parse(content)
    if (data && typeof data === 'object' && data.access_token && data.refresh_token) {
      return data as QwenCredentials
    }
    return null
  } catch {
    return null
  }
}

export async function cacheQwenCredentials(credentials: QwenCredentials): Promise<void> {
  const filePath = getQwenCachedCredentialPath()
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(credentials, null, 2))
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[Qwen OAuth] Failed to cache credentials: ${errorMessage}\n`)
  }
}

export async function clearQwenCredentials(): Promise<void> {
  try {
    const filePath = getQwenCachedCredentialPath()
    await fs.unlink(filePath)
  } catch {
    // File doesn't exist or can't be deleted — treat as cleared
  }
}

// ──────────────────────────────────────────────────────────────────
// QwenOAuth2Client
// ──────────────────────────────────────────────────────────────────

export class QwenOAuth2Client {
  private credentials: QwenCredentials = {}

  setCredentials(credentials: QwenCredentials): void {
    this.credentials = credentials
  }

  getCredentials(): QwenCredentials {
    return this.credentials
  }

  async requestDeviceAuthorization(options: {
    scope: string
    code_challenge: string
    code_challenge_method: string
  }): Promise<DeviceAuthorizationData> {
    const bodyData = {
      client_id: QWEN_OAUTH_CLIENT_ID,
      scope: options.scope,
      code_challenge: options.code_challenge,
      code_challenge_method: options.code_challenge_method,
    }

    const response = await fetch(QWEN_OAUTH_DEVICE_CODE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      body: objectToUrlEncoded(bodyData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Device authorization failed: ${response.status} ${response.statusText}. Response: ${errorText}`,
      )
    }

    const result = (await response.json()) as DeviceAuthorizationResponse
    if (!isDeviceAuthorizationSuccess(result)) {
      const errorData = result as ErrorData
      throw new Error(
        `Device authorization failed: ${errorData?.error || 'Unknown error'} - ${errorData?.error_description || 'No details provided'}`,
      )
    }

    return result
  }

  async pollDeviceToken(options: {
    device_code: string
    code_verifier: string
  }): Promise<DeviceTokenResponse> {
    const bodyData = {
      grant_type: QWEN_OAUTH_GRANT_TYPE,
      client_id: QWEN_OAUTH_CLIENT_ID,
      device_code: options.device_code,
      code_verifier: options.code_verifier,
    }

    const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: objectToUrlEncoded(bodyData),
    })

    if (!response.ok) {
      const responseText = await response.text()
      let errorData: ErrorData | null = null
      try {
        errorData = JSON.parse(responseText) as ErrorData
      } catch {
        throw new Error(
          `Device token poll failed: ${response.status} ${response.statusText}. Response: ${responseText}`,
        )
      }

      // RFC 8628: authorization_pending → continue polling
      if (response.status === 400 && errorData.error === 'authorization_pending') {
        return { status: 'pending' } as DeviceTokenPendingData
      }
      // RFC 8628: slow_down → increase interval
      if (response.status === 429 && errorData.error === 'slow_down') {
        return { status: 'pending', slowDown: true } as DeviceTokenPendingData
      }

      throw new Error(
        `Device token poll failed: ${errorData.error || 'Unknown error'} - ${errorData.error_description}`,
      )
    }

    return (await response.json()) as DeviceTokenResponse
  }

  async refreshAccessToken(): Promise<TokenRefreshResponse> {
    if (!this.credentials.refresh_token) {
      throw new Error('No refresh token available')
    }

    const bodyData = {
      grant_type: 'refresh_token',
      refresh_token: this.credentials.refresh_token,
      client_id: QWEN_OAUTH_CLIENT_ID,
    }

    const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: objectToUrlEncoded(bodyData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      if (response.status === 400) {
        await clearQwenCredentials()
        throw new Error(
          'Refresh token expired or invalid. Please re-authenticate with Qwen.',
        )
      }
      throw new Error(
        `Token refresh failed: ${response.status} ${response.statusText}. Response: ${errorText}`,
      )
    }

    const responseData = (await response.json()) as TokenRefreshResponse
    if (isErrorResponse(responseData)) {
      throw new Error(
        `Token refresh failed: ${responseData.error || 'Unknown error'} - ${responseData.error_description || 'No details'}`,
      )
    }

    const tokenData = responseData as TokenRefreshData
    const tokens: QwenCredentials = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      refresh_token: tokenData.refresh_token || this.credentials.refresh_token,
      resource_url: tokenData.resource_url,
      expiry_date: Date.now() + tokenData.expires_in * 1000,
    }

    this.setCredentials(tokens)
    return responseData
  }
}

// ──────────────────────────────────────────────────────────────────
// Device Auth Flow (interactive)
// ──────────────────────────────────────────────────────────────────

/**
 * Run the full device authorization flow.
 * Opens a browser for the user to log in, polls for token completion.
 */
export async function runQwenDeviceAuthFlow(): Promise<QwenCredentials> {
  const client = new QwenOAuth2Client()
  const { code_verifier, code_challenge } = generatePKCEPair()

  // Step 1: Request device authorization
  process.stderr.write('\n[Qwen OAuth] Requesting device authorization...\n')
  const deviceAuth = await client.requestDeviceAuthorization({
    scope: QWEN_OAUTH_SCOPE,
    code_challenge,
    code_challenge_method: 'S256',
  })

  // Step 2: Show the URL to the user
  const url = deviceAuth.verification_uri_complete
  const boxWidth = 70
  const contentWidth = boxWidth - 4
  const title = ' Qwen OAuth Device Authorization '
  const titlePad = Math.floor((boxWidth - 2 - title.length) / 2)
  const topBorder = '+' + '-'.repeat(titlePad) + title + '-'.repeat(boxWidth - 2 - titlePad - title.length) + '+'
  const emptyLine = '|' + ' '.repeat(boxWidth - 2) + '|'
  const bottomBorder = '+' + '-'.repeat(boxWidth - 2) + '+'

  process.stderr.write('\n' + topBorder + '\n')
  process.stderr.write(emptyLine + '\n')
  const msg1 = 'Please visit the following URL in your browser to authorize:'
  process.stderr.write('| ' + msg1 + ' '.repeat(contentWidth - msg1.length) + ' |\n')
  process.stderr.write(emptyLine + '\n')

  // Wrap URL if needed
  for (let i = 0; i < url.length; i += contentWidth) {
    const line = url.substring(i, i + contentWidth)
    process.stderr.write('| ' + line + ' '.repeat(contentWidth - line.length) + ' |\n')
  }

  process.stderr.write(emptyLine + '\n')
  const msg2 = 'Waiting for authorization to complete...'
  process.stderr.write('| ' + msg2 + ' '.repeat(contentWidth - msg2.length) + ' |\n')
  process.stderr.write(emptyLine + '\n')
  process.stderr.write(bottomBorder + '\n\n')

  // Try to open browser (cross-platform)
  try {
    const { exec } = await import('child_process')
    const platform = process.platform
    const cmd =
      platform === 'win32' ? `start "" "${url}"` :
      platform === 'darwin' ? `open "${url}"` :
      `xdg-open "${url}"`
    exec(cmd, (err) => {
      if (err) {
        process.stderr.write('[Qwen OAuth] Could not open browser automatically. Please navigate to the URL above.\n')
      }
    })
  } catch {
    // Browser launch failed — user can still copy-paste the URL
    process.stderr.write('[Qwen OAuth] Could not open browser automatically. Please navigate to the URL above.\n')
  }

  // Step 3: Poll for token
  let pollInterval = 2000
  const maxAttempts = Math.ceil(deviceAuth.expires_in / (pollInterval / 1000))

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval))

    try {
      const tokenResponse = await client.pollDeviceToken({
        device_code: deviceAuth.device_code,
        code_verifier,
      })

      if (isDeviceTokenSuccess(tokenResponse)) {
        const tokenData = tokenResponse as DeviceTokenData
        const credentials: QwenCredentials = {
          access_token: tokenData.access_token!,
          refresh_token: tokenData.refresh_token || undefined,
          token_type: tokenData.token_type,
          resource_url: tokenData.resource_url,
          expiry_date: tokenData.expires_in
            ? Date.now() + tokenData.expires_in * 1000
            : undefined,
        }

        await cacheQwenCredentials(credentials)
        process.stderr.write('[Qwen OAuth] ✓ Authentication successful!\n\n')
        return credentials
      }

      if (isDeviceTokenPending(tokenResponse)) {
        if (tokenResponse.slowDown) {
          pollInterval = Math.min(pollInterval * 1.5, 10000)
        }
        if ((attempt + 1) % 5 === 0) {
          process.stderr.write(`[Qwen OAuth] Still waiting... (attempt ${attempt + 1}/${maxAttempts})\n`)
        }
        continue
      }

      if (isErrorResponse(tokenResponse)) {
        throw new Error(
          `Token polling failed: ${tokenResponse.error} - ${tokenResponse.error_description}`,
        )
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('401') || msg.includes('expired')) {
        throw new Error('Device code expired. Please restart the authorization process.')
      }
      if (msg.includes('429')) {
        throw new Error('Rate limited by Qwen. Please try again later.')
      }
      // For transient errors, continue polling
      process.stderr.write(`[Qwen OAuth] Polling error: ${msg}\n`)
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }
  }

  throw new Error('Authorization timed out. Please try again.')
}

// ──────────────────────────────────────────────────────────────────
// DashScope base URL
// ──────────────────────────────────────────────────────────────────

const DEFAULT_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

/**
 * Get the DashScope API base URL from credentials or default.
 * The resource_url field from Qwen OAuth may point to a region-specific endpoint.
 */
export function getDashScopeBaseURL(credentials?: QwenCredentials | null): string {
  const resourceUrl = credentials?.resource_url
  // Only use resource_url if it looks like a DashScope API endpoint.
  // Values like "portal.qwen.ai" are web portals, not API servers.
  if (!resourceUrl || !resourceUrl.includes('dashscope')) return DEFAULT_DASHSCOPE_BASE_URL

  const normalized = resourceUrl.startsWith('http')
    ? resourceUrl
    : `https://${resourceUrl}`

  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`
}
