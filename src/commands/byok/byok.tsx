import chalk from 'chalk'
import * as React from 'react'
import { Box, Text, useInput } from 'ink'
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js'
import TextInput from '../../components/TextInput.js'
import { useSetAppState } from '../../state/AppState.js'
import { setMainLoopModelOverride } from '../../bootstrap/state.js'

// ── Provider definitions ───────────────────────────────────────────────
interface ProviderDef {
  name: string
  label: string
  baseUrl: string
  models: Array<{ id: string; label: string; description: string }>
}

const PROVIDERS: ProviderDef[] = [
  {
    name: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      {
        id: 'deepseek/deepseek-chat-v3-0324',
        label: 'DeepSeek V3 (0324)',
        description: 'Best value · native tool calling · $0.27/M tokens',
      },
      {
        id: 'anthropic/claude-sonnet-4',
        label: 'Claude Sonnet 4',
        description: 'Top-tier coding · native tools · $3/M in, $15/M out',
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        label: 'Claude 3.5 Sonnet',
        description: 'Great coding · native tools · $3/M in, $15/M out',
      },
      {
        id: 'google/gemini-2.5-flash-preview',
        label: 'Gemini 2.5 Flash',
        description: 'Fast & cheap · tool calling · ~$0.15/M tokens',
      },
      {
        id: 'qwen/qwen3-32b',
        label: 'Qwen 3 32B',
        description: 'Strong coder · free tier available',
      },
      {
        id: 'meta-llama/llama-4-maverick',
        label: 'Llama 4 Maverick',
        description: 'Open source · solid tool calling',
      },
    ],
  },
]

// ── Step types ─────────────────────────────────────────────────────────
type Step = 'provider' | 'apikey' | 'model' | 'done'

// ── Main BYOK Component ───────────────────────────────────────────────
function BYOKSetup({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const [step, setStep] = React.useState<Step>('provider')
  const [selectedProviderIdx, setSelectedProviderIdx] = React.useState(0)
  const [selectedModelIdx, setSelectedModelIdx] = React.useState(0)
  const [apiKey, setApiKey] = React.useState('')
  const [cursorOffset, setCursorOffset] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const setAppState = useSetAppState()

  const provider = PROVIDERS[selectedProviderIdx]!

  useInput((input, key) => {
    if (key.escape) {
      onDone('Cancelled BYOK setup', { display: 'system' })
      return
    }

    if (step === 'provider') {
      if (key.upArrow) {
        setSelectedProviderIdx(Math.max(0, selectedProviderIdx - 1))
      } else if (key.downArrow) {
        setSelectedProviderIdx(Math.min(PROVIDERS.length - 1, selectedProviderIdx + 1))
      } else if (key.return) {
        setStep('apikey')
      }
    }

    if (step === 'model') {
      if (key.upArrow) {
        setSelectedModelIdx(Math.max(0, selectedModelIdx - 1))
      } else if (key.downArrow) {
        setSelectedModelIdx(Math.min(provider.models.length - 1, selectedModelIdx + 1))
      } else if (key.return) {
        applyConfig()
      }
    }
  })

  function handleApiKeySubmit(value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('API key cannot be empty')
      return
    }
    if (trimmed.length < 10) {
      setError('API key looks too short — check your key')
      return
    }
    setError(null)
    setApiKey(trimmed)
    setStep('model')
  }

  function applyConfig() {
    const model = provider.models[selectedModelIdx]!

    // Apply env vars at runtime — these take effect immediately
    process.env.LLM_BASE_URL = provider.baseUrl
    process.env.LLM_API_KEY = apiKey
    process.env.LLM_MODEL = model.id

    // Set model override at the bootstrap level (survives /model switches)
    setMainLoopModelOverride(model.id)

    // Update app state so /model shows the new model
    setAppState(prev => ({
      ...prev,
      mainLoopModel: model.id,
      mainLoopModelForSession: null,
    }))

    setStep('done')

    const msg = [
      '',
      chalk.green('✓') + ' Provider: ' + chalk.bold(provider.label),
      chalk.green('✓') + ' Model: ' + chalk.bold(model.label),
      chalk.green('✓') + ' API Key: ' + chalk.dim('sk-or-…' + apiKey.slice(-4)),
      '',
      chalk.green.bold('Connected!') + ' Your model is now active.',
      chalk.dim('Tip: Use /model to switch models anytime.'),
    ].join('\n')

    onDone(msg, { display: 'system' })
  }

  // ── Provider selection step ────────────────────────────────
  if (step === 'provider') {
    return (
      <Box flexDirection="column" marginLeft={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            ⚡ Bring Your Own Key — Select Provider
          </Text>
        </Box>
        {PROVIDERS.map((p, i) => (
          <Box key={p.name} gap={1}>
            <Text color={i === selectedProviderIdx ? 'cyan' : 'white'}>
              {i === selectedProviderIdx ? '❯' : ' '} {p.label}
            </Text>
            <Text dimColor>({p.baseUrl})</Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>↑↓ to navigate · Enter to select · Esc to cancel</Text>
        </Box>
      </Box>
    )
  }

  // ── API key input step ─────────────────────────────────────
  if (step === 'apikey') {
    return (
      <Box flexDirection="column" marginLeft={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            🔑 Enter your {provider.label} API key
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>
            Get your key from{' '}
            {provider.name === 'openrouter' ? 'https://openrouter.ai/keys' : provider.baseUrl}
          </Text>
        </Box>
        {error && (
          <Box marginBottom={1}>
            <Text color="red">⚠ {error}</Text>
          </Box>
        )}
        <Box>
          <Text color="cyan">❯ </Text>
          <TextInput
            value={apiKey}
            onChange={setApiKey}
            onSubmit={handleApiKeySubmit}
            mask="*"
            placeholder="sk-or-v1-..."
            columns={80}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
            focus
            showCursor
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Paste your API key and press Enter · Esc to cancel</Text>
        </Box>
      </Box>
    )
  }

  // ── Model selection step ───────────────────────────────────
  if (step === 'model') {
    return (
      <Box flexDirection="column" marginLeft={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            🤖 Select a model from {provider.label}
          </Text>
        </Box>
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
        <Box marginTop={1}>
          <Text dimColor>↑↓ to navigate · Enter to activate · Esc to cancel</Text>
        </Box>
      </Box>
    )
  }

  return null
}

// ── Export the command call ────────────────────────────────────────────
export const call: LocalJSXCommandCall = async (onDone, _context, _args) => {
  return <BYOKSetup onDone={onDone} />
}
