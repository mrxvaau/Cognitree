import chalk from 'chalk'
import * as React from 'react'
import { Box, Text, useInput } from 'ink'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js'
import TextInput from '../../components/TextInput.js'
import { useSetAppState } from '../../state/AppState.js'

// ── Config persistence ─────────────────────────────────────────────────
const CLAUDE_DIR = join(homedir(), '.claude')
const BYOK_ENV_PATH = join(CLAUDE_DIR, 'byok.env')

function loadSavedConfig(): { baseUrl?: string; apiKey?: string; model?: string } {
  try {
    if (!existsSync(BYOK_ENV_PATH)) return {}
    const content = readFileSync(BYOK_ENV_PATH, 'utf8')
    const result: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      result[key] = value
    }
    return {
      baseUrl: result['LLM_BASE_URL'],
      apiKey: result['LLM_API_KEY'],
      model: result['LLM_MODEL'],
    }
  } catch {
    return {}
  }
}

function saveConfig(baseUrl: string, apiKey: string, model: string): void {
  try {
    if (!existsSync(CLAUDE_DIR)) mkdirSync(CLAUDE_DIR, { recursive: true })
    const content = [
      '# BYOK configuration — managed by /byok command',
      `# Last updated: ${new Date().toISOString()}`,
      `LLM_BASE_URL=${baseUrl}`,
      `LLM_API_KEY=${apiKey}`,
      `LLM_MODEL=${model}`,
    ].join('\n') + '\n'
    writeFileSync(BYOK_ENV_PATH, content, { encoding: 'utf8', mode: 0o600 })
  } catch {
    // Non-fatal — config still applied in-memory
  }
}

// ── Provider definitions ───────────────────────────────────────────────
interface ProviderDef {
  name: string
  label: string
  baseUrl: string
  apiKeyLabel: string
  apiKeyUrl: string
  requiresKey: boolean
  models: Array<{ id: string; label: string; description: string }>
}

const PROVIDERS: ProviderDef[] = [
  {
    name: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyLabel: 'OpenRouter API Key',
    apiKeyUrl: 'https://openrouter.ai/keys',
    requiresKey: true,
    models: [
      {
        id: 'deepseek/deepseek-chat-v3-0324',
        label: 'DeepSeek V3 (0324)',
        description: 'Best value · native tools · $0.27/M tokens',
      },
      {
        id: 'anthropic/claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        description: 'Top-tier coding · $3/M in, $15/M out',
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        label: 'Claude 3.5 Sonnet',
        description: 'Great coding · $3/M in, $15/M out',
      },
      {
        id: 'google/gemini-2.5-flash-preview',
        label: 'Gemini 2.5 Flash',
        description: 'Fast & cheap · ~$0.15/M tokens',
      },
      {
        id: 'qwen/qwen3-235b-a22b',
        label: 'Qwen 3 235B',
        description: 'Open source · free tier available',
      },
      {
        id: 'meta-llama/llama-4-maverick',
        label: 'Llama 4 Maverick',
        description: 'Open source · solid tool calling',
      },
      {
        id: '__custom__',
        label: 'Enter custom model ID…',
        description: 'Type any model available on OpenRouter',
      },
    ],
  },
  {
    name: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyLabel: 'OpenAI API Key',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    requiresKey: true,
    models: [
      {
        id: 'o3',
        label: 'o3',
        description: 'Most capable reasoning model',
      },
      {
        id: 'gpt-4.1',
        label: 'GPT-4.1',
        description: 'Latest GPT-4 · strong tool calling',
      },
      {
        id: 'gpt-4o',
        label: 'GPT-4o',
        description: 'Multimodal · fast · affordable',
      },
      {
        id: 'gpt-4o-mini',
        label: 'GPT-4o Mini',
        description: 'Fast & cheap · great for drafts',
      },
      {
        id: '__custom__',
        label: 'Enter custom model ID…',
        description: 'Type any OpenAI model ID',
      },
    ],
  },
  {
    name: 'ollama',
    label: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyLabel: '',
    apiKeyUrl: '',
    requiresKey: false,
    models: [
      {
        id: 'qwen2.5-coder:32b',
        label: 'Qwen 2.5 Coder 32B',
        description: 'Best local coder · ~20GB VRAM',
      },
      {
        id: 'deepseek-coder-v2:16b',
        label: 'DeepSeek Coder V2 16B',
        description: 'Great coder · ~9GB VRAM',
      },
      {
        id: 'llama3.1:8b',
        label: 'Llama 3.1 8B',
        description: 'Fast & lightweight · ~5GB VRAM',
      },
      {
        id: '__custom__',
        label: 'Enter custom model name…',
        description: 'Type any locally pulled model name',
      },
    ],
  },
  {
    name: 'custom',
    label: 'Custom / Other',
    baseUrl: '',
    apiKeyLabel: 'API Key (if required)',
    apiKeyUrl: '',
    requiresKey: false,
    models: [
      {
        id: '__custom__',
        label: 'Enter model ID…',
        description: 'Compatible with any OpenAI-format API',
      },
    ],
  },
]

// ── Step types ─────────────────────────────────────────────────────────
type Step = 'home' | 'provider' | 'baseurl' | 'apikey' | 'model' | 'custommodel' | 'confirm'

// ── Helpers ────────────────────────────────────────────────────────────
function StepHeader({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <Box marginBottom={1} flexDirection="column">
      <Box gap={2}>
        <Text bold color="cyan">{title}</Text>
        <Text dimColor>({step}/{total})</Text>
      </Box>
      <Text dimColor>{'─'.repeat(50)}</Text>
    </Box>
  )
}

function HintBar({ hints }: { hints: string[] }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{hints.join(' · ')}</Text>
    </Box>
  )
}

// ── Main BYOK Component ───────────────────────────────────────────────
function BYOKSetup({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const saved = React.useMemo(() => loadSavedConfig(), [])

  const [step, setStep] = React.useState<Step>('home')
  const [selectedProviderIdx, setSelectedProviderIdx] = React.useState(0)
  const [selectedModelIdx, setSelectedModelIdx] = React.useState(0)
  const [apiKey, setApiKey] = React.useState('')
  const [customBaseUrl, setCustomBaseUrl] = React.useState('')
  const [customBaseUrlCursor, setCustomBaseUrlCursor] = React.useState(0)
  const [customModelId, setCustomModelId] = React.useState('')
  const [customModelCursor, setCustomModelCursor] = React.useState(0)
  const [apiKeyCursor, setApiKeyCursor] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const setAppState = useSetAppState()

  const provider = PROVIDERS[selectedProviderIdx]!
  const model = provider.models[selectedModelIdx]
  const isCustomModel = model?.id === '__custom__'
  const isCustomProvider = provider.name === 'custom'
  const TOTAL_STEPS = 3

  // ── Home screen (show saved config or start fresh) ─────────────────────
  useInput((input, key) => {
    setError(null)

    if (step === 'home') {
      if (key.escape || input === 'q') {
        onDone('BYOK setup cancelled', { display: 'skip' })
        return
      }
      if (key.return || input === 'n') {
        setStep('provider')
        return
      }
      if (input === 'r' && saved.baseUrl) {
        // Remove saved config
        try {
          if (existsSync(BYOK_ENV_PATH)) {
            writeFileSync(BYOK_ENV_PATH, '', 'utf8')
          }
          process.env.LLM_BASE_URL = ''
          process.env.LLM_API_KEY = ''
          process.env.LLM_MODEL = ''
        } catch { /* ignore */ }
        onDone('BYOK configuration removed', { display: 'system' })
        return
      }
    }

    if (step === 'provider') {
      if (key.escape) {
        setStep('home')
        return
      }
      if (key.upArrow) {
        setSelectedProviderIdx(i => Math.max(0, i - 1))
        setSelectedModelIdx(0)
      } else if (key.downArrow) {
        setSelectedProviderIdx(i => Math.min(PROVIDERS.length - 1, i + 1))
        setSelectedModelIdx(0)
      } else if (key.return) {
        if (isCustomProvider) {
          setCustomBaseUrl('')
          setStep('baseurl')
        } else if (provider.requiresKey) {
          setApiKey('')
          setStep('apikey')
        } else {
          setStep('model')
        }
      }
    }

    if (step === 'baseurl') {
      if (key.escape) {
        setStep('provider')
        return
      }
      // baseurl handled via TextInput onSubmit
    }

    if (step === 'model') {
      if (key.escape) {
        if (provider.requiresKey) {
          setStep('apikey')
        } else {
          setStep('provider')
        }
        return
      }
      if (key.upArrow) {
        setSelectedModelIdx(i => Math.max(0, i - 1))
      } else if (key.downArrow) {
        setSelectedModelIdx(i => Math.min(provider.models.length - 1, i + 1))
      } else if (key.return) {
        if (isCustomModel) {
          setCustomModelId('')
          setStep('custommodel')
        } else {
          setStep('confirm')
        }
      }
    }

    if (step === 'custommodel') {
      if (key.escape) {
        setStep('model')
        return
      }
      // handled via TextInput onSubmit
    }

    if (step === 'confirm') {
      if (key.escape || input === 'n') {
        setStep('model')
        return
      }
      if (key.return || input === 'y') {
        applyConfig()
      }
    }
  })

  // ── Input handlers ─────────────────────────────────────────────────
  function handleBaseUrlSubmit(value: string) {
    const trimmed = value.trim().replace(/\/$/, '')
    if (!trimmed) {
      setError('Base URL cannot be empty')
      return
    }
    if (!trimmed.startsWith('http')) {
      setError('Must start with http:// or https://')
      return
    }
    setError(null)
    setCustomBaseUrl(trimmed)
    setStep('apikey')
  }

  function handleApiKeySubmit(value: string) {
    const trimmed = value.trim()
    if (provider.requiresKey && !trimmed) {
      setError('API key cannot be empty')
      return
    }
    if (provider.requiresKey && trimmed.length < 8) {
      setError('API key looks too short — double-check it')
      return
    }
    setError(null)
    setApiKey(trimmed)
    setStep('model')
  }

  function handleCustomModelSubmit(value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Model ID cannot be empty')
      return
    }
    setError(null)
    setCustomModelId(trimmed)
    setStep('confirm')
  }

  function applyConfig() {
    const finalBaseUrl = isCustomProvider ? customBaseUrl : provider.baseUrl
    const finalModel = isCustomModel ? customModelId : (model?.id ?? '')
    const finalKey = apiKey

    // Apply env vars at runtime — effective immediately for all future requests
    process.env.LLM_BASE_URL = finalBaseUrl
    process.env.LLM_API_KEY = finalKey
    process.env.LLM_MODEL = finalModel

    // Update app state so /model and status bar show the new model name
    setAppState(prev => ({
      ...prev,
      mainLoopModel: finalModel,
    }))

    // Persist to ~/.claude/byok.env
    saveConfig(finalBaseUrl, finalKey, finalModel)

    const keyDisplay = finalKey
      ? chalk.dim('••••' + finalKey.slice(-4))
      : chalk.dim('(none)')

    const msg = [
      '',
      chalk.cyan.bold('⚡ BYOK Active'),
      chalk.dim('─'.repeat(40)),
      chalk.green('✓') + ' Provider: ' + chalk.bold(isCustomProvider ? 'Custom' : provider.label),
      chalk.green('✓') + ' Base URL: ' + chalk.bold(finalBaseUrl),
      chalk.green('✓') + ' Model:    ' + chalk.bold(finalModel),
      chalk.green('✓') + ' API Key:  ' + keyDisplay,
      '',
      chalk.green.bold('Connected!') + ' Your provider is now active.',
      chalk.dim(`Config saved to: ${BYOK_ENV_PATH}`),
      chalk.dim('Run /byok again to change · Esc to dismiss'),
    ].join('\n')

    onDone(msg, { display: 'system' })
  }

  // ── Render: Home ───────────────────────────────────────────────────
  if (step === 'home') {
    const hasSaved = !!(saved.baseUrl || saved.model)
    return (
      <Box flexDirection="column" marginLeft={1}>
        <Box marginBottom={1} flexDirection="column">
          <Text bold color="cyan">⚡ Bring Your Own Key (BYOK)</Text>
          <Text dimColor>{'─'.repeat(50)}</Text>
        </Box>

        {hasSaved ? (
          <Box flexDirection="column" gap={0}>
            <Box marginBottom={1}>
              <Text color="green">✓ </Text>
              <Text>Active configuration:</Text>
            </Box>
            <Box marginLeft={2} flexDirection="column">
              <Text>  Provider URL: <Text bold>{saved.baseUrl ?? '(not set)'}</Text></Text>
              <Text>  Model:        <Text bold>{saved.model ?? '(not set)'}</Text></Text>
              <Text>  API Key:      <Text dimColor>{saved.apiKey ? '••••' + saved.apiKey.slice(-4) : '(none)'}</Text></Text>
            </Box>
            <Box marginTop={1} flexDirection="column">
              <Text color="cyan">  [n] </Text><Text>Change configuration</Text>
              <Text color="yellow">  [r] </Text><Text>Remove saved config</Text>
              <Text dimColor>  [q/Esc] Cancel</Text>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text>Connect Claude Code to any OpenAI-compatible LLM provider.</Text>
            <Text dimColor>Works with OpenRouter, OpenAI, Ollama, and more.</Text>
            <Box marginTop={1}>
              <Text color="cyan">  [Enter] </Text><Text>Start setup</Text>
            </Box>
            <Text dimColor>  [q/Esc]  Cancel</Text>
          </Box>
        )}
      </Box>
    )
  }

  // ── Render: Provider selection ─────────────────────────────────────
  if (step === 'provider') {
    return (
      <Box flexDirection="column" marginLeft={1}>
        <StepHeader step={1} total={TOTAL_STEPS} title="Select Provider" />
        {PROVIDERS.map((p, i) => (
          <Box key={p.name} gap={1}>
            <Text color={i === selectedProviderIdx ? 'cyan' : 'white'}>
              {i === selectedProviderIdx ? '❯' : ' '} {p.label}
            </Text>
            {i === selectedProviderIdx && (
              <Text dimColor>— {p.baseUrl || 'custom URL'}</Text>
            )}
          </Box>
        ))}
        <HintBar hints={['↑↓ navigate', 'Enter select', 'Esc back']} />
      </Box>
    )
  }

  // ── Render: Custom base URL ────────────────────────────────────────
  if (step === 'baseurl') {
    return (
      <Box flexDirection="column" marginLeft={1}>
        <StepHeader step={1} total={TOTAL_STEPS} title="Custom Provider URL" />
        <Text dimColor>Enter the OpenAI-compatible API base URL:</Text>
        <Text dimColor>  e.g. http://localhost:11434/v1</Text>
        <Text dimColor>       https://my-llm-proxy.example.com/v1</Text>
        {error && <Box marginTop={1}><Text color="red">⚠ {error}</Text></Box>}
        <Box marginTop={1}>
          <Text color="cyan">URL ❯ </Text>
          <TextInput
            value={customBaseUrl}
            onChange={setCustomBaseUrl}
            onSubmit={handleBaseUrlSubmit}
            placeholder="https://..."
            columns={70}
            cursorOffset={customBaseUrlCursor}
            onChangeCursorOffset={setCustomBaseUrlCursor}
            focus
            showCursor
          />
        </Box>
        <HintBar hints={['Enter confirm', 'Esc back']} />
      </Box>
    )
  }

  // ── Render: API key input ──────────────────────────────────────────
  if (step === 'apikey') {
    return (
      <Box flexDirection="column" marginLeft={1}>
        <StepHeader step={provider.requiresKey ? 2 : 1} total={TOTAL_STEPS} title={`API Key — ${provider.label}`} />
        {provider.apiKeyUrl ? (
          <Text dimColor>Get your key: <Text>{provider.apiKeyUrl}</Text></Text>
        ) : (
          <Text dimColor>Enter your API key (or leave blank if not required):</Text>
        )}
        {error && <Box marginTop={1}><Text color="red">⚠ {error}</Text></Box>}
        <Box marginTop={1}>
          <Text color="cyan">Key ❯ </Text>
          <TextInput
            value={apiKey}
            onChange={setApiKey}
            onSubmit={handleApiKeySubmit}
            mask="*"
            placeholder={provider.requiresKey ? 'sk-…' : '(optional, press Enter to skip)'}
            columns={70}
            cursorOffset={apiKeyCursor}
            onChangeCursorOffset={setApiKeyCursor}
            focus
            showCursor
          />
        </Box>
        <HintBar hints={['Enter confirm', 'Esc back']} />
      </Box>
    )
  }

  // ── Render: Model selection ────────────────────────────────────────
  if (step === 'model') {
    const stepNum = isCustomProvider ? 2 : (provider.requiresKey ? 3 : 2)
    return (
      <Box flexDirection="column" marginLeft={1}>
        <StepHeader step={stepNum} total={TOTAL_STEPS} title={`Select Model — ${provider.label}`} />
        {provider.models.map((m, i) => (
          <Box key={m.id} flexDirection="column">
            <Box gap={1}>
              <Text color={i === selectedModelIdx ? 'cyan' : 'white'}>
                {i === selectedModelIdx ? '❯' : ' '} {m.label}
              </Text>
            </Box>
            {i === selectedModelIdx && (
              <Box marginLeft={4}>
                <Text dimColor>{m.description}</Text>
              </Box>
            )}
          </Box>
        ))}
        <HintBar hints={['↑↓ navigate', 'Enter select', 'Esc back']} />
      </Box>
    )
  }

  // ── Render: Custom model ID ────────────────────────────────────────
  if (step === 'custommodel') {
    return (
      <Box flexDirection="column" marginLeft={1}>
        <StepHeader step={TOTAL_STEPS} total={TOTAL_STEPS} title="Enter Model ID" />
        <Text dimColor>
          Type the exact model identifier (e.g. {provider.name === 'ollama' ? 'llama3:8b' : 'deepseek/deepseek-chat-v3-0324'}):
        </Text>
        {error && <Box marginTop={1}><Text color="red">⚠ {error}</Text></Box>}
        <Box marginTop={1}>
          <Text color="cyan">Model ❯ </Text>
          <TextInput
            value={customModelId}
            onChange={setCustomModelId}
            onSubmit={handleCustomModelSubmit}
            placeholder={provider.name === 'ollama' ? 'model:tag' : 'provider/model-name'}
            columns={65}
            cursorOffset={customModelCursor}
            onChangeCursorOffset={setCustomModelCursor}
            focus
            showCursor
          />
        </Box>
        <HintBar hints={['Enter confirm', 'Esc back to model list']} />
      </Box>
    )
  }

  // ── Render: Confirm ────────────────────────────────────────────────
  if (step === 'confirm') {
    const finalBaseUrl = isCustomProvider ? customBaseUrl : provider.baseUrl
    const finalModel = isCustomModel ? customModelId : (model?.id ?? '')
    return (
      <Box flexDirection="column" marginLeft={1}>
        <Box marginBottom={1} flexDirection="column">
          <Text bold color="cyan">⚡ Confirm Configuration</Text>
          <Text dimColor>{'─'.repeat(50)}</Text>
        </Box>
        <Box flexDirection="column" marginLeft={1}>
          <Text>  Provider: <Text bold color="cyan">{isCustomProvider ? 'Custom' : provider.label}</Text></Text>
          <Text>  Base URL: <Text bold>{finalBaseUrl}</Text></Text>
          <Text>  Model:    <Text bold color="green">{finalModel}</Text></Text>
          <Text>  API Key:  <Text dimColor>{apiKey ? '••••' + apiKey.slice(-4) : '(none / not required)'}</Text></Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Config will be saved to: {BYOK_ENV_PATH}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">  [Enter/y] </Text><Text>Apply & connect</Text>
        </Box>
        <Text dimColor>  [Esc/n]   Go back</Text>
      </Box>
    )
  }

  return null
}

// ── Export the command call ────────────────────────────────────────────
export const call: LocalJSXCommandCall = async (onDone, _context, _args) => {
  return <BYOKSetup onDone={onDone} />
}
