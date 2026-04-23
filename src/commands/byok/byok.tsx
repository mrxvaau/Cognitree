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

// ── Profile type ───────────────────────────────────────────────────────
interface BYOKProfile {
  name: string       // e.g. "Google Gemini / gemini-2.5-flash"
  baseUrl: string
  apiKey: string
  model: string
  provider: string   // provider id
}

// ── Profile persistence ────────────────────────────────────────────────
function loadProfiles(): BYOKProfile[] {
  try {
    if (!existsSync(BYOK_ENV_PATH)) return []
    const content = readFileSync(BYOK_ENV_PATH, 'utf8')
    const profiles: BYOKProfile[] = []

    // Each profile is a block starting with # PROFILE:<name>
    const blocks = content.split(/^# PROFILE:/m).filter(Boolean)
    for (const block of blocks) {
      const lines = block.split('\n')
      const name = lines[0]!.trim()
      const kv: Record<string, string> = {}
      for (const line of lines.slice(1)) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const eq = t.indexOf('=')
        if (eq === -1) continue
        kv[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
      }
      if (kv['LLM_BASE_URL'] && kv['LLM_API_KEY'] && kv['LLM_MODEL']) {
        profiles.push({
          name,
          baseUrl: kv['LLM_BASE_URL']!,
          apiKey: kv['LLM_API_KEY']!,
          model: kv['LLM_MODEL']!,
          provider: kv['LLM_PROVIDER'] ?? 'unknown',
        })
      }
    }
    return profiles
  } catch {
    return []
  }
}

function saveProfile(profile: BYOKProfile): void {
  try {
    if (!existsSync(CLAUDE_DIR)) mkdirSync(CLAUDE_DIR, { recursive: true })
    const existing = loadProfiles()

    // Replace existing profile with same name, or append
    const idx = existing.findIndex(p => p.name === profile.name)
    if (idx >= 0) {
      existing[idx] = profile
    } else {
      existing.push(profile)
    }

    const lines = [
      '# BYOK profiles — managed by /byok',
      `# Updated: ${new Date().toISOString()}`,
      '',
    ]
    for (const p of existing) {
      lines.push(`# PROFILE:${p.name}`)
      lines.push(`LLM_BASE_URL=${p.baseUrl}`)
      lines.push(`LLM_API_KEY=${p.apiKey}`)
      lines.push(`LLM_MODEL=${p.model}`)
      lines.push(`LLM_PROVIDER=${p.provider}`)
      lines.push(`LLM_ACTIVE=${p.name === profile.name ? 'true' : 'false'}`)
      lines.push('')
    }

    writeFileSync(BYOK_ENV_PATH, lines.join('\n'), { encoding: 'utf8', mode: 0o600 })
  } catch { /* non-fatal */ }
}

function getActiveProfile(): BYOKProfile | undefined {
  // Returns profile whose env vars match what's currently in process.env
  const currentModel = process.env.LLM_MODEL
  const currentUrl = process.env.LLM_BASE_URL
  if (!currentModel || !currentUrl) return undefined
  return loadProfiles().find(p => p.model === currentModel && p.baseUrl === currentUrl)
}

// ── Provider definitions ───────────────────────────────────────────────
interface Provider {
  id: string
  label: string
  color: string
  baseUrl: string           // fixed URL, or '' when requiresCustomUrl is true
  requiresCustomUrl?: boolean // if true, user enters their own endpoint URL
  urlLabel?: string         // label shown in the URL input step
  urlPlaceholder?: string   // placeholder text for URL input
  keyLabel: string
  keyUrl: string
  keyPlaceholder: string
  modelExamples: string[]
  coming: boolean
  verify: (key: string, model: string, url?: string) => Promise<string | null>
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
      // 🥇 BEST VALUE — cheapest, top quality coding
      'deepseek/deepseek-chat-v3-0324',        // $0.14/M in · $0.28/M out — #1 value coder
      'google/gemini-2.5-flash-preview-05-20', // $0.15/M in · $0.60/M out — fast, 1M context
      'qwen/qwen-2.5-coder-32b-instruct',      // $0.07/M in · $0.16/M out — cheapest good coder
      // 🥈 REASONING — best thinking models per dollar
      'deepseek/deepseek-r1',                  // $0.55/M in · $2.19/M out — best OSS reasoning
      'qwen/qwen3-235b-a22b',                  // $0.13/M in · $0.60/M out — MoE reasoning
      // 🥉 PREMIUM — more expensive but best overall
      'anthropic/claude-sonnet-4-5',           // $3/M in  · $15/M out  — best overall
      'google/gemini-2.5-pro-preview-05-06',   // $1.25/M in · $10/M out — best Gemini
      'openai/gpt-4.1',                        // $2/M in  · $8/M out   — solid all-rounder
      // 💎 LONG CONTEXT
      'minimax/minimax-01',                    // $0.20/M in · $1.10/M out — 1M context
    ],
    coming: false,
    verify: async (key, _model) => {
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
    id: 'groq',
    label: 'Groq',
    color: 'magenta',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyLabel: 'Groq API Key',
    keyUrl: 'console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
    modelExamples: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'deepseek-r1-distill-llama-70b',
      'gemma2-9b-it',
    ],
    coming: false,
    verify: async (key, _model) => {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          if (res.status === 401) return 'Invalid API key — check console.groq.com/keys'
          if (res.status === 403) return 'API key does not have permission'
          return `Groq returned HTTP ${res.status}`
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
  // ── DeepSeek ── automatic prefix caching built-in (10× cheaper on cache hits)
  {
    id: 'deepseek',
    label: 'DeepSeek',
    color: 'blue',
    baseUrl: 'https://api.deepseek.com/v1',
    keyLabel: 'DeepSeek API Key',
    keyUrl: 'platform.deepseek.com/api_keys',
    keyPlaceholder: 'sk-...',
    modelExamples: [
      'deepseek-chat',        // DeepSeek-V3 — best coding model, auto prefix cache
      'deepseek-reasoner',    // DeepSeek-R1 — reasoning/math
    ],
    coming: false,
    verify: async (key, _model) => {
      try {
        const res = await fetch('https://api.deepseek.com/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          if (res.status === 401) return 'Invalid API key — check platform.deepseek.com/api_keys'
          if (res.status === 403) return 'API key does not have permission'
          return `DeepSeek returned HTTP ${res.status}`
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
  // ── Qwen Cloud (DashScope) ── OpenAI-compatible mode, automatic KV prefix cache
  {
    id: 'qwen',
    label: 'Qwen Cloud (Alibaba)',
    color: 'yellow',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyLabel: 'DashScope API Key',
    keyUrl: 'dashscope.console.aliyun.com/apiKey',
    keyPlaceholder: 'sk-...',
    modelExamples: [
      'qwen-coder-plus',      // Best coding — prefix cache supported
      'qwen-coder-turbo',     // Faster, cheaper
      'qwen-max',             // Most capable general model
      'qwen-plus',            // Balanced
      'qwen-turbo',           // Fastest / cheapest
      'qwen3-235b-a22b',      // Qwen3 MoE flagship
    ],
    coming: false,
    verify: async (key, _model) => {
      try {
        const res = await fetch(
          'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
          {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10000),
          },
        )
        if (!res.ok) {
          if (res.status === 401) return 'Invalid API key — check dashscope.console.aliyun.com/apiKey'
          if (res.status === 403) return 'API key does not have permission'
          // DashScope sometimes returns 404 for /models — try a minimal chat call
          if (res.status === 404) {
            const chatRes = await fetch(
              'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${key}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'qwen-turbo',
                  messages: [{ role: 'user', content: 'hi' }],
                  max_tokens: 1,
                }),
                signal: AbortSignal.timeout(10000),
              },
            )
            if (chatRes.status === 401 || chatRes.status === 403)
              return 'Invalid API key — check dashscope.console.aliyun.com/apiKey'
            if (!chatRes.ok && chatRes.status !== 200)
              return `DashScope returned HTTP ${chatRes.status}`
            return null
          }
          return `DashScope returned HTTP ${res.status}`
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
  // ── MiniMax ── OpenAI-compatible, high context window (up to 1M tokens)
  {
    id: 'minimax',
    label: 'MiniMax',
    color: 'cyan',
    baseUrl: 'https://api.minimax.io/v1',
    keyLabel: 'MiniMax API Key',
    keyUrl: 'platform.minimaxi.com/user-center/basic-information/interface-key',
    keyPlaceholder: 'eyJ...',
    modelExamples: [
      'MiniMax-Text-01',      // 1M context window flagship
      'abab6.5s-chat',        // Fast and affordable
    ],
    coming: false,
    verify: async (key, _model) => {
      try {
        // MiniMax uses a minimal chat call to verify — no /models endpoint
        const res = await fetch('https://api.minimax.io/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'abab6.5s-chat',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(12000),
        })
        if (res.status === 401) return 'Invalid API key — check platform.minimaxi.com'
        if (res.status === 403) return 'API key does not have access to this model'
        // 200 or 400 (bad params) both mean the key is valid
        if (res.status === 200 || res.status === 400) return null
        return `MiniMax returned HTTP ${res.status}`
      } catch (e: unknown) {
        if (e instanceof Error) {
          if (e.name === 'TimeoutError') return 'Connection timed out — check your internet'
          return e.message
        }
        return 'Unknown verification error'
      }
    },
  },
  // ── Alibaba Cloud MaaS ── workspace-specific OpenAI-compatible endpoint
  {
    id: 'alibaba-maas',
    label: 'Alibaba Cloud MaaS',
    color: 'yellow',
    baseUrl: '',                 // workspace URL entered by user each time
    requiresCustomUrl: true,
    urlLabel: 'Workspace Endpoint URL',
    urlPlaceholder: 'https://ws-xxxxxxxx.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    keyLabel: 'MaaS API Key',
    keyUrl: 'bailian.console.aliyun.com',
    keyPlaceholder: 'sk-...',
    modelExamples: [
      'qwen-max',           // Most capable
      'qwen-plus',          // Balanced
      'qwen-turbo',         // Fastest / cheapest
      'qwen-coder-plus',    // Best coding
      'qwen-coder-turbo',   // Fast coding
      'qwen3-235b-a22b',    // Qwen3 MoE flagship
    ],
    coming: false,
    verify: async (key, model, url) => {
      const base = url?.trim()
      if (!base) return 'Workspace URL is required'
      const endpoint = base.replace(/\/$/, '') + '/chat/completions'
      try {
        // Verify by sending a minimal chat completion — same pattern as Alibaba sample code
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(15000),
        })
        if (res.status === 401 || res.status === 403)
          return 'Invalid API key — check bailian.console.aliyun.com'
        if (res.status === 404)
          return 'Workspace URL not found — check your endpoint URL'
        if (res.status === 200 || res.status === 400) return null
        const body = await res.text().catch(() => '')
        return `MaaS returned HTTP ${res.status}: ${body.slice(0, 120)}`
      } catch (e: unknown) {
        if (e instanceof Error) {
          if (e.name === 'TimeoutError') return 'Connection timed out — check your workspace URL and internet'
          if (e.message.includes('fetch')) return `Cannot reach ${endpoint} — check the workspace URL`
          return e.message
        }
        return 'Unknown verification error'
      }
    },
  },
]

// ── Step type ──────────────────────────────────────────────────────────
type Step = 'home' | 'pick' | 'baseurl' | 'apikey' | 'model' | 'verify' | 'done_err'

// ── Component ──────────────────────────────────────────────────────────
function BYOKSetup({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const setAppState = useSetAppState()

  const [step, setStep] = React.useState<Step>('home')
  const [profiles, setProfiles] = React.useState<BYOKProfile[]>(() => loadProfiles())
  const [profileIdx, setProfileIdx] = React.useState(0)
  const [providerIdx, setProviderIdx] = React.useState(0)
  const [customUrl, setCustomUrl] = React.useState('')
  const [customUrlCursor, setCustomUrlCursor] = React.useState(0)
  const [apiKey, setApiKey] = React.useState('')
  const [apiKeyCursor, setApiKeyCursor] = React.useState(0)
  const [model, setModel] = React.useState('')
  const [modelCursor, setModelCursor] = React.useState(0)
  const [verifying, setVerifying] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const provider = PROVIDERS[providerIdx]!
  const activeProfile = getActiveProfile()
  const hasProfiles = profiles.length > 0

  // ── Key handling ───────────────────────────────────────────────────
  useInput((input, key) => {
    if (verifying) return

    // ── Home screen ─────────────────────────────────────────────────
    if (step === 'home') {
      if (key.escape || input === 'q') { onDone('', { display: 'skip' }); return }

      // 'n' = add new provider
      if (input === 'n') {
        setError(null)
        setApiKey('')
        setModel('')
        setCustomUrl('')
        setStep('pick')
        return
      }

      // arrow keys navigate saved profiles
      if (hasProfiles) {
        if (key.upArrow)   setProfileIdx(i => Math.max(0, i - 1))
        if (key.downArrow) setProfileIdx(i => Math.min(profiles.length - 1, i + 1))
        if (key.return) {
          // Switch to selected profile
          const p = profiles[profileIdx]!
          applyProfile(p)
          return
        }
        if (input === 'd') {
          // Delete selected profile
          const updated = profiles.filter((_, i) => i !== profileIdx)
          const newLines = ['# BYOK profiles — managed by /byok', `# Updated: ${new Date().toISOString()}`, '']
          for (const p of updated) {
            const isActive = activeProfile?.name === p.name
            newLines.push(`# PROFILE:${p.name}`)
            newLines.push(`LLM_BASE_URL=${p.baseUrl}`)
            newLines.push(`LLM_API_KEY=${p.apiKey}`)
            newLines.push(`LLM_MODEL=${p.model}`)
            newLines.push(`LLM_PROVIDER=${p.provider}`)
            newLines.push(`LLM_ACTIVE=${isActive ? 'true' : 'false'}`)
            newLines.push('')
          }
          try {
            writeFileSync(BYOK_ENV_PATH, newLines.join('\n'), { encoding: 'utf8', mode: 0o600 })
          } catch { /* non-fatal */ }
          setProfiles(updated)
          setProfileIdx(Math.min(profileIdx, Math.max(0, updated.length - 1)))
          return
        }
      }
      return
    }

    // ── Provider pick ─────────────────────────────────────────────────
    if (step === 'pick') {
      if (key.escape) { setStep('home'); return }
      if (key.upArrow)   setProviderIdx(i => Math.max(0, i - 1))
      if (key.downArrow) setProviderIdx(i => Math.min(PROVIDERS.length - 1, i + 1))
      if (key.return) {
        if (provider.coming) return
        setError(null)
        setApiKey('')
        setModel('')
        setCustomUrl('')
        setStep(provider.requiresCustomUrl ? 'baseurl' : 'apikey')
      }
      return
    }

    if (step === 'baseurl') {
      if (key.escape) { setError(null); setStep('pick'); return }
      if (key.return) { handleUrlSubmit(customUrl); return }
      return
    }

    if (step === 'apikey') {
      if (key.escape) { setError(null); setStep(provider.requiresCustomUrl ? 'baseurl' : 'pick'); return }
      if (key.return) { handleKeySubmit(apiKey); return }
      return
    }

    if (step === 'model') {
      if (key.escape) { setError(null); setStep('apikey'); return }
      if (key.return) { handleModelSubmit(model); return }
      return
    }

    if (step === 'done_err') {
      if (key.escape || input === 'q' || key.return) {
        setError(null)
        setStep('model')
      }
      return
    }
  })

  // ── Apply saved profile ────────────────────────────────────────────
  function applyProfile(p: BYOKProfile) {
    process.env.LLM_BASE_URL = p.baseUrl
    process.env.LLM_API_KEY = p.apiKey
    process.env.LLM_MODEL = p.model

    // Auto-enable simple mode for non-Claude providers (same as applyAndSave)
    const isNonClaudeProvider = !p.provider.toLowerCase().includes('anthropic')
      && !p.provider.toLowerCase().includes('claude')
    if (isNonClaudeProvider) {
      process.env.CLAUDE_CODE_SIMPLE = '1'
      process.env.CLAUDE_CODE_DISABLE_THINKING = '1'
    } else {
      delete process.env.CLAUDE_CODE_SIMPLE
      delete process.env.CLAUDE_CODE_DISABLE_THINKING
    }

    setMainLoopModelOverride(p.model)
    setAppState(prev => ({ ...prev, mainLoopModel: p.model }))

    const masked = '••••' + p.apiKey.slice(-4)
    const esc = (c: string, s: string) => `\x1b[${c}m${s}\x1b[0m`

    const simpleNote = isNonClaudeProvider
      ? `\n${esc('33', '⚡')} ${esc('2', 'Simple mode ON — ~5k tokens/turn instead of ~50k')}`
      : ''

    onDone(
      [
        '',
        esc('36;1', `⚡ BYOK Switched — ${p.name}`),
        esc('2', '─'.repeat(44)),
        `${esc('32', '✓')} Provider: ${esc('1', p.provider)}`,
        `${esc('32', '✓')} Model:    ${esc('1', p.model)}`,
        `${esc('32', '✓')} API Key:  ${esc('2', masked)}`,
        simpleNote,
        `${esc('32', 'Ready!')} Your model is active. Use ${esc('36', '/model')} to confirm.`,
        esc('2', 'Run /byok again to manage profiles'),
      ].join('\n'),
      { display: 'system' },
    )
  }

  // ── Submit: custom URL ─────────────────────────────────────────────
  function handleUrlSubmit(val: string) {
    const t = val.trim()
    if (!t) { setError('Workspace URL cannot be empty'); return }
    if (!t.startsWith('http')) { setError('URL must start with http:// or https://'); return }
    setError(null)
    setCustomUrl(t)
    setStep('apikey')
  }

  // ── Submit: API key ────────────────────────────────────────────────
  function handleKeySubmit(val: string) {
    const t = val.trim()
    if (!t) { setError('API key cannot be empty'); return }
    if (t.length < 10) { setError('That key looks too short — double-check it'); return }
    setError(null)
    setApiKey(t)
    setStep('model')
  }

  // ── Submit: model name ─────────────────────────────────────────────
  function handleModelSubmit(val: string) {
    const t = val.trim()
    if (!t) { setError('Model name cannot be empty'); return }
    setError(null)
    setModel(t)
    runVerify(apiKey, t)
  }

  // ── Verify + apply ─────────────────────────────────────────────────
  function runVerify(key: string, mdl: string) {
    setVerifying(true)
    setStep('verify')
    const effectiveUrl = provider.requiresCustomUrl ? customUrl : provider.baseUrl

    // Wrap with a hard 20s timeout in case AbortSignal.timeout misbehaves in Bun
    const timeoutPromise = new Promise<string>(resolve =>
      setTimeout(() => resolve('Verification timed out after 20s — check your internet'), 20000)
    )

    Promise.race([provider.verify(key, mdl, effectiveUrl), timeoutPromise])
      .then(err => {
        setVerifying(false)
        if (err) {
          setError(err)
          setStep('done_err')
        } else {
          try {
            applyAndSave(key, mdl)
          } catch (saveErr: unknown) {
            setError(saveErr instanceof Error ? saveErr.message : String(saveErr))
            setStep('done_err')
          }
        }
      })
      .catch((e: unknown) => {
        setVerifying(false)
        setError(e instanceof Error ? e.message : String(e))
        setStep('done_err')
      })
  }

  function applyAndSave(key: string, mdl: string) {
    const baseUrl = provider.requiresCustomUrl ? customUrl : provider.baseUrl
    const profileName = `${provider.label} / ${mdl}`

    const newProfile: BYOKProfile = {
      name: profileName,
      baseUrl,
      apiKey: key,
      model: mdl,
      provider: provider.label,
    }

    // Apply to env
    process.env.LLM_BASE_URL = baseUrl
    process.env.LLM_API_KEY = key
    process.env.LLM_MODEL = mdl

    // Auto-enable simple mode for non-Claude providers to reduce token overhead.
    // The full system prompt (~20k tokens) + 20+ tool schemas (~15k tokens) are
    // designed for Claude and waste tokens/money on other models.
    // Simple mode: ~5k tokens total (minimal prompt + 3 core tools).
    const isNonClaudeProvider = !provider.label.toLowerCase().includes('anthropic')
      && !provider.label.toLowerCase().includes('claude')
    if (isNonClaudeProvider) {
      process.env.CLAUDE_CODE_SIMPLE = '1'
      process.env.CLAUDE_CODE_DISABLE_THINKING = '1'
    }

    setMainLoopModelOverride(mdl)
    setAppState(prev => ({ ...prev, mainLoopModel: mdl }))

    // Persist
    saveProfile(newProfile)
    setProfiles(loadProfiles())

    const masked = '••••' + key.slice(-4)
    const esc = (c: string, s: string) => `\x1b[${c}m${s}\x1b[0m`

    const simpleNote = isNonClaudeProvider
      ? `\n${esc('33', '⚡')} ${esc('2', 'Simple mode ON — minimal prompt (~5k tokens/turn instead of ~50k)')}`
      : ''

    onDone(
      [
        '',
        esc('36;1', `⚡ BYOK Connected — ${provider.label}`),
        esc('2', '─'.repeat(44)),
        `${esc('32', '✓')} Provider: ${esc('1', provider.label)}`,
        `${esc('32', '✓')} Model:    ${esc('1', mdl)}`,
        `${esc('32', '✓')} API Key:  ${esc('2', masked)}`,
        simpleNote,
        `${esc('32', 'Saved!')} Profile "${profileName}" saved.`,
        esc('2', 'Run /byok anytime to switch between saved profiles'),
      ].join('\n'),
      { display: 'system' },
    )
  }

  // ── RENDER: home (profile list) ────────────────────────────────────
  if (step === 'home') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">⚡ Bring Your Own Key</Text>
          <Text dimColor>{'─'.repeat(44)}</Text>
        </Box>

        {activeProfile && (
          <Box marginBottom={1}>
            <Text color="green">● Active: </Text>
            <Text bold>{activeProfile.model}</Text>
            <Text dimColor>  ({activeProfile.provider})</Text>
          </Box>
        )}

        {hasProfiles ? (
          <>
            <Text dimColor>Saved profiles — ↑↓ navigate · Enter switch · d delete</Text>
            <Box flexDirection="column" marginTop={1} marginBottom={1}>
              {profiles.map((p, i) => {
                const sel = i === profileIdx
                const isActive = activeProfile?.name === p.name
                return (
                  <Box key={p.name} flexDirection="row">
                    <Text color={sel ? 'cyan' : undefined}>{sel ? '❯ ' : '  '}</Text>
                    <Text bold={sel} color={isActive ? 'green' : undefined}>
                      {p.model}
                    </Text>
                    <Text dimColor>  {p.provider}</Text>
                    {isActive && <Text color="green">  ✓ active</Text>}
                  </Box>
                )
              })}
            </Box>
          </>
        ) : (
          <Box marginBottom={1}>
            <Text dimColor>No saved profiles yet.</Text>
          </Box>
        )}

        <Text dimColor>n = add new provider · q/Esc = cancel</Text>
      </Box>
    )
  }

  // ── RENDER: provider pick ──────────────────────────────────────────
  if (step === 'pick') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">⚡ Add New Provider</Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>

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
              </Box>
            )
          })}
        </Box>

        <Text dimColor>↑↓ navigate · Enter select · Esc back</Text>
      </Box>
    )
  }

  // ── RENDER: custom URL (workspace endpoint) ────────────────────────
  if (step === 'baseurl') {
    const totalSteps = 3
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={provider.color}>
            ⚡ {provider.label} — Endpoint{'  '}
            <Text dimColor>(1/{totalSteps})</Text>
          </Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>

        <Text dimColor>{provider.urlLabel ?? 'Base URL'}:</Text>
        <Text dimColor>  Find it in your workspace dashboard at {provider.keyUrl}</Text>
        <Box marginTop={1} marginBottom={1}>
          <Text color={provider.color}>URL ❯ </Text>
          <TextInput
            value={customUrl}
            onChange={v => { setCustomUrl(v); setError(null) }}
            onSubmit={() => handleUrlSubmit(customUrl)}
            placeholder={provider.urlPlaceholder ?? 'https://'}
            columns={68}
            cursorOffset={customUrlCursor}
            onChangeCursorOffset={setCustomUrlCursor}
            focus
            showCursor
          />
        </Box>

        {error && <Text color="red">⚠  {error}</Text>}
        <Text dimColor>Enter to confirm · Esc to go back</Text>
      </Box>
    )
  }

  // ── RENDER: API key ────────────────────────────────────────────────
  if (step === 'apikey') {
    const totalSteps = provider.requiresCustomUrl ? 3 : 2
    const stepNum   = provider.requiresCustomUrl ? 2 : 1
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={provider.color}>
            ⚡ {provider.label} — API Key{'  '}
            <Text dimColor>({stepNum}/{totalSteps})</Text>
          </Text>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>

        {provider.requiresCustomUrl && customUrl ? (
          <Text dimColor>Endpoint: <Text>{customUrl.slice(0, 60)}{customUrl.length > 60 ? '…' : ''}</Text></Text>
        ) : (
          <Text dimColor>Get your key at: <Text>{provider.keyUrl}</Text></Text>
        )}
        <Box marginTop={1} marginBottom={1}>
          <Text color={provider.color}>Key ❯ </Text>
          <TextInput
            value={apiKey}
            onChange={v => { setApiKey(v); setError(null) }}
            onSubmit={() => handleKeySubmit(apiKey)}
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

  // ── RENDER: model name ─────────────────────────────────────────────
  if (step === 'model') {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={provider.color}>
            ⚡ {provider.label} — Model{'  '}
            <Text dimColor>({provider.requiresCustomUrl ? '3/3' : '2/2'})</Text>
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
            onSubmit={() => handleModelSubmit(model)}
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

  // ── RENDER: verifying ──────────────────────────────────────────────
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

  // ── RENDER: error ──────────────────────────────────────────────────
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
