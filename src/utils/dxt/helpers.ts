import { errorMessage } from '../errors.js'
import { jsonParse } from '../slowOperations.js'

// ============================================================================
// LOCAL TYPE DEFINITIONS (previously from @anthropic-ai/mcpb)
// ============================================================================

export interface McpbUserConfigurationOption {
  type: 'string' | 'number' | 'boolean' | 'file' | 'directory'
  title?: string
  description?: string
  required?: boolean
  sensitive?: boolean
  default?: string | number | boolean
  min?: number
  max?: number
  multiple?: boolean
  options?: string[]
}

export interface McpServerCommandConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpServerConfig {
  command?: McpServerCommandConfig[]
  env?: Record<string, string>
  [key: string]: unknown
}

export interface McpbManifest {
  name: string
  version: string
  author: { name: string; email?: string; url?: string }
  description?: string
  homepage?: string
  license?: string
  repository?: string
  user_config?: Record<string, McpbUserConfigurationOption>
  mcp_servers?: Record<string, McpServerConfig>
  [key: string]: unknown
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Simple type guard for McpbManifest — checks required fields exist.
 * Replaces the zod-based McpbManifestSchema.safeParse() from @anthropic-ai/mcpb.
 */
function parseManifest(data: unknown): McpbManifest {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Manifest must be an object')
  }
  const m = data as Record<string, unknown>
  if (typeof m.name !== 'string' || !m.name) {
    throw new Error('Manifest must have a string "name" field')
  }
  if (typeof m.version !== 'string' || !m.version) {
    throw new Error('Manifest must have a string "version" field')
  }
  if (typeof m.author !== 'object' || m.author === null) {
    throw new Error('Manifest must have an "author" object')
  }
  const author = m.author as Record<string, unknown>
  if (typeof author.name !== 'string' || !author.name) {
    throw new Error('Manifest author must have a string "name" field')
  }
  return m as McpbManifest
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Parses and validates a DXT manifest from a JSON object.
 */
export async function validateManifest(
  manifestJson: unknown,
): Promise<McpbManifest> {
  try {
    return parseManifest(manifestJson)
  } catch (error) {
    throw new Error(`Invalid manifest: ${errorMessage(error)}`)
  }
}

/**
 * Parses and validates a DXT manifest from raw text data.
 */
export async function parseAndValidateManifestFromText(
  manifestText: string,
): Promise<McpbManifest> {
  let manifestJson: unknown

  try {
    manifestJson = jsonParse(manifestText)
  } catch (error) {
    throw new Error(`Invalid JSON in manifest.json: ${errorMessage(error)}`)
  }

  return validateManifest(manifestJson)
}

/**
 * Parses and validates a DXT manifest from raw binary data.
 */
export async function parseAndValidateManifestFromBytes(
  manifestData: Uint8Array,
): Promise<McpbManifest> {
  const manifestText = new TextDecoder().decode(manifestData)
  return parseAndValidateManifestFromText(manifestText)
}

/**
 * Generates an extension ID from author name and extension name.
 * Uses the same algorithm as the directory backend for consistency.
 */
export function generateExtensionId(
  manifest: McpbManifest,
  prefix?: 'local.unpacked' | 'local.dxt',
): string {
  const sanitize = (str: string) =>
    str
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_.]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')

  const authorName = manifest.author.name
  const extensionName = manifest.name

  const sanitizedAuthor = sanitize(authorName)
  const sanitizedName = sanitize(extensionName)

  return prefix
    ? `${prefix}.${sanitizedAuthor}.${sanitizedName}`
    : `${sanitizedAuthor}.${sanitizedName}`
}
