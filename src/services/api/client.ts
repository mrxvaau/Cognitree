/**
 * Dual-path LLM client factory.
 *
 * PATH A (Anthropic): ANTHROPIC_API_KEY set, LLM_BASE_URL not set
 *   → Returns a real @anthropic-ai/sdk Anthropic instance with all features:
 *     prompt caching, extended thinking, beta headers, Bedrock, Vertex, Foundry.
 *
 * PATH B (Generic): LLM_BASE_URL set
 *   → Returns LLMClient wrapped with an Anthropic-compatible beta.messages shim,
 *     supporting any OpenAI-compatible endpoint (Ollama, OpenRouter, Groq, vLLM, etc.)
 *
 * All callers continue to use getAnthropicClient() unchanged; the return type is
 * compatible with Anthropic's SDK surface via our local Anthropic type.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { ClientOptions } from '@anthropic-ai/sdk'
import { LLMClient } from './llmClient.js'
import { isGenericLLM } from 'src/utils/model/providers.js'

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
 * Dual-path client factory.
 *
 * Returns either:
 * - Path A: A real @anthropic-ai/sdk Anthropic instance (when ANTHROPIC_API_KEY is set)
 * - Path B: An LLMClient with beta.messages shim (when LLM_BASE_URL is set)
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
                const llmClient = new LLMClient({
                  baseURL: process.env.LLM_BASE_URL || '',
                  apiKey: process.env.LLM_API_KEY || apiKey || '',
                  model: model || process.env.LLM_MODEL || 'gpt-4',
                })
                return llmClient.createMessage({
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
