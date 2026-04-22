import * as React from 'react'
import { Box, Text, useInput } from '../../ink.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js'
import TextInput from '../../components/TextInput.js'
import { useSetAppState } from '../../state/AppState.js'
import { setMainLoopModelOverride } from '../../bootstrap/state.js'

// ── Persistence ────────────────────────────────────────────────────────
const CLAUDE_DIR = join(homedir(), '.claude')
const BYOK_ENV_PATH = join(CLAUDE_DIR, 'byok.env')

function loadSaved(): { baseUrl?: string; apiKey?: string; model?: string } {
  try {
    if (!existsSync(BYOK_ENV_PATH)) return {}
    const result: Record<string, string> = {}
    for (const line of readFileSync(BYOK_ENV_PATH, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      result[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
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

function persist(baseUrl: string, apiKey: string, model: string) {
  try {
    if (!existsSync(CLAUDE_DIR)) mkdirSync(CLAUDE_DIR, { recursive: true })
    writeFileSync(
      BYOK_ENV_PATH,
      [
        '# BYOK — managed by /byok',
        `# Updated: ${new Date().toISOString()}`,
        `LLM_BASE_URL=${baseUrl}`,
        `LLM_API_KEY=${apiKey}`,
        `LLM_MODEL=${model}`,
      ].join('\n') + '\n',
      { encoding: 'utf8', mode: 0o600 },
    )
  } catch { /* non-fatal */ }
}

// ── Provider definitions ───────────────────────────────────────────────
// Google exposes an OpenAI-compatible endpoint — no SDK needed.
// Docs: https://ai.google.dev/gemini-api/docs/openai
interface Provider {
  id: string
  label: string
  color: string          // display accent
  baseUrl: string
  keyLabel: string
  keyUrl: string
  keyPlaceholder: string
  modelExamples: string[]
  coming: boolean
  // verify: returns null on success, error string on failure
  verify: (key: string, model: string) => Promise<string | null>
}

const PROVIDERS: Provider[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    color: 'cyan',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyLabel: 'OpenRouter API Key',
    keyUrl: 'openrouter.ai/keys',
    keyPlaceholder: 'sk-or-...',
    modelExamples: [
      'deepseek/deepseek-chat-v3-0324',
      'anthropic/claude-sonnet-4-5',
      'google/gemini-2.5-flash-preview',
    ],
    coming: false,
    verify: async (key, model) => {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          if (res.status === 401) return 'Invalid API key — check openrouter.ai/keys'
          return `OpenRouter returned HTTP ${res.status}`
        }
        return null
      } catch (e: unknown) {
        if (e instanceof Error) {
          if (e.name === 'TimeoutError') return 'Connection timed out — check your internet'
          return e.message
        }
        return 'Unknown verification error'
      }
    },
  },
  {
    id: 'google',
    label: 'Google Gemini',
    color: 'green',
    // Google's official OpenAI-compatible endpoint (no SDK required)
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyLabel: 'Google AI Studio API Key',
    keyUrl: 'aistudio.google.com/apikey',
    keyPlaceholder: 'AIza...',
    modelExamples: [
      'gemini-2.5-flash-preview-05-20',
      'gemini-2.5-pro-preview-05-06',
      'gemini-2.0-flash',
    ],
    coming: false,
    verify: async (key, _model) => {
      // Use the REST models list endpoint — lightweight, no streaming needed
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1`,
          { signal: AbortSignal.timeout(8000) },
        )
        if (!res.ok) {
          if (res.status === 400 || res.status === 401 || res.status === 403) {
            return 'Invalid API key — check aistudio.google.com/apikey'
          }
          return `Google API returned HTTP ${res.status}`
        }
        return null
      } catch (e: unknown) {
        if (e instanceof Error) {
          if (e.name === 'TimeoutError') return 'Connection timed out — check your internet'
          return e.message
        }
        return 'Unknown verification error'
      }
    },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    color: 'gray',
    baseUrl: 'https://api.openai.com/v1',
    keyLabel: '',
    keyUrl: '',
    keyPlaceholder: '',
    modelExamples: [],
    coming: true,
    verify: async () => null,
  },
]

// ── Step type ──────────────────────────────────────────────────────────
type Step = 'pick' | 'apikey' | 'model' | 'verify' | 'done_err'

// ── Component ──────────────────────────────────────────────────────────
function BYOKSetup({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const saved = React.useMemo(() => loadSaved(), [])
  const setAppState = useSetAppState()

  const [step, setStep] = React.useState<Step>('pick')
  const [providerIdx, setProviderIdx] = React.useState(0)
  const [apiKey, setApiKey] = React.useState('')
  const [apiKeyCursor, setApiKeyCursor] = React.useState(0)
  const [model, setModel] = React.useState('')
  const [modelCursor, setModelCursor] = React.useState(0)
  const [verifying, setVerifying] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const provider = PROVIDERS[providerIdx]!

  // ── Key handling ───────────────────────────────────────────────────
  useInput((input, key) => {
    if (verifying) return

    if (step === 'pick') {
      if (key.escape || input === 'q') { onDone('', { display: 'skip' }); return }
      if (key.upArrow)   setProviderIdx(i => Math.max(0, i - 1))
      if (key.downArrow) setProviderIdx(i => Math.min(PROVIDERS.length - 1, i + 1))
      if (key.return) {
        if (provider.coming) return   // ignore Enter on coming-soon items
        setError(null)
        setApiKey('')
        setModel('')
        setStep('apikey')
      }
      return
    }

    if (step === 'apikey') {
      if (key.escape) { setError(null); setStep('pick'); return }
      return  // Enter handled by TextInput onSubmit
    }

    if (step === 'model') {
      if (key.escape) { setError(null); setStep('apikey'); return }
      return  // Enter handled by TextInput onSubmit
    }

    if (step === 'done_err') {
      if (key.escape || input === 'q' || key.return) {
        setError(null)
        setStep('model')
      }
      return
    }
  })

  // ── Submit: API key ─────────────────────────────────────────────────
  function handleKeySubmit(val: string) {
    const t = val.trim()
    if (!t) { setError('API key cannot be empty'); return }
    if (t.length < 10) { setError('That key looks too short — double-check it'); return }
    setError(null)
    setApiKey(t)
    setStep('model')
  }

  // ── Submit: model name ──────────────────────────────────────────────
  function handleModelSubmit(val: string) {
    const t = val.trim()
    if (!t) { setError('Model name cannot be empty'); return }
    setError(null)
    setModel(t)
    runVerify(apiKey, t)
  }

  // ── Verify + apply ──────────────────────────────────────────────────
  function runVerify(key: string, mdl: string) {
    setVerifying(true)
    setStep('verify')
    provider.verify(key, mdl).then(err => {
      setVerifying(false)
      if (err) {
        setError(err)
        setStep('done_err')
      } else {
        applyConfig(key, mdl)
      }
    })
  }

  function applyConfig(key: string, mdl: string) {
    const baseUrl = provider.baseUrl

    process.env.LLM_BASE_URL = baseUrl
    process.env.LLM_API_KEY = key
    process.env.LLM_MODEL = mdl

    setMainLoopModelOverride(mdl)
    setAppState(prev => ({ ...prev, mainLoopModel: mdl }))
    persist(baseUrl, key, mdl)

    const masked = '••••' + key.slice(-4)
    const esc = (c: string, s: string) => `\x1b[${c}m${s}\x1b[0m`

    onDone(
      [
        '',
        esc('36;1', `⚡ BYOK Connected — ${provider.label}`),
        esc('2', '─'.repeat(44)),
        `${esc('32', '✓')} Provider: ${esc('1', provider.label)}`,
        `${esc('32', '✓')} Model:    ${esc('1', mdl)}`,
        `${esc('32', '✓')} API Key:  ${esc('2', masked)}`,
        '',
        `${esc('32', 'Ready!')} Your model is active. Use ${esc('36', '/model')} to confirm.`,
        esc('2', 'Run /byok again to change · saved to ~/.claude/byok.env'),
      ].join('\n'),
      { display: 'system' },
    )
  }

  // ── RENDER: provider pick ───────────────────────────────────────────
  if (step === 'pick') {
    const hasSaved = !!(saved.baseUrl && saved.model)
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">⚡ Bring Your Own Key</Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>

        {hasSaved && (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="green">✓ Active: <Text bold>{saved.model}</Text>
              <Text dimColor>  ({saved.baseUrl})</Text>
            </Text>
          </Box>
        )}

        <Text dimColor>Select provider:</Text>
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          {PROVIDERS.map((p, i) => {
            const sel = i === providerIdx
            return (
              <Box key={p.id} flexDirection="column">
                <Box>
                  <Text color={sel && !p.coming ? p.color : undefined}>
                    {sel ? '❯ ' : '  '}
                  </Text>
                  <Text
                    bold={sel && !p.coming}
                    color={p.coming ? 'gray' : (sel ? p.color : undefined)}
                  >
                    {p.label}
                  </Text>
                  {p.coming && <Text color="yellow">  [coming soon]</Text>}
                </Box>
                {sel && !p.coming && (
                  <Box paddingLeft={3}>
                    <Text dimColor>Get key: {p.keyUrl}</Text>
                  </Box>
                )}
                {sel && p.coming && (
                  <Box paddingLeft={3}>
                    <Text dimColor>Support coming soon — use OpenRouter or Google Gemini</Text>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>

        <Text dimColor>↑↓ navigate · Enter select · q/Esc cancel</Text>
      </Box>
    )
  }

  // ── RENDER: API key ─────────────────────────────────────────────────
  if (step === 'apikey') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={provider.color}>
            ⚡ {provider.label} — API Key{'  '}
            <Text dimColor>(1/2)</Text>
          </Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>

        <Text dimColor>
          Get your key at: <Text>{provider.keyUrl}</Text>
        </Text>
        <Box marginTop={1} marginBottom={1}>
          <Text color={provider.color}>Key ❯ </Text>
          <TextInput
            value={apiKey}
            onChange={v => { setApiKey(v); setError(null) }}
            onSubmit={handleKeySubmit}
            mask="*"
            placeholder={provider.keyPlaceholder}
            columns={65}
            cursorOffset={apiKeyCursor}
            onChangeCursorOffset={setApiKeyCursor}
            focus
            showCursor
          />
        </Box>

        {error && <Text color="red">⚠  {error}</Text>}
        <Text dimColor>Enter to confirm · Esc to go back</Text>
      </Box>
    )
  }

  // ── RENDER: model name ──────────────────────────────────────────────
  if (step === 'model') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={provider.color}>
            ⚡ {provider.label} — Model{'  '}
            <Text dimColor>(2/2)</Text>
          </Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>

        <Text dimColor>Enter the model ID:</Text>
        {provider.modelExamples.map(ex => (
          <Text key={ex} dimColor>  e.g. <Text>{ex}</Text></Text>
        ))}

        <Box marginTop={1} marginBottom={1}>
          <Text color={provider.color}>Model ❯ </Text>
          <TextInput
            value={model}
            onChange={v => { setModel(v); setError(null) }}
            onSubmit={handleModelSubmit}
            placeholder={provider.modelExamples[0] ?? 'model-name'}
            columns={60}
            cursorOffset={modelCursor}
            onChangeCursorOffset={setModelCursor}
            focus
            showCursor
          />
        </Box>

        {error && <Text color="red">⚠  {error}</Text>}
        <Text dimColor>Enter to verify · Esc to go back</Text>
      </Box>
    )
  }

  // ── RENDER: verifying ───────────────────────────────────────────────
  if (step === 'verify') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={provider.color}>⚡ {provider.label} — Verifying…</Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>
        <Box>
          <Text color="yellow">◌ </Text>
          <Text>Checking API key with {provider.label}…</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Model: <Text bold>{model}</Text></Text>
        </Box>
      </Box>
    )
  }

  // ── RENDER: error ───────────────────────────────────────────────────
  if (step === 'done_err') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="red">⚡ Verification Failed</Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>
        <Text color="red">✗  {error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Enter or Esc to fix and retry</Text>
        </Box>
      </Box>
    )
  }

  return null
}

// ── Export ─────────────────────────────────────────────────────────────
export const call: LocalJSXCommandCall = async (onDone, _context, _args) => {
  return <BYOKSetup onDone={onDone} />
}
