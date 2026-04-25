# CODEBASE.md — Cognitree CLI (claude-code-generic)

> Last updated: 2026-04-25
> Identity: **Cognitree** — a model-agnostic coding agent CLI
> Version: 1.0.30

---

## 1. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────┐
│                     CLI Entrypoint                       │
│              src/entrypoints/cli.tsx                      │
│       (Bun runtime, React/Ink TUI, crash handlers)       │
└────────────────────────┬────────────────────────────────┘
                         │
                    ┌────▼────┐
                    │ main.tsx │  ← 800KB orchestrator
                    │ (REPL)   │  ← Ink renderer, keybindings, state
                    └────┬────┘
                         │
            ┌────────────▼────────────────┐
            │        query.ts             │
            │  (Agent Loop / Query Engine) │
            │  while(true) {              │
            │    stream ← callModel()     │
            │    tools ← runTools()       │
            │    yield messages           │
            │  }                          │
            └────────────┬────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   ┌──────▼──────┐ ┌────▼────┐  ┌──────▼──────┐
   │ API Client   │ │  Tools  │  │   System    │
   │ (3 paths)    │ │ (42+)   │  │   Prompt    │
   │              │ │         │  │             │
   │ A: Anthropic │ │ Bash    │  │ prompts.ts  │
   │ B: Generic   │ │ Read    │  │ + profiles  │
   │ C: Qwen OAuth│ │ Edit    │  │             │
   └──────────────┘ │ Write   │  └─────────────┘
                    │ Grep    │
                    │ Glob    │
                    │ Agent   │  ← sub-agent spawner
                    │ MCP     │  ← external tool bridge
                    │ ...     │
                    └─────────┘
```

### Request Flow (single turn)

```
User Input
  → REPL (main.tsx) captures prompt
  → query() generator starts (query.ts:219)
  → System prompt built (prompts.ts) — model profile applied
  → Messages prepared (normalize, compact, snip)
  → API call via callModel() (streaming SSE)
  → Stream yields assistant message + tool_use blocks
  → Tool orchestration: runTools() dispatches to Tool.call()
  → Tool results become user messages (tool_result blocks)
  → Loop: if tool_use blocks exist → continue; else → yield final + return
```

---

## 2. FILE MAP (Key Files Only)

### Entrypoints
| File | Purpose |
|------|---------|
| `src/entrypoints/cli.tsx` | Main CLI entry — Bun bootstrap, crash handlers, TTY polyfill |
| `src/entrypoints/mcp.ts` | MCP server entry — Model Context Protocol mode |
| `src/entrypoints/init.ts` | Project initialization (`/init` command) |
| `src/entrypoints/sdk/` | SDK entry for programmatic use |

### Core Engine
| File | LOC | Purpose |
|------|-----|---------|
| `src/main.tsx` | ~18K | REPL orchestrator — Ink renderer, keybindings, state management |
| `src/query.ts` | ~1.7K | **Agent loop** — the core while(true) that streams, dispatches tools, handles compaction |
| `src/QueryEngine.ts` | ~1.2K | Query engine wrapper — manages turn lifecycle |
| `src/Tool.ts` | ~800 | Tool interface — every tool implements this contract |
| `src/tools.ts` | ~370 | Tool registry — assembles the full tool list |
| `src/commands.ts` | ~700 | Slash command registry — `/security-review`, `/compact`, etc. |

### API Layer
| File | Purpose |
|------|---------|
| `src/services/api/client.ts` | **Multi-path client factory** — Path A (Anthropic SDK), Path B (Generic/OpenAI), Path C (Qwen OAuth) |
| `src/services/api/llmClient.ts` | Generic OpenAI-compatible LLM client — SSE streaming, tool call parsing |
| `src/utils/model/providers.ts` | Provider detection — `isGenericLLM()`, `isQwenOAuth()` |
| `src/utils/model/modelProfile.ts` | **Model profile system** — auto-adapt agent per model capabilities |

### Prompt System
| File | Purpose |
|------|---------|
| `src/constants/prompts.ts` | System prompt builder — universal (BYOK) + Anthropic modes |
| `src/constants/tools.ts` | Tool access control — `ALL_AGENT_DISALLOWED_TOOLS`, coordinator tools |
| `src/utils/systemPrompt.ts` | System prompt composition utilities |

### Tools (42+ tools in `src/tools/`)
| Tool | Directory | Purpose |
|------|-----------|---------|
| `BashTool` | `src/tools/BashTool/` | Shell command execution, cwd tracking |
| `FileReadTool` | `src/tools/FileReadTool/` | Read file contents with range support |
| `FileEditTool` | `src/tools/FileEditTool/` | Precise file editing (search/replace) |
| `FileWriteTool` | `src/tools/FileWriteTool/` | Create new files |
| `GlobTool` | `src/tools/GlobTool/` | File pattern matching |
| `GrepTool` | `src/tools/GrepTool/` | Content search (ripgrep) |
| `AgentTool` | `src/tools/AgentTool/` | Sub-agent spawning (model-profile guarded) |
| `WebFetchTool` | `src/tools/WebFetchTool/` | HTTP requests |
| `WebSearchTool` | `src/tools/WebSearchTool/` | Web search |
| `MCPTool` | `src/tools/MCPTool/` | Model Context Protocol bridge |
| `SkillTool` | `src/tools/SkillTool/` | Skill file execution |
| `TodoWriteTool` | `src/tools/TodoWriteTool/` | Todo/checklist management |
| `NotebookEditTool` | `src/tools/NotebookEditTool/` | Jupyter notebook editing |
| `TaskCreate/Get/List/Update/Stop` | `src/tools/Task*Tool/` | Background task management |
| `PowerShellTool` | `src/tools/PowerShellTool/` | Windows PowerShell execution |

### State & Config
| File | Purpose |
|------|---------|
| `src/state/AppState.ts` | Global application state type |
| `src/utils/config.ts` | Settings resolution (user/project/env) |
| `src/utils/auth.ts` | Authentication — OAuth, API key, keychain |
| `src/utils/theme.ts` | Theme system — emerald green Cognitree palette |
| `src/utils/sessionStorage.ts` | Session persistence — conversation history |

### Services
| Directory | Purpose |
|-----------|---------|
| `src/services/api/` | API clients, retry logic, error handling, prompt cache |
| `src/services/compact/` | Auto-compaction — context window management |
| `src/services/mcp/` | MCP server/client management |
| `src/services/analytics/` | Telemetry (GrowthBook, events) |
| `src/services/qwen/` | Qwen OAuth token management |

### UI Components
| Directory | Purpose |
|-----------|---------|
| `src/components/LogoV2/` | Welcome screen — Cognitree TUI with ASCII tree logo |
| `src/components/Spinner.js` | Activity spinner |
| `src/screens/` | Full-screen modes (transcript, diff viewer) |

---

## 3. DATA FLOW

### Message Types
```typescript
type Message =
  | UserMessage        // user text + tool_result blocks
  | AssistantMessage   // model response + tool_use blocks
  | SystemMessage      // injected context (CLAUDE.md, memory)
  | AttachmentMessage  // file/image attachments
  | ProgressMessage    // tool progress updates (streaming)
```

### State Management
- **Conversation state:** `messages: Message[]` array in memory, passed per turn via `ToolUseContext`
- **Session config:** `AppState` object — permissions, theme, MCP connections, effort level
- **Tool state:** each tool manages its own state (BashTool tracks cwd, FileReadTool has LRU cache)
- **Model profile:** `ModelProfile` cached at startup via `loadModelProfile()` — immutable for session

### API Flow
```
query.ts → callModel() → claude.ts → getAnthropicClient()
                                          │
                                ┌─────────┼──────────┐
                                │         │          │
                          Path A      Path B     Path C
                         Anthropic   LLMClient   Qwen OAuth
                          SDK         (generic)   (token refresh)
                                │         │          │
                                └─────────┼──────────┘
                                          │
                                    SSE Stream
                                          │
                                    Parse chunks
                                          │
                              yield StreamEvent / Message
```

---

## 4. TOOL SYSTEM

### Tool Lifecycle
```
1. Model outputs tool_use block → { id, name, input }
2. query.ts finds tool by name → findToolByName()
3. Permission check → tool.checkPermissions()
4. Execution → tool.call(input, context, canUseTool, ...)
5. Result → ToolResult<T> { data, newMessages? }
6. Result wrapped → tool_result block added to messages
7. Loop continues with new messages
```

### Tool Interface (src/Tool.ts)
```typescript
type Tool = {
  name: string
  inputSchema: ZodSchema             // validated input
  call(args, context, ...)           // execution
  prompt(options)                     // description for model
  checkPermissions(input, context)    // permission gate
  isReadOnly(input): boolean          // safe to auto-approve?
  isConcurrencySafe(input): boolean   // can run in parallel?
  maxResultSizeChars: number          // budget cap
}
```

### Tool Access Control (src/constants/tools.ts)
- `ALL_AGENT_DISALLOWED_TOOLS` — tools blocked in sub-agents (AgentTool itself, TaskOutput, PlanMode)
- `ASYNC_AGENT_ALLOWED_TOOLS` — whitelist for background agents
- `COORDINATOR_MODE_ALLOWED_TOOLS` — minimal set for coordinator
- **Model profile guard** — `AgentTool.call()` blocks spawning if `profile.capabilities.multiAgent === false`

---

## 5. CONFIGURATION

### Environment Variables (key ones)

| Variable | Required | Default | Effect |
|----------|----------|---------|--------|
| `ANTHROPIC_API_KEY` | Path A | — | Anthropic direct API auth |
| `LLM_BASE_URL` | Path B | — | Generic OpenAI-compatible endpoint |
| `LLM_API_KEY` | Path B | — | API key for generic provider |
| `LLM_MODEL` | Path B | `gpt-4` | Model name (triggers profile matching) |
| `QWEN_OAUTH` | Path C | — | Enable Qwen OAuth device flow |
| `CLAUDE_CODE_SIMPLE` | no | `false` | Enable universal BYOK mode (simplified prompt) |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-20250514` | Override model for Path A |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | no | — | Max response tokens |
| `CLAUDE_CODE_IDLE_THRESHOLD_MINUTES` | no | `75` | Session idle timeout |
| `CLAUDE_CODE_COORDINATOR_MODE` | no | `false` | Multi-agent coordinator |
| `CLAUDE_CODE_DEBUG_LOG_LEVEL` | no | `info` | Debug verbosity |
| `DISABLE_TELEMETRY` | no | `false` | Kill analytics |

### Config Files
| File | Purpose |
|------|---------|
| `package.json` | npm metadata, scripts (`build`, `test`, `typecheck`) |
| `tsconfig.json` | TypeScript — `ESNext` target, `bundler` resolution, `react-jsx` |
| `biome.json` | Linter/formatter config |
| `vitest.config.ts` | Test runner config |
| `bunfig.toml` | Bun runtime config |
| `.env.example` | 298-line env var documentation |
| `drizzle.config.ts` | Database migration config (SQLite via better-sqlite3) |

### Model Profiles (src/utils/model/modelProfile.ts)

Built-in profiles, auto-matched by model name substring:

| Model | Multi-Agent | Thinking | Force Tools | Compact Output | Max Spawns |
|-------|-------------|----------|-------------|----------------|------------|
| `claude-*` | ✅ | ✅ | ❌ | ❌ | 10 |
| `qwen-*` | ❌ | ❌ | ✅ | ✅ | 3 |
| `gpt-*` | ❌ | ❌ | ❌ | ✅ | 3 |
| `gemini-*` | ❌ | ✅ | ❌ | ✅ | 3 |
| `deepseek-*` | ❌ | ✅ | ✅ | ✅ | 3 |
| `llama-*` | ❌ | ❌ | ✅ | ✅ | 2 |
| `mistral-*` | ❌ | ❌ | ❌ | ✅ | 3 |
| `*` (default) | ❌ | ❌ | ✅ | ✅ | 3 |

---

## 6. DEPENDENCIES

### Runtime (key packages)
| Package | Version | Used For |
|---------|---------|----------|
| `@anthropic-ai/sdk` | 0.39.0 | Anthropic API client (Path A) |
| `react` / `react-reconciler` | ^19.0.0 | Ink TUI rendering |
| `chalk` | ^5.4.0 | Terminal color output |
| `@modelcontextprotocol/sdk` | ^1.12.1 | MCP server/client protocol |
| `@commander-js/extra-typings` | ^13.1.0 | CLI argument parsing |
| `better-sqlite3` | ^12.8.0 | Local database (sessions, settings) |
| `drizzle-orm` | ^0.45.2 | Database ORM |
| `fuse.js` | ^7.0.0 | Fuzzy search (tool search, skills) |
| `sharp` | ^0.34.5 | Image processing |
| `axios` | ^1.7.0 | HTTP client (non-streaming) |
| `chokidar` | ^4.0.0 | File system watching |
| `node-pty` | ^1.1.0 | PTY for terminal tools |
| `marked` | ^15.0.0 | Markdown parsing |
| `semver` | ^7.6.0 | Version comparison |
| `pino` / `pino-pretty` | ^9.5.0 | Structured logging |

### Dev
| Package | Used For |
|---------|----------|
| `vitest` | Unit/integration tests |
| `bun` | Runtime + bundler (`bun scripts/build-bundle.ts`) |
| `biome` | Linter + formatter |
| `drizzle-kit` | Database migrations |
| `typescript` | Type checking (noEmit) |

### Build System
- **Runtime:** Bun (not Node.js)
- **Bundler:** `bun scripts/build-bundle.ts` → `dist/cli.mjs`
- **Feature flags:** `bun:bundle` `feature()` macro for tree-shaking
- **No transpilation step** — Bun runs TypeScript directly via `cli.tsx`

---

## 7. QUIRKS & GOTCHAS

### Critical
- **`main.tsx` is 800KB** — monolithic orchestrator. It contains the REPL, state management, keybindings, and rendering. Do NOT try to refactor it without a solid plan.
- **`feature()` from `bun:bundle`** — compile-time tree-shaking macro. Only works in `if`/ternary conditions. Cannot be called dynamically. Dead code behind `feature('X')` is stripped from production builds.
- **System prompt is rebuilt every turn** — `getSystemPromptForModel()` in `prompts.ts` is called fresh per query iteration. Don't cache it externally.
- **Bun TTY polyfill** — Bun on Windows doesn't set `process.stdout.isTTY`. The CLI patches this at boot (`cli.tsx:28`).

### API & Streaming
- **Path B/C create a new `LLMClient` per request** — inside the `withResponse()` closure. This is intentional (handles mid-session token refresh for Qwen).
- **Tool names are Anthropic format** — `input_schema` (not `parameters`). Path B/C shims convert to OpenAI's `function.parameters` format.
- **Streaming tool calls** use `index`-based accumulation across chunks. The tool name and arguments arrive incrementally.

### Tools
- **BashTool tracks cwd** — changing directories persists across commands. Resetting it mid-session breaks relative paths.
- **AgentTool recursion guard** — sub-agents cannot spawn further sub-agents (`AGENT_TOOL_NAME` in `ALL_AGENT_DISALLOWED_TOOLS`). Model profile adds a second guard blocking agent spawning entirely for non-Claude models.
- **Tool results have a size budget** — `maxResultSizeChars` per tool. Exceeded results are persisted to disk and replaced with a preview + file path.
- **MCP tools** are dynamically discovered and registered at runtime via `src/services/mcp/`.

### State
- **`AppState` is immutable-update** — `setAppState(prev => ({ ...prev, ... }))` pattern. Never mutate directly.
- **Session storage is file-based** — conversations persisted to `~/.claude/sessions/` as JSON.
- **Model profile is cached for the session** — call `loadModelProfile()` once. Subsequent calls to `getActiveProfile()` return cached. Call `resetProfileCache()` to force reload.

### Build
- **`bun:bundle` feature flags** — `WORKFLOW_SCRIPTS`, `PROACTIVE`, `KAIROS`, `AGENT_TRIGGERS`, `MONITOR_TOOL`, `REACTIVE_COMPACT`, `HISTORY_SNIP`, `CONTEXT_COLLAPSE`, `CACHED_MICROCOMPACT`, `TOKEN_BUDGET`, `BG_SESSIONS`, `EXPERIMENTAL_SKILL_SEARCH`, `TEMPLATES`. These gate entire code paths.
- **Dynamic `require()` for feature-gated modules** — `const X = feature('Y') ? require('./X.js').X : null`. This is intentional for tree-shaking.

---

## 8. HOW TO MAKE COMMON CHANGES

### Add a new tool
1. Create `src/tools/MyTool/MyTool.ts` — use `buildTool({ name, inputSchema, call, prompt, ... })`
2. Import and add to the tool array in `src/tools.ts`
3. Done — the query loop auto-discovers it via `toolUseContext.options.tools`

### Change the system prompt
1. Edit `src/constants/prompts.ts` → find the `CLAUDE_CODE_SIMPLE` block
2. Profile-aware sections are built from `loadModelProfile(model)` — modify the template strings
3. For Anthropic-specific prompts, edit the non-simple block below

### Add a new slash command
1. Create `src/commands/my-command/` directory (or `my-command.ts` file)
2. Export default command config with `name`, `description`, `handler`
3. Register in `src/commands.ts`

### Change the model profile for a provider
1. Edit `src/utils/model/modelProfile.ts`
2. Add/modify the `*_PROFILE` constant
3. Add pattern to `PROFILE_MATCHERS` array (order matters — first match wins)

### Add a new API provider path
1. Edit `src/services/api/client.ts` — add a new path in `getAnthropicClient()`
2. Add detection logic in `src/utils/model/providers.ts`
3. Create the provider-specific client or extend `LLMClient`

### Change default model
1. Set `LLM_MODEL` env var (Path B/C)
2. Or set `ANTHROPIC_MODEL` env var (Path A)
3. Or modify the fallback in `client.ts:37`

### Add a pre/post tool hook
1. `src/utils/hooks.ts` — massive hook system (159KB). Find the relevant hook type
2. Or use `PreToolUse` / `PostToolUse` hooks in `.claude/settings.json`

### Change the theme/colors
1. Edit `src/utils/theme.ts` — all colors defined as hex values
2. Primary color: `#10b981` (emerald green)

---

## 9. TEST STRUCTURE

| Directory | Contents |
|-----------|----------|
| `tests/integration/` | Integration tests |
| `tests/smoke/` | Smoke tests |
| `tests/setup.ts` | Test environment setup |
| `vitest.config.ts` | Vitest configuration |

**Run tests:**
```bash
bun test          # or: npm test
bun run typecheck # TypeScript checks
bun run lint      # Biome lint
bun run check     # lint + typecheck
```

---

## 10. KNOWN PATTERNS & CONVENTIONS

### Import Style
- `bun:bundle` feature flag requires `import { feature } from 'bun:bundle'` at top of file
- Conditional requires: `const X = feature('Y') ? require('./X.js').X : null`
- Path aliases: `src/` prefix works (e.g., `import { ... } from 'src/utils/...'`)
- `.js` extensions in imports (ESM convention)

### Error Handling
- API errors → `LLMConnectionError`, `LLMRateLimitError`, `LLMAuthenticationError`
- Tool errors → thrown in `call()`, caught by query loop, returned as `is_error: true` tool_result
- Unhandled rejections → caught at `cli.tsx:8`, logged to stderr, swallowed

### Naming
- Tools: `PascalCase` class/file, `snake_case` tool name (e.g., `BashTool` → `Bash`)
- Commands: `kebab-case` (e.g., `security-review`)
- Files: `camelCase.ts` for utils, `PascalCase.tsx` for React components

---

## 11. ARCHITECTURAL DECISIONS

| Decision | Rationale |
|----------|-----------|
| Bun instead of Node.js | 3-5x faster startup, native TypeScript, built-in bundler |
| React/Ink for TUI | Declarative UI, component reuse, familiar ecosystem |
| Anthropic SDK as base | Started as Claude Code fork; shim layer wraps other providers |
| Model profiles (not runtime detection) | Static profiles are predictable, no wasted tokens on capability probing |
| Single-pass commands for BYOK | Non-Claude models loop infinitely with multi-agent patterns |
| `feature()` tree-shaking | Keeps production bundle small by eliminating unused code paths |
| File-based session storage | No external DB dependency, works offline, portable |
| Universal BYOK prompt as default | Same brain for every model — consistent behavior regardless of provider |

---

## 12. SECURITY NOTES

- **Permission system:** Tools require explicit user approval for destructive operations (file writes, bash commands)
- **Sandbox:** BashTool runs in a sandboxed shell — `$()` substitution is blocked in certain contexts
- **API key storage:** Uses system keychain when available, falls back to file
- **No eval():** Tool inputs are validated via Zod schemas, never eval'd
- **MCP authentication:** OAuth-based MCP server connections with approval flow
- **Sub-agent isolation:** Sub-agents get a filtered tool set (no Agent tool, no TaskOutput)
