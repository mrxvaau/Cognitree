<div align="center">

# 🌳 Cognitree

**A model-agnostic AI coding agent CLI with a persistent memory system**

[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](#tech-stack)
[![Bun](https://img.shields.io/badge/Runtime-Bun-f472b6?logo=bun&logoColor=white)](#requirements)
[![Tests](https://img.shields.io/badge/Tests-84%2F84_passing-22c55e?logo=vitest&logoColor=white)](#testing)
[![CI](https://github.com/mrxvaau/Cognitree/actions/workflows/ci.yml/badge.svg)](https://github.com/mrxvaau/Cognitree/actions/workflows/ci.yml)

> Your AI coding agent finally has a memory. Persistent context, structured decisions, and session continuity — across any LLM.

</div>

---

## What Is Cognitree?

Cognitree is a terminal-based AI coding agent that works with **OpenAI-compatible language model APIs**, including hosted providers and local models running through Ollama.

Its defining feature is the **Cognitree Memory System**: a structured, persistent memory engine that survives across sessions, automatically injects relevant context into every prompt, and gives any LLM a working memory of your project — goals, decisions, mistakes, progress, and changed files.

```
┌─────────────────────────────────────────────────────────┐
│  Your Terminal                                           │
│                                                          │
│  > cognitree -p "add dark mode to the settings page"    │
│                                                          │
│  [Cognitree] Task: implement (0.92)                      │
│  [Cognitree] Budget: 8000 chars | Used: 312 chars        │
│                                                          │
│  ✓ Loaded memory: goals, decisions, 3 changed files      │
│  ✓ Injected 312 chars of context into system prompt .     │
└─────────────────────────────────────────────────────────┘
```

---

## Table of Contents

- [Features](#features)
- [The Cognitree Memory System](#-the-cognitree-memory-system)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Provider Paths](#provider-paths-pick-one)
  - [Environment Variables](#environment-variables)
  - [Model Profiles](#model-profiles)
- [Architecture](#architecture)
  - [Core Agent Loop](#core-agent-loop)
  - [Memory System Internals](#memory-system-internals)
  - [Tool System](#tool-system)
  - [Command System](#command-system)
- [Directory Structure](#directory-structure)
- [Running & Launchers](#running--launchers)
- [Testing](#testing)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)

---

## Features

| Feature | Description |
|---------|-------------|
| 🧠 **Persistent Memory** | The Cognitree engine stores goals, decisions, mistakes, progress, and changed files across every session |
| 🔌 **Model Agnostic** | Works with OpenAI-compatible APIs and local model endpoints |
| 🎯 **Smart Injection** | Task classifier detects what you're doing (debug / implement / understand / test) and injects the most relevant memory layers |
| 🏷️ **Checkpoints** | Every session snapshot is versioned with full branch support — roll back, compare, or branch memory state |
| 🛠️ **42+ Agent Tools** | BashTool, FileReadTool, FileEditTool, GrepTool, WebSearchTool, AgentTool, MCPTool, and more |
| 📋 **85+ Slash Commands** | `/compact`, `/commit`, `/review`, `/memory`, `/tasks`, `/vim`, `/config`, `/doctor`, and more |
| 🔑 **BYOK** | Bring your own API key from a supported provider |
| 🪟 **Cross-platform** | Runs on Windows (PowerShell), macOS, and Linux |

---

## 🧠 The Cognitree Memory System

> **The core feature of Cognitree.**

Standard LLMs have no memory between sessions. Every time you start a new conversation, the model has forgotten your project, your goals, what was broken last time, and what decisions you made. Cognitree solves this.

### How It Works

```
Session Start
     │
     ▼
┌────────────────────────────────────────────────────┐
│  sessionLifecycle.ts — onSessionStart()            │
│                                                    │
│  1. Load latest checkpoint from .cognitree/        │
│  2. Classify the user's first prompt               │
│     (debug / implement / understand / test)        │
│  3. Score each memory layer by relevance           │
│  4. Fit layers into budget (default 8000 chars)    │
│  5. Render to Markdown → inject into system prompt │
└───────────────────────────┬────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  Every turn: Events     │
              │                         │
              │  file_changed     →  fileCollector   │
              │  todo_completed   →  todoCollector   │
              │  first_prompt     →  goalCollector   │
              │  mistake detected →  mistakeCollector│
              │  decision made    →  decisionCollector│
              └─────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  Session End            │
              │  onSessionEnd()         │
              │  Write new checkpoint   │
              │  Advance branch tree    │
              └─────────────────────────┘
```

### Memory Layers

Each checkpoint stores these structured JSON layers:

| Layer | Contents | Retention |
|-------|----------|-----------|
| `goal.json` | What the session was trying to achieve | All-time |
| `progress.json` | Completed steps and milestones | Last 5 |
| `decisions.json` | Technical decisions made (deduped) | Last 3 |
| `mistakes.json` | Errors encountered and how they were fixed | Last 5, ≤120 chars each |
| `changed.json` | Files modified during the session | Current session |
| `next.json` | Suggested next steps | Carried forward |
| `warnings.json` | Blockers and open questions | Carried forward |

### Task Classifier

The memory scorer uses task type to weight layers differently:

| Task Type | Triggers | Weighted Layers |
|-----------|----------|-----------------|
| `debug` | "fix", "crash", "error", "broken" | mistakes → decisions → progress |
| `implement` | "add", "build", "create", "implement" | goal → progress → decisions |
| `understand` | "what", "how", "explain", "why" | goal → decisions → codebase |
| `test` | "test", "spec", "coverage", "vitest" | progress → mistakes → changed |
| `unknown` | anything else | goal → progress (low confidence) |

### Budget System

Memory injection respects a configurable character budget so it never bloats the context window:

```json
// .cognitree/config.json (optional override)
{
  "enabled": true,
  "budgetChars": 4000
}
```

Default: `8000` chars. For Qwen models: auto-reduced to `4000` chars.

### Branch Support

Memory is versioned like git. You can fork sessions at any checkpoint:

```bash
# In the CLI:
/memory branch feature-dark-mode

# All subsequent sessions on this branch have isolated memory
# Merge back with:
/memory merge feature-dark-mode
```

---

## Quick Start

### Requirements

- [Bun](https://bun.sh) ≥ 1.1.0
- An API key for any supported LLM provider (or a local Ollama instance)

### Install

```bash
git clone https://github.com/mrxvaau/Cognitree.git
cd Cognitree
bun install
```

### Initialize Cognitree Memory

```bash
# In your project directory — run this once
bun src/entrypoints/cli.tsx --init-cognitree

# Or manually:
mkdir .cognitree
```

### Run

**Option 1 — OpenAI-compatible provider (BYOK)**
```bash
LLM_BASE_URL=https://api.openai.com/v1 \
LLM_API_KEY=sk-... \
LLM_MODEL=gpt-4o \
bun src/entrypoints/cli.tsx
```

**Option 2 — Local Ollama**
```bash
LLM_BASE_URL=http://localhost:11434/v1 \
LLM_MODEL=qwen2.5-coder:7b \
LLM_API_KEY=ollama \
bun src/entrypoints/cli.tsx
```

**Option 3 — Qwen OAuth (free tier, 1000 req/day)**
```bash
QWEN_OAUTH=1 bun src/entrypoints/cli.tsx
```

**Windows — use the included launchers:**
```powershell
# Ollama / local model
.\run-cli.ps1

# Qwen OAuth
.\run-qwen.ps1
```

---

## Configuration

### Provider Paths (pick one)

Cognitree supports multiple connection methods, selected through environment variables:

| Path | Env Vars | Use Case |
|------|----------|----------|
| **Generic BYOK** | `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` | OpenAI-compatible API endpoint |
| **Qwen OAuth** | `QWEN_OAUTH=1` | Qwen device-flow authentication |
| **Local model** | Local API endpoint | Ollama or another compatible local server |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_BASE_URL` | Path A | — | OpenAI-compatible base URL |
| `LLM_API_KEY` | Path A | — | API key for BYOK provider |
| `LLM_MODEL` | Path A | `gpt-4` | Model name (used for profile matching) |
| `QWEN_OAUTH` | Path B | — | Set to `1` to enable Qwen OAuth |
| `DISABLE_TELEMETRY` | no | `false` | Disable all analytics |
| `COGNITREE_DEBUG` | no | — | Set to `1` to log `[Cognitree]` injection lines |

Copy `.env.example` (298 lines of documented variables) to `.env` and fill in what you need.

### Model Profiles

Cognitree auto-detects your model and applies an appropriate behavioral profile. No manual configuration needed:

| Model Pattern | Multi-Agent | Thinking | Force Tools | Max Sub-Agents | Context |
|---------------|:-----------:|:--------:|:-----------:|:--------------:|--------:|
| `gpt-*` | ❌ | ❌ | ❌ | 3 | 128K |
| `gemini-*` | ❌ | ✅ | ❌ | 3 | 1M |
| `qwen-*` | ❌ | ❌ | ✅ | 3 | 128K |
| `deepseek-*` | ❌ | ✅ | ✅ | 3 | 128K |
| `llama-*` | ❌ | ❌ | ✅ | 2 | 128K |
| `mistral-*` | ❌ | ❌ | ❌ | 3 | 128K |
| `*` (default) | ❌ | ❌ | ✅ | 3 | 128K |

You can override any profile by editing `src/utils/model/modelProfile.ts`.

---

## Architecture

### Core Agent Loop

```
User Input
    │
    ▼
main.tsx (REPL / Ink renderer)
    │
    ├── getCognitreeInjection()  ← Memory System: injects context into system prompt
    │
    ▼
query.ts — queryLoop()
    │
    ├── Build system prompt (prompts.ts + Cognitree injection)
    ├── callModel() → SSE stream
    ├── Parse chunks → assistant message + tool_use blocks
    │
    ├── Has tool_use? ──YES──► runTools()
    │                              ├── Permission check
    │                              ├── tool.call()
    │                              │    ├── Emit events to Cognitree eventBus
    │                              │    │   (file_changed, todo_completed)
    │                              │    └── Return ToolResult
    │                              └── Add tool_result to messages → continue loop
    │
    └── No tool_use? ──────────► yield final message → return Terminal
```

### Memory System Internals

```
src/cognitree/
├── core/
│   ├── types.ts          ← Layer<T> schema — every memory layer typed
│   ├── storage.ts        ← read/write JSON layers to .cognitree/checkpoints/
│   ├── checkpoint.ts     ← create / load / list checkpoints
│   └── branch.ts         ← branch tree management (project, merge, list)
│
├── events/
│   ├── eventBus.ts       ← Typed event emitter (file_changed, todo_completed, first_prompt)
│   └── collectors/
│       ├── goalCollector.ts      ← Extracts goal from first user prompt
│       ├── fileCollector.ts      ← Tracks files modified by FileEditTool/FileWriteTool
│       ├── todoCollector.ts      ← Tracks /todo completions
│       ├── mistakeCollector.ts   ← Captures error patterns and fixes
│       └── decisionCollector.ts  ← Captures architectural decisions (deduped)
│
├── injection/
│   ├── taskClassifier.ts ← Classifies prompt → {debug,implement,understand,test,unknown}
│   ├── memoryScorer.ts   ← Scores layers by relevance to task type, fits into budget
│   ├── injector.ts       ← Orchestrates: load → score → render → return markdown
│   └── injectMd.ts       ← Renders layers to Markdown string
│
└── manager/
    ├── memoryManager.ts      ← Session-level memory state (current checkpoint ref)
    └── sessionLifecycle.ts   ← onSessionStart / onSessionEnd — main public API
```

### Tool System

42+ tools. Every tool is a self-contained module:

```typescript
type Tool = {
  name: string
  inputSchema: ZodSchema        // validated before call
  call(args, context, ...)      // execution logic
  prompt(options)               // description shown to model
  checkPermissions(input, ctx)  // per-call permission gate
  isReadOnly(input): boolean    // safe to auto-approve?
  isConcurrencySafe(input): boolean
  maxResultSizeChars: number    // budget cap per result
}
```

| Category | Tools |
|----------|-------|
| **File I/O** | `FileReadTool`, `FileWriteTool`, `FileEditTool`, `NotebookEditTool` |
| **Search** | `GlobTool`, `GrepTool`, `WebSearchTool`, `WebFetchTool` |
| **Execution** | `BashTool`, `PowerShellTool`, `SkillTool` |
| **Agents** | `AgentTool`, `SendMessageTool`, `TeamCreateTool`, `TeamDeleteTool` |
| **Tasks** | `TaskCreateTool`, `TaskGetTool`, `TaskListTool`, `TaskUpdateTool`, `TaskStopTool` |
| **Protocols** | `MCPTool`, `LSPTool` |
| **Mode / State** | `EnterPlanModeTool`, `ExitPlanModeTool`, `EnterWorktreeTool`, `ExitWorktreeTool`, `SleepTool`, `TodoWriteTool` |

### Command System

85+ slash commands, invoked with `/` in the REPL:

| Category | Commands |
|----------|----------|
| **Code** | `/commit`, `/review`, `/diff`, `/compact` |
| **Memory** | `/memory`, `/context`, `/resume` |
| **Config** | `/config`, `/model`, `/theme`, `/vim` |
| **MCP** | `/mcp` |
| **Tasks** | `/tasks`, `/skills` |
| **Auth** | `/login`, `/logout` |
| **Info** | `/doctor`, `/cost`, `/share`, `/help` |

---

## Directory Structure

```
Cognitree/
│
├── src/
│   ├── entrypoints/
│   │   └── cli.tsx              ← Main CLI entry — Bun bootstrap, crash handlers
│   │
│   ├── cognitree/               ← 🧠 Cognitree Memory System
│   │   ├── core/                ← Storage, checkpoint, branch
│   │   ├── events/              ← EventBus + 5 collectors
│   │   ├── injection/           ← Classifier, scorer, injector, renderer
│   │   └── manager/             ← Session lifecycle (onSessionStart/End)
│   │
│   ├── main.tsx                 ← REPL orchestrator (Ink renderer, keybindings)
│   ├── query.ts                 ← Agent loop (while true: stream → tools → continue)
│   ├── QueryEngine.ts           ← Turn lifecycle manager
│   ├── Tool.ts                  ← Tool interface & buildTool factory
│   ├── tools.ts                 ← Tool registry (assembles all 42+ tools)
│   ├── commands.ts              ← Slash command registry
│   │
│   ├── tools/                   ← Tool implementations (~42 tools)
│   ├── commands/                ← Slash command implementations (~85)
│   ├── components/              ← Ink UI components
│   ├── services/
│   │   ├── api/                 ← Multi-path API client (Generic / Qwen)
│   │   ├── mcp/                 ← Model Context Protocol
│   │   ├── compact/             ← Context window compaction
│   │   └── qwen/                ← Qwen OAuth token management
│   ├── constants/
│   │   └── prompts.ts           ← System prompt builder (+ Cognitree injection point)
│   └── utils/
│       └── model/
│           ├── modelProfile.ts  ← Per-model capability profiles
│           ├── providers.ts     ← Provider detection
│           └── model.ts         ← Model name parsing (null-guarded)
│
├── tests/
│   └── cognitree/               ← 84 tests across 16 files
│       ├── unit/                ← storage, checkpoint, branch, all collectors,
│       │                           taskClassifier, memoryScorer, injector, sessionLifecycle
│       ├── integration/         ← fullSession, multiSession, recovery
│       └── live_flow.test.ts    ← 8-step end-to-end session simulation
│
├── .cognitree/                  ← Runtime memory data (gitignored)
├── run-cli.ps1                  ← Windows launcher (Ollama / local)
├── run-qwen.ps1                 ← Windows launcher (Qwen OAuth)
├── .env.example                 ← 298-line documented env reference
├── CODEBASE.md                  ← Deep technical reference
└── MEMORY_REBUILD_PLAN.md       ← Memory system design document
```

---

## Running & Launchers

### PowerShell Launchers (Windows)

**`run-cli.ps1`** — Local Ollama / generic provider:
```powershell
# Edit LLM_BASE_URL and LLM_MODEL at the top of the file, then:
.\run-cli.ps1
```

**`run-qwen.ps1`** — Qwen OAuth free tier:
```powershell
.\run-qwen.ps1
# First run opens browser for device flow auth
# Subsequent runs use cached token
```

Both launchers print stderr to the terminal and capture it to `cli_stderr.log` on exit for debugging.

### Headless / Scripted

```bash
# Single prompt, non-interactive
bun src/entrypoints/cli.tsx -p "write unit tests for src/utils/config.ts"

# With Cognitree debug output
COGNITREE_DEBUG=1 bun src/entrypoints/cli.tsx -p "fix the auth bug"
```

---

## Testing

```bash
# Run all Cognitree tests (84 tests, ~1.3s)
npx vitest run tests/cognitree/ --reporter=verbose

# Run specific test file
npx vitest run tests/cognitree/unit/memoryScorer.test.ts

# Watch mode
npx vitest tests/cognitree/

# Run all tests (includes additional integration tests)
bun test
```

**Test coverage:**

| Suite | Files | Tests | What it covers |
|-------|------:|------:|----------------|
| Unit — storage | 1 | 5 | read/write, dir creation, no-overwrite, null on missing |
| Unit — checkpoint | 1 | 4 | create, load, list, immutability |
| Unit — branch | 1 | 4 | project, merge, list, active tracking |
| Unit — collectors | 5 | 20 | goal, file, todo, mistake, decision (+ dedup case) |
| Unit — taskClassifier | 1 | 7 | debug/implement/understand/test/unknown classification |
| Unit — memoryScorer | 1 | 5 | scoring, budget, greedy fill, partial include |
| Unit — injector | 1 | 4 | null on empty, markdown render, budget respect |
| Unit — sessionLifecycle | 1 | 1 | null return when `.cognitree/` missing |
| Integration — fullSession | 1 | 3 | end-to-end + config budgetChars override |
| Integration — multiSession | 1 | 3 | memory persists across sessions |
| Integration — recovery | 1 | 3 | recovery from corrupt / missing checkpoint |
| Live flow | 1 | 8 | 8-step real session simulation |

CI: Every push to `main`/`master` runs the full suite via GitHub Actions.

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Runtime** | [Bun](https://bun.sh) ≥ 1.1.0 |
| **Language** | TypeScript (strict) |
| **Terminal UI** | [React](https://react.dev) 19 + [Ink](https://github.com/vadimdemedes/ink) |
| **CLI Parsing** | [Commander.js](https://github.com/tj/commander.js) (extra-typings) |
| **Schema Validation** | [Zod](https://zod.dev) v4 |
| **Database** | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) + [Drizzle ORM](https://orm.drizzle.team) |
| **Code Search** | [ripgrep](https://github.com/BurntSushi/ripgrep) (GrepTool) |
| **Protocols** | [MCP SDK](https://modelcontextprotocol.io) · LSP |
| **HTTP** | [undici](https://github.com/nodejs/undici) · [axios](https://axios-http.com) |
| **File Watching** | [chokidar](https://github.com/paulmillr/chokidar) |
| **Image Processing** | [sharp](https://sharp.pixelplumbing.com) |
| **Logging** | [pino](https://getpino.io) + pino-pretty |
| **Auth** | OAuth 2.0 · JWT · macOS Keychain |
| **Analytics** | OpenTelemetry + GrowthBook |
| **Linter** | [Biome](https://biomejs.dev) |
| **Test Runner** | [Vitest](https://vitest.dev) |
| **Bundler** | Bun built-in (`bun scripts/build-bundle.ts`) |

---

## Contributing

Contributions are welcome, especially to:

- **The Cognitree memory system** (`src/cognitree/`) — new collectors, smarter scoring, better injection strategies
- **New model profiles** — add support for new providers in `src/utils/model/modelProfile.ts`
- **Tests** — expand coverage for untested critical paths (see `CODEBASE.md §PM-1`)
- **Documentation** — improve this README or `CODEBASE.md`

### Development Workflow

```bash
# Lint
bun run lint

# Typecheck
bun run typecheck

# Test
npx vitest run tests/cognitree/

# Build
bun run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---
