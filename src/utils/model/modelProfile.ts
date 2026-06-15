/**
 * Universal Model Profile System
 *
 * Every model gets a capability profile. The agent reads it once at startup
 * and auto-adapts: prompt style, tool access, agent spawning, token budgets.
 *
 * Principle: ONE agent, ONE task, ZERO waste.
 */

export interface ModelProfile {
  /** Display name for logs */
  name: string
  /** Model capabilities */
  capabilities: {
    /** Can reliably call tools in the expected format */
    toolCalling: boolean
    /** Can spawn sub-agents without looping */
    multiAgent: boolean
    /** Supports thinking/reasoning mode */
    thinking: boolean
    /** Supports streaming responses */
    streaming: boolean
    /** Max context window in tokens */
    maxContextTokens: number
  }
  /** Token budget constraints */
  tokenBudget: {
    /** Max concurrent agent spawns allowed (prevents loop burns) */
    maxAgentSpawns: number
    /** Enforce concise output in system prompt */
    compactOutput: boolean
  }
  /** Model-specific quirks and workarounds */
  quirks: {
    /** Strip special chars from function names (Gemini needs this) */
    sanitizeFunctionNames: boolean
    /** Force-disable thinking params in API request */
    disableThinking: boolean
    /** Add mandatory "use tools first" instruction to prompt */
    forceToolUse: boolean
    /** Max function name length (0 = no limit) */
    toolNameMaxLength: number
  }
}

// ─── Built-in Profiles ────────────────────────────────────────────────

const CLAUDE_PROFILE: ModelProfile = {
  name: 'Claude',
  capabilities: {
    toolCalling: true,
    multiAgent: true,
    thinking: true,
    streaming: true,
    maxContextTokens: 200_000,
  },
  tokenBudget: {
    maxAgentSpawns: 10,
    compactOutput: false,
  },
  quirks: {
    sanitizeFunctionNames: false,
    disableThinking: false,
    forceToolUse: false,
    toolNameMaxLength: 0,
  },
}

const QWEN_PROFILE: ModelProfile = {
  name: 'Qwen',
  capabilities: {
    toolCalling: true,
    multiAgent: false,  // loops when spawning sub-agents
    thinking: false,
    streaming: true,
    maxContextTokens: 128_000,
  },
  tokenBudget: {
    maxAgentSpawns: 3,
    compactOutput: true,
  },
  quirks: {
    sanitizeFunctionNames: false,
    disableThinking: true,
    forceToolUse: true,  // tends to guess without tools
    toolNameMaxLength: 0,
  },
}

const GPT_PROFILE: ModelProfile = {
  name: 'GPT',
  capabilities: {
    toolCalling: true,
    multiAgent: false,
    thinking: false,
    streaming: true,
    maxContextTokens: 128_000,
  },
  tokenBudget: {
    maxAgentSpawns: 3,
    compactOutput: true,
  },
  quirks: {
    sanitizeFunctionNames: false,
    disableThinking: true,
    forceToolUse: false,
    toolNameMaxLength: 0,
  },
}

const GEMINI_PROFILE: ModelProfile = {
  name: 'Gemini',
  capabilities: {
    toolCalling: true,
    multiAgent: false,
    thinking: true,
    streaming: true,
    maxContextTokens: 1_000_000,
  },
  tokenBudget: {
    maxAgentSpawns: 3,
    compactOutput: true,
  },
  quirks: {
    sanitizeFunctionNames: true,  // Gemini rejects special chars in names
    disableThinking: false,
    forceToolUse: false,
    toolNameMaxLength: 64,
  },
}

const DEEPSEEK_PROFILE: ModelProfile = {
  name: 'DeepSeek',
  capabilities: {
    toolCalling: true,
    multiAgent: false,
    thinking: true,
    streaming: true,
    maxContextTokens: 128_000,
  },
  tokenBudget: {
    maxAgentSpawns: 3,
    compactOutput: true,
  },
  quirks: {
    sanitizeFunctionNames: false,
    disableThinking: false,
    forceToolUse: true,
    toolNameMaxLength: 0,
  },
}

const LLAMA_PROFILE: ModelProfile = {
  name: 'Llama',
  capabilities: {
    toolCalling: true,
    multiAgent: false,
    thinking: false,
    streaming: true,
    maxContextTokens: 128_000,
  },
  tokenBudget: {
    maxAgentSpawns: 2,
    compactOutput: true,
  },
  quirks: {
    sanitizeFunctionNames: false,
    disableThinking: true,
    forceToolUse: true,  // often skips tools
    toolNameMaxLength: 0,
  },
}

const MISTRAL_PROFILE: ModelProfile = {
  name: 'Mistral',
  capabilities: {
    toolCalling: true,
    multiAgent: false,
    thinking: false,
    streaming: true,
    maxContextTokens: 128_000,
  },
  tokenBudget: {
    maxAgentSpawns: 3,
    compactOutput: true,
  },
  quirks: {
    sanitizeFunctionNames: false,
    disableThinking: true,
    forceToolUse: false,
    toolNameMaxLength: 0,
  },
}

// Safe default for unknown models — assume minimal capabilities
const DEFAULT_PROFILE: ModelProfile = {
  name: 'Unknown',
  capabilities: {
    toolCalling: true,
    multiAgent: false,
    thinking: false,
    streaming: true,
    maxContextTokens: 128_000,
  },
  tokenBudget: {
    maxAgentSpawns: 3,
    compactOutput: true,
  },
  quirks: {
    sanitizeFunctionNames: false,
    disableThinking: true,
    forceToolUse: true,
    toolNameMaxLength: 0,
  },
}

// ─── Profile Matching ─────────────────────────────────────────────────

/**
 * Model name → profile mapping (prefix/substring match).
 * Order matters: first match wins. More specific patterns first.
 */
const PROFILE_MATCHERS: [pattern: string, profile: ModelProfile][] = [
  ['claude', CLAUDE_PROFILE],
  ['qwen', QWEN_PROFILE],
  ['gpt-4', GPT_PROFILE],
  ['gpt-3', GPT_PROFILE],
  ['o1', GPT_PROFILE],
  ['o3', GPT_PROFILE],
  ['o4', GPT_PROFILE],
  ['gemini', GEMINI_PROFILE],
  ['deepseek', DEEPSEEK_PROFILE],
  ['llama', LLAMA_PROFILE],
  ['codellama', LLAMA_PROFILE],
  ['mistral', MISTRAL_PROFILE],
  ['mixtral', MISTRAL_PROFILE],
  ['codestral', MISTRAL_PROFILE],
]

/**
 * Match a model name to a built-in profile.
 * Uses case-insensitive substring matching.
 *
 * Examples:
 *   "qwen-max-0428"     → QWEN_PROFILE
 *   "gemini-2.5-flash"  → GEMINI_PROFILE
 *   "gpt-4o-2024-11"    → GPT_PROFILE
 *   "my-custom-model"   → DEFAULT_PROFILE
 */
export function matchModelProfile(modelName: string): ModelProfile {
  const lower = modelName.toLowerCase()
  for (const [pattern, profile] of PROFILE_MATCHERS) {
    if (lower.includes(pattern)) {
      return profile
    }
  }
  return DEFAULT_PROFILE
}

// ─── Session Cache ────────────────────────────────────────────────────

let _cachedProfile: ModelProfile | null = null
let _cachedModelName: string | null = null

/**
 * Load and cache the model profile for the current session.
 * Call once at startup. Subsequent calls return cached profile.
 */
export function loadModelProfile(modelName?: string): ModelProfile {
  const name = modelName
    || process.env.LLM_MODEL
    || process.env.ANTHROPIC_MODEL
    || 'claude-sonnet-4-20250514'

  // Return cached if same model
  if (_cachedProfile && _cachedModelName === name) {
    return _cachedProfile
  }

  _cachedProfile = matchModelProfile(name)
  _cachedModelName = name
  return _cachedProfile
}

/**
 * Get the active model profile. Returns cached if available,
 * otherwise loads from environment.
 */
export function getActiveProfile(): ModelProfile {
  if (_cachedProfile) return _cachedProfile
  return loadModelProfile()
}

/**
 * Check if the current model supports multi-agent workflows.
 * Shorthand for getActiveProfile().capabilities.multiAgent
 */
export function supportsMultiAgent(): boolean {
  return getActiveProfile().capabilities.multiAgent
}

/**
 * Get the max allowed agent spawns for the current model.
 */
export function getMaxAgentSpawns(): number {
  return getActiveProfile().tokenBudget.maxAgentSpawns
}

/**
 * Reset the cached profile (for testing or model switching).
 */
export function resetProfileCache(): void {
  _cachedProfile = null
  _cachedModelName = null
}
