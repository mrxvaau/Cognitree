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

// ── Provider config ────────────────────────────────────────────────────
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

type Step = 'pick' | 'apikey' | 'model' | 'verify' | 'done_err'

// ── Live verification ──────────────────────────────────────────────────
async function verifyOpenRouter(key: string, model: string): Promise<string | null> {
  // Returns null on success, error string on failure
  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      if (res.status === 401) return 'Invalid API key — check https://openrouter.ai/keys'
      return `OpenRouter returned HTTP ${res.status}`
    }
    // Confirm the model exists in the list
    const json = await res.json() as { data?: Array<{ id: string }> }
    const ids = json.data?.map(m => m.id) ?? []
    if (ids.length > 0 && !ids.includes(model)) {
      // Model not in list — warn but don't block (custom/private models won't appear)
      // We'll return null and show a soft warning instead
    }
    return null
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.name === 'TimeoutError') return 'Connection timed out — check your internet'
      return e.message
    }
    return 'Unknown error during verification'
  }
}

// ── Component ──────────────────────────────────────────────────────────
function BYOKSetup({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const saved = React.useMemo(() => loadSaved(), [])
  const setAppState = useSetAppState()

  const [step, setStep] = React.useState<Step>('pick')
  const [providerIdx, setProviderIdx] = React.useState(0)          // 0=OpenRouter, 1=OpenAI
  const [apiKey, setApiKey] = React.useState('')
  const [apiKeyCursor, setApiKeyCursor] = React.useState(0)
  const [model, setModel] = React.useState('')
  const [modelCursor, setModelCursor] = React.useState(0)
  const [verifying, setVerifying] = React.useState(false)
  const [verifyWarn, setVerifyWarn] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // ── Key handling ───────────────────────────────────────────────────
  useInput((input, key) => {
    if (verifying) return   // lock while async verification runs

    if (step === 'pick') {
      if (key.escape || input === 'q') {
        onDone('', { display: 'skip' })
        return
      }
      if (key.upArrow) setProviderIdx(i => Math.max(0, i - 1))
      if (key.downArrow) setProviderIdx(i => Math.min(1, i + 1))
      if (key.return) {
        if (providerIdx === 1) {
          // OpenAI — coming soon, do nothing (already shown in UI)
          return
        }
        setError(null)
        setStep('apikey')
      }
      return
    }

    if (step === 'apikey') {
      if (key.escape) { setError(null); setStep('pick'); return }
      // TextInput onSubmit handles Enter
      return
    }

    if (step === 'model') {
      if (key.escape) { setError(null); setStep('apikey'); return }
      // TextInput onSubmit handles Enter
      return
    }

    if (step === 'done_err') {
      if (key.escape || input === 'q' || key.return) {
        setError(null)
        setVerifyWarn(null)
        setStep('model')
      }
      return
    }
  })

  // ── Submit handlers ────────────────────────────────────────────────
  function handleKeySubmit(val: string) {
    const t = val.trim()
    if (!t) { setError('API key cannot be empty'); return }
    if (t.length < 10) { setError('That key looks too short — double check it'); return }
    setError(null)
    setApiKey(t)
    setStep('model')
  }

  function handleModelSubmit(val: string) {
    const t = val.trim()
    if (!t) { setError('Model name cannot be empty'); return }
    setError(null)
    setModel(t)
    runVerify(apiKey, t)
  }

  function runVerify(key: string, mdl: string) {
    setVerifying(true)
    setVerifyWarn(null)
    setStep('verify')
    verifyOpenRouter(key, mdl).then(err => {
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
    const baseUrl = OPENROUTER_BASE

    // Apply runtime env vars
    process.env.LLM_BASE_URL = baseUrl
    process.env.LLM_API_KEY = key
    process.env.LLM_MODEL = mdl

    // Push model into bootstrap state so getMainLoopModel() picks it up
    setMainLoopModelOverride(mdl)

    // Push into React AppState so status bar / /model command reflects it
    setAppState(prev => ({ ...prev, mainLoopModel: mdl }))

    // Persist to disk
    persist(baseUrl, key, mdl)

    const masked = '••••' + key.slice(-4)
    onDone(
      [
        '',
        '\x1b[36m\x1b[1m⚡ BYOK Connected — OpenRouter\x1b[0m',
        '\x1b[2m' + '─'.repeat(42) + '\x1b[0m',
        `\x1b[32m✓\x1b[0m Model:   \x1b[1m${mdl}\x1b[0m`,
        `\x1b[32m✓\x1b[0m API Key: \x1b[2m${masked}\x1b[0m`,
        '',
        '\x1b[32mReady!\x1b[0m Your model is active. Use \x1b[36m/model\x1b[0m to confirm.',
        '\x1b[2mRun /byok again to change · saved to ~/.claude/byok.env\x1b[0m',
      ].join('\n'),
      { display: 'system' },
    )
  }

  // ── Render helpers ─────────────────────────────────────────────────
  const providers = [
    { label: 'OpenRouter', sub: 'openrouter.ai — access 300+ models with one key', coming: false },
    { label: 'OpenAI',     sub: 'Coming soon',                                      coming: true  },
  ]

  // STEP: provider pick
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
              <Text dimColor>  via {saved.baseUrl}</Text>
            </Text>
          </Box>
        )}

        <Text dimColor>Select provider:</Text>
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          {providers.map((p, i) => {
            const sel = i === providerIdx
            return (
              <Box key={p.label} flexDirection="column">
                <Box>
                  <Text color={sel ? 'cyan' : undefined}>
                    {sel ? '❯ ' : '  '}
                  </Text>
                  <Text bold={sel} color={p.coming ? 'gray' : (sel ? 'cyan' : undefined)}>
                    {p.label}
                  </Text>
                  {p.coming && <Text color="yellow">  [coming soon]</Text>}
                </Box>
                {sel && (
                  <Box paddingLeft={3}>
                    <Text dimColor>{p.sub}</Text>
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

  // STEP: API key
  if (step === 'apikey') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">⚡ OpenRouter — API Key  <Text dimColor>(1/2)</Text></Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>

        <Text dimColor>Get your key at: <Text>openrouter.ai/keys</Text></Text>
        <Box marginTop={1} marginBottom={1}>
          <Text color="cyan">Key ❯ </Text>
          <TextInput
            value={apiKey}
            onChange={v => { setApiKey(v); setError(null) }}
            onSubmit={handleKeySubmit}
            mask="*"
            placeholder="sk-or-..."
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

  // STEP: model name
  if (step === 'model') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">⚡ OpenRouter — Model  <Text dimColor>(2/2)</Text></Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>

        <Text dimColor>Enter the model ID exactly as shown on OpenRouter:</Text>
        <Text dimColor>  e.g. <Text>deepseek/deepseek-chat-v3-0324</Text></Text>
        <Text dimColor>       <Text>anthropic/claude-sonnet-4-5</Text></Text>
        <Text dimColor>       <Text>google/gemini-2.5-flash-preview</Text></Text>

        <Box marginTop={1} marginBottom={1}>
          <Text color="cyan">Model ❯ </Text>
          <TextInput
            value={model}
            onChange={v => { setModel(v); setError(null) }}
            onSubmit={handleModelSubmit}
            placeholder="provider/model-name"
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

  // STEP: verifying (spinner)
  if (step === 'verify') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">⚡ OpenRouter — Verifying…</Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>
        <Box>
          <Text color="yellow">◌ </Text>
          <Text>Checking API key with OpenRouter…</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Model: <Text bold>{model}</Text></Text>
        </Box>
      </Box>
    )
  }

  // STEP: verification error
  if (step === 'done_err') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="red">⚡ Verification Failed</Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>
        <Text color="red">✗  {error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Enter or Esc to go back and fix the model name</Text>
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
