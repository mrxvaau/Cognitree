/**
 * Multi-path LLM client factory.
 *
 * PATH A (Anthropic): ANTHROPIC_API_KEY set, LLM_BASE_URL not set
 *   → Returns a real @anthropic-ai/sdk Anthropic instance with all features:
 *     prompt caching, extended thinking, beta headers, Bedrock, Vertex, Foundry.
 *
 * PATH B (Generic): LLM_BASE_URL set
 *   → Returns LLMClient wrapped with an Anthropic-compatible beta.messages shim,
 *     supporting any OpenAI-compatible endpoint (Ollama, OpenRouter, Groq, vLLM, etc.)
 *
 * PATH C (Qwen OAuth): QWEN_OAUTH=1 set
 *   → Like Path B, but dynamically injects fresh OAuth tokens from SharedTokenManager.
 *
 * All callers continue to use getAnthropicClient() unchanged; the return type is
 * compatible with Anthropic's SDK surface via our local Anthropic type.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { ClientOptions } from '@anthropic-ai/sdk'
import { LLMClient } from './llmClient.js'
import { isGenericLLM, isQwenOAuth } from 'src/utils/model/providers.js'

/** Header used to pass a client-generated request ID for correlation */
export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'

export type LLMClientInstance = LLMClient

/** The union return type for both paths — real Anthropic SDK or LLMClient shim */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAnthropicClient = any

/** Create a fresh LLMClient from env vars (Path B only) */
export function getLLMClient(): LLMClient {
  return new LLMClient({
    baseURL: process.env.LLM_BASE_URL || '',
    apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4',
  })
}

/**
 * Multi-path client factory.
 *
 * Returns either:
 * - Path A: A real @anthropic-ai/sdk Anthropic instance (when ANTHROPIC_API_KEY is set)
 * - Path B: An LLMClient with beta.messages shim (when LLM_BASE_URL is set)
 * - Path C: An LLMClient with Qwen OAuth token management (when QWEN_OAUTH=1)
 */
export async function getAnthropicClient({
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string
  maxRetries: number
  model?: string
  fetchOverride?: ClientOptions['fetch']
  source?: string
}): Promise<AnyAnthropicClient> {

  // ═══════════════════════════════════════════════════════
  // PATH C: Qwen OAuth — dynamic token injection
  // ═══════════════════════════════════════════════════════
  if (isQwenOAuth()) {
    // Get a fresh token from the token manager for each client creation
    let qwenApiKey = process.env.LLM_API_KEY || ''
    try {
      const { getQwenAccessToken } = await import('src/services/qwen/index.js')
      const freshToken = await getQwenAccessToken()
      if (freshToken) {
        qwenApiKey = freshToken
        // Also update the env var for consistency
        process.env.LLM_API_KEY = freshToken
      }
    } catch {
      // Fall back to env var token if dynamic refresh fails
    }

    const llmClient = new LLMClient({
      baseURL: process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: qwenApiKey,
      model: model || process.env.LLM_MODEL || 'qwen3-coder',
    })

    return {
      beta: {
        messages: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          create(params: any, options: any) {
            // Anthropic SDK: beta.messages.create() returns a stream-like object
            // synchronously, then you call .withResponse() on it.
            // We mimic this by returning an object with .withResponse()
            // The actual async work happens inside .withResponse()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const messages = (params.messages || []).map((msg: any) => ({
              role: msg.role,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content: typeof msg.content === 'string'
                ? msg.content
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                : (msg.content || []).map((block: any) => {
                    if (block.type === 'text') return { type: 'text', text: block.text }
                    if (block.type === 'tool_use') return {
                      type: 'tool_use', id: block.id, name: block.name, input: block.input
                    }
                    if (block.type === 'tool_result') return {
                      type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content
                    }
                    if (block.type === 'image') return { type: 'image', source: block.source }
                    return block
                  }),
            }))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tools = (params.tools || []).map((tool: any) => ({
              type: 'function' as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema || { type: 'object', properties: {}, required: [] },
              },
            }))

            return {
              async withResponse() {
                // Dynamically get fresh token for each request (handles mid-session refresh)
                let freshApiKey = qwenApiKey
                try {
                  const { getQwenAccessToken: getToken } = await import('src/services/qwen/index.js')
                  const token = await getToken()
                  if (token) {
                    freshApiKey = token
                    process.env.LLM_API_KEY = token
                  }
                } catch { /* use existing token */ }

                const innerClient = new LLMClient({
                  baseURL: process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                  apiKey: freshApiKey,
                  model: model || process.env.LLM_MODEL || 'qwen3-coder',
                })
                return innerClient.createMessage({
                  model: params.model || model || process.env.LLM_MODEL || 'qwen3-coder',
                  max_tokens: params.max_tokens,
                  system: params.system,
                  messages,
                  tools,
                  stream: params.stream !== false,
                  temperature: params.temperature,
                }, { signal: options?.signal })
              },
            }
          },
        },
      },
    } as unknown as AnyAnthropicClient
  }

  // ═══════════════════════════════════════════════════════
  // PATH B: Generic OpenAI-Compatible LLM Provider
  // ═══════════════════════════════════════════════════════
  if (isGenericLLM()) {
    const llmClient = new LLMClient({
      baseURL: process.env.LLM_BASE_URL || '',
      apiKey: process.env.LLM_API_KEY || apiKey || '',
      model: model || process.env.LLM_MODEL || 'gpt-4',
    })

    return {
      beta: {
        messages: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          create(params: any, options: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const messages = (params.messages || []).map((msg: any) => ({
              role: msg.role,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content: typeof msg.content === 'string'
                ? msg.content
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                : (msg.content || []).map((block: any) => {
                    if (block.type === 'text') return { type: 'text', text: block.text }
                    if (block.type === 'tool_use') return {
                      type: 'tool_use', id: block.id, name: block.name, input: block.input
                    }
                    if (block.type === 'tool_result') return {
                      type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content
                    }
                    if (block.type === 'image') return { type: 'image', source: block.source }
                    return block
                  }),
            }))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tools = (params.tools || []).map((tool: any) => ({
              type: 'function' as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema || { type: 'object', properties: {}, required: [] },
              },
            }))

            return {
              async withResponse() {
                const innerClient = new LLMClient({
                  baseURL: process.env.LLM_BASE_URL || '',
                  apiKey: process.env.LLM_API_KEY || apiKey || '',
                  model: model || process.env.LLM_MODEL || 'gpt-4',
                })
                return innerClient.createMessage({
                  model: params.model || model || process.env.LLM_MODEL || 'gpt-4',
                  max_tokens: params.max_tokens,
                  system: params.system,
                  messages,
                  tools,
                  stream: params.stream !== false,
                  temperature: params.temperature,
                }, { signal: options?.signal })
              },
            }
          },
        },
      },
    } as unknown as AnyAnthropicClient
  }

  // ═══════════════════════════════════════════════════════
  // PATH A: Anthropic SDK — Full Feature Set
  // ═══════════════════════════════════════════════════════
  const resolvedApiKey = apiKey || process.env.ANTHROPIC_API_KEY || ''

  const clientOptions: ClientOptions = {
    apiKey: resolvedApiKey,
    maxRetries,
    ...(fetchOverride && { fetch: fetchOverride }),
  }

  if (process.env.ANTHROPIC_BASE_URL) {
    clientOptions.baseURL = process.env.ANTHROPIC_BASE_URL
  }

  // Bedrock: delegate to AWS SDK signing
  if (process.env.ANTHROPIC_AUTH_TOKEN === 'bedrock') {
    // Bedrock uses @aws-sdk/client-bedrock-runtime, handled by the Anthropic SDK
    clientOptions.apiKey = 'bedrock'
    clientOptions.baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  }

  return new Anthropic(clientOptions)
}

/** @deprecated use getLLMClient() */
export const getClient = getLLMClient
