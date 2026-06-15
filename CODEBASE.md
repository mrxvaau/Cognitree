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

---

## DEEP MAP

> Real line numbers from actual source. Updated 2026-04-25.

### TASK 1 — FUNCTION MAP: CORE FILES

#### `src/query.ts` (1731 lines)

| Line | Name | Type | Params | Returns | What it does |
|------|------|------|--------|---------|--------------|
| 123 | `yieldMissingToolResultBlocks` | generator | `assistantMessages, errorMessage` | `UserMessage[]` | Emits error tool_result blocks for interrupted tool_use requests |
| 175 | `isWithheldMaxOutputTokens` | function | `msg: Message \| StreamEvent` | `boolean` | Guards max_output_tokens error from leaking to SDK callers during recovery |
| 181 | `QueryParams` | type | — | — | Input params: messages, systemPrompt, userContext, canUseTool, fallbackModel, querySource, taskBudget |
| 204 | `State` | type | — | — | Mutable cross-iteration state: messages, toolUseContext, turnCount, transition, autoCompactTracking |
| 219 | `query` | async generator | `params: QueryParams` | `AsyncGenerator<StreamEvent \| Message, Terminal>` | **Main entry** — wraps queryLoop, notifies command lifecycle on completion |
| 241 | `queryLoop` | async generator | `params, consumedCommandUuids` | `AsyncGenerator<StreamEvent \| Message, Terminal>` | **Core agent loop** — while(true): build prompt → call model → run tools → compact → continue |
| 307 | `while (true)` | loop body | — | — | Each iteration: destructure state → skill prefetch → microcompact → autocompact → call model → stream → handle tools → handle stop/continue |

#### `src/QueryEngine.ts` (1298 lines)

| Line | Name | Type | Params | Returns | What it does |
|------|------|------|--------|---------|--------------|
| 1–83 | imports | — | — | — | Pulls query, cost-tracker, analytics, model, fileHistory, permissions, sessionStorage |
| 85–99 | lazy imports | — | — | — | MessageSelector (React/Ink), SDK mappers, scratchpad |
| ~120 | `QueryEngine` class | class | — | — | Turn lifecycle manager: processUserInput → query() → drain → yield SDK messages |

#### `src/Tool.ts` (795 lines)

| Line | Name | Type | What it does |
|------|------|------|--------------|
| 15 | `ToolInputJSONSchema` | type | JSON Schema shape for tool input (type: 'object', properties) |
| 64–73 | progress re-exports | types | Re-exports AgentToolProgress, BashProgress, MCPProgress etc. for compat |
| 90 | `QueryChainTracking` | type | `{ chainId, depth }` — tracks agent chain for analytics |
| 95 | `ValidationResult` | type | Tool execution validation — `{ result: true }` or `{ result: false, message, errorCode }` |
| ~150 | `ToolUseContext` | type | Runtime context passed to tool.call(): messages, options, permissions, abortController, agentId |
| ~300 | `Tool` | interface | Core contract: name, inputSchema, call(), prompt(), checkPermissions(), isReadOnly(), isConcurrencySafe() |
| ~400 | `buildTool` | function | Factory — creates a Tool with safe defaults from a partial spec |
| ~700 | `findToolByName` | function | Lookup by name string → Tool instance (used by query loop) |

#### `src/tools.ts` (373 lines)

| Line | Name | Type | What it does |
|------|------|------|--------------|
| 1–53 | imports + DCE | — | Static imports (BashTool, FileEditTool…) + dead-code-eliminated feature-gated tools (REPL, Sleep, Cron, Monitor) |
| 54–100 | more imports | — | TaskOutputTool, WebSearchTool, TodoWriteTool, GrepTool, TeamCreate/Delete, LSP, MCP, ToolSearch, Config, Task* |
| ~110 | `getTools` | function | Assembles the full `Tools[]` array from all tool classes, filtered by feature gates and environment |
| ~200 | `filterToolsByBaseList` | function | Applies --tools CLI filter to restrict available tools |

#### `src/commands.ts` (~700 lines)

| Line | Name | Type | What it does |
|------|------|------|--------------|
| ~1 | imports | — | Command types, slash-command definitions |
| ~50 | `getCommands` | function | Returns all registered slash commands: /compact, /security-review, /init, /resume, etc. |
| ~100 | `getSlashCommandToolSkills` | function | Returns skill-based commands as pseudo-tools |
| ~200 | `filterCommandsForRemoteMode` | function | Strips commands unavailable in remote/bridge mode |

#### `src/services/api/client.ts` (~255 lines)

| Line | Name | Type | What it does |
|------|------|------|--------------|
| ~1 | imports | — | Anthropic SDK, LLMClient, provider detection, env utils |
| ~37 | `DEFAULT_MODEL` | const | Fallback model: `claude-sonnet-4-20250514` |
| ~50 | `getAnthropicClient` | function | **Multi-path client factory**: Path A (Anthropic SDK), Path B (Generic LLMClient), Path C (Qwen OAuth) |
| ~100 | Path A branch | code | Direct Anthropic SDK — uses ANTHROPIC_API_KEY, handles streaming natively |
| ~150 | Path B branch | code | Generic OpenAI-compatible — creates LLMClient with LLM_BASE_URL + LLM_API_KEY |
| ~200 | Path C branch | code | Qwen OAuth device flow — refreshes access token, creates LLMClient with DashScope endpoint |

#### `src/utils/model/modelProfile.ts` (316 lines)

| Line | Name | Type | What it does |
|------|------|------|--------------|
| 10 | `ModelProfile` | interface | Shape: capabilities (toolCalling, multiAgent, thinking, streaming, maxContextTokens), tokenBudget (maxAgentSpawns, compactOutput), quirks (sanitizeFunctionNames, disableThinking, forceToolUse, toolNameMaxLength) |
| 48 | `CLAUDE_PROFILE` | const | Multi-agent ✅, thinking ✅, 200K ctx, 10 spawns, no quirks |
| 69 | `QWEN_PROFILE` | const | Multi-agent ❌, thinking ❌, 128K ctx, 3 spawns, forceToolUse ✅ |
| 90 | `GPT_PROFILE` | const | Multi-agent ❌, thinking ❌, 128K ctx, 3 spawns |
| 111 | `GEMINI_PROFILE` | const | Multi-agent ❌, thinking ✅, 1M ctx, 3 spawns, sanitizeFunctionNames ✅ |
| 132 | `DEEPSEEK_PROFILE` | const | Multi-agent ❌, thinking ✅, 128K ctx, 3 spawns, forceToolUse ✅ |
| 153 | `LLAMA_PROFILE` | const | Multi-agent ❌, thinking ❌, 128K ctx, 2 spawns, forceToolUse ✅ |
| 174 | `MISTRAL_PROFILE` | const | Multi-agent ❌, thinking ❌, 128K ctx, 3 spawns |
| 196 | `DEFAULT_PROFILE` | const | Safe fallback — multi-agent ❌, thinking ❌, forceToolUse ✅ |
| 223 | `PROFILE_MATCHERS` | const | Ordered `[pattern, profile][]` — first match wins. claude→Claude, qwen→Qwen, gpt-4→GPT, etc. |
| 250 | `matchModelProfile` | function | Case-insensitive substring match → profile. Unknown → DEFAULT |
| 269 | `loadModelProfile` | function | Load + cache from model name or env (`LLM_MODEL` / `ANTHROPIC_MODEL`) |
| 289 | `getActiveProfile` | function | Returns cached profile, or loads from env |
| 298 | `supportsMultiAgent` | function | Shorthand: `getActiveProfile().capabilities.multiAgent` |
| 305 | `getMaxAgentSpawns` | function | Shorthand: `getActiveProfile().tokenBudget.maxAgentSpawns` |
| 312 | `resetProfileCache` | function | Clear cached profile (testing, model switching) |

#### `src/constants/prompts.ts` (988 lines)

| Line | Name | Type | What it does |
|------|------|------|--------------|
| 445 | `getSystemPrompt` | async function | **Main prompt builder** — branches on CLAUDE_CODE_SIMPLE env var |
| 451–525 | Universal BYOK branch | code block | `if (isEnvTruthy(CLAUDE_CODE_SIMPLE))` — builds the model-agnostic prompt with profile-aware sections |
| 457 | `loadModelProfile(model)` | call | Loads profile inside the universal branch |
| 460–471 | profile-aware sections | code | Builds `toolUseRule` (forceToolUse), `agentRule` (multiAgent), `spawnRule` (!multiAgent) from profile |
| 473–523 | universal prompt template | string | Plan→Execute→Verify workflow, tool priority table, code quality rules, token efficiency rules, safety, output format |
| 505–511 | Token Efficiency block | string | MANDATORY rules: no filler, read once, lead with answer, no redundant tools |
| 528–648 | Anthropic prompt path | code | Full prompt for Claude: dynamic sections via `systemPromptSection()` registry — session_guidance, memory, env_info, language, output_style, MCP, scratchpad, FRC, summarize, numeric_length_anchors, token_budget, brief |
| 651 | `getMcpInstructions` | function | Build MCP server instructions section for system prompt |

---

### TASK 2 — DEEP MAP OF `main.tsx`

**`src/main.tsx` — 4717 lines total**

#### Section Map

| Line Range | Section | What lives here |
|------------|---------|-----------------|
| 1–8 | Side-effect comments | Startup ordering documentation |
| 9–21 | Side-effect imports | `profileCheckpoint`, `startMdmRawRead`, `startKeychainPrefetch` — run before heavy imports |
| 22–206 | Static imports | ~185 lines of imports: commander, chalk, React, OAuth, services, tools, utils, bootstrap state, migrations |
| 207–209 | `profileCheckpoint('main_tsx_imports_loaded')` | Marks end of import evaluation |
| 216–229 | `logManagedSettings()` | Analytics: log policy settings keys to Statsig |
| 230–265 | `isBeingDebugged()` | Security: detect Node/Bun inspect mode → exit(1) for external builds |
| 270–290 | `logSessionTelemetry()` | Per-session skill/plugin telemetry |
| 295–310 | `getCertEnvVarTelemetry()` | Detect TLS cert env vars for telemetry |
| 315–360 | `logStartupTelemetry()` | Async: log git status, worktree count, sandbox state |
| 365–400 | `runMigrations()` | 11 sequential migrations: model renames, settings schema, opus defaults |
| 405–440 | `prefetchSystemContextIfSafe()` | Only prefetch git context after trust is established |
| 445–490 | `startDeferredPrefetches()` | **Post-first-render**: initUser, getUserContext, tips, AWS/GCP creds, analytics gates, change detectors |
| 495–530 | `loadSettingsFromFlag()` | Parse `--settings <json-or-path>`, validate, write temp file |
| 535–555 | `loadSettingSourcesFromFlag()` | Parse `--setting-sources` flag |
| 560–580 | `eagerLoadSettings()` | Pre-init settings parsing from argv |
| 585–610 | `initializeEntrypoint()` | Set `CLAUDE_CODE_ENTRYPOINT` env: cli, sdk-cli, mcp, github-action |
| 615–660 | `PendingConnect` / `PendingAssistantChat` / `PendingSSH` | Types + state for early-argv URL/SSH/assistant rewriting |
| 665–1000 | `main()` | **Entrypoint**: security (Windows PATH hijack), warning handler, SIGINT, cc:// URL rewriting, assistant/SSH argv rewriting, client type detection, settings loading, → `run()` |
| 1000–1100 | `getInputPrompt()` | stdin handling: detect TTY, stream-json mode, 3s timeout warning |
| 1100–1200 | `run()` start | Commander setup, sorted help config, profiling |
| 1200–1400 | Commander options | All ~40 CLI flags: `-p`, `--model`, `--permission-mode`, `--mcp-config`, `--system-prompt`, `--resume`, `--worktree`, `--agents`, etc. |
| 1400–2200 | `.action()` handler | **Heart of startup**: bare mode → Kairos check → permission resolution → MCP config parsing → tool permission context → file downloads → system prompt → agent definitions → initial state → resume handling |
| 2200–2600 | Interactive startup | `showSetupScreens()` → trust dialog → remote control → worktree → MCP connections → claudeai MCP → hooks → LSP → session start |
| 2600–3000 | REPL launch | `launchRepl()` with full initial state: messages, tools, commands, MCP clients, model, theme, permissions |
| 3000–3300 | Headless path | `runHeadless()`: print mode (-p) with structured output, task budget, max turns |
| 3300–3600 | SSH remote | SSH session lifecycle: probe → deploy → connect → bidirectional I/O |
| 3600–3800 | Teleport | Remote session: checkout branch → validate repo → resume |
| 3800–4200 | Subcommands | `mcp serve/list/add/remove`, `auth login/logout/status`, `plugin install/uninstall/enable/disable/update`, `doctor`, `update`, `log`, `export`, `task create/list/get/update` |
| 4200–4400 | More subcommands | `completion`, `config`, `agents` |
| 4400–4545 | `run()` tail | `profileReport()`, return program |
| 4546–4642 | `logTenguInit()` | Analytics: comprehensive session start event |
| 4643–4653 | `maybeActivateProactive()` | Enable proactive mode from flag/env |
| 4654–4684 | `maybeActivateBrief()` | Enable brief mode: entitlement check → setUserMsgOptIn |
| 4685–4688 | `resetCursor()` | Restore terminal cursor on exit |
| 4689–4715 | `extractTeammateOptions()` | Parse `--agent-id`, `--agent-name`, `--team-name`, `--teammate-mode` for swarm agents |

---

### TASK 3 — QUERY LOOP STATE MACHINE

```
                         ┌──────────┐
                         │ ENTRY    │  query() L:219
                         │ (yield*) │
                         └────┬─────┘
                              │
                    ┌─────────▼──────────┐
                    │  queryLoop() L:241  │
                    │  init State {}      │
                    └─────────┬──────────┘
                              │
              ┌───────────────▼────────────────┐
              │         while(true) L:307       │
              │                                 │
              │  1. Destructure state           │
              │  2. Skill prefetch              │
              │  3. yield stream_request_start  │
              │  4. Apply tool result budget    │
              │  5. Snip compact (HISTORY_SNIP) │
              │  6. Microcompact                │
              │  7. Context collapse            │
              │  8. Auto-compact                │
              │  9. Build system prompt         │
              │ 10. callModel() → SSE stream    │
              │ 11. Parse chunks → messages     │
              │ 12. yield assistant message      │
              └───────────────┬────────────────┘
                              │
              ┌───────────────▼────────────────┐
              │  Tool dispatch decision         │
              │                                 │
              │  Has tool_use blocks?           │
              │  ├─ YES → runTools()            │
              │  │   ├─ Permission check        │
              │  │   ├─ tool.call()             │
              │  │   ├─ yield tool results      │
              │  │   └─ state = { ...continue } │
              │  │                               │
              │  └─ NO → handleStopHooks()      │
              │       ├─ stop_reason=end_turn    │
              │       ├─ yield final message     │
              │       └─ return Terminal         │
              └────────────────────────────────┘

  Continue transitions (state.transition):
    • tool_use_result   — normal: tools ran, continue loop
    • max_output_tokens — recovery: increment count, extend budget
    • reactive_compact  — context too long: compact + retry
    • prompt_too_long   — emergency: aggressive compact + retry
    • token_budget      — +500k auto-continue
    • command_queue     — slash command injected mid-turn
```

---

### TASK 4 — MODEL PROFILE INTEGRATION MAP

```
  Boot (main.tsx)
    │
    ▼
  getSystemPrompt() ──── prompts.ts:445
    │
    ├── if CLAUDE_CODE_SIMPLE ──→ loadModelProfile(model) ── modelProfile.ts:269
    │       │
    │       ├── profile.quirks.forceToolUse → inject "MUST use tools" rule
    │       ├── profile.capabilities.multiAgent → inject Agent tool row / spawn rule
    │       └── profile.tokenBudget.compactOutput → "Token Efficiency (MANDATORY)" block
    │
    └── else (Anthropic path) → full prompt, no profile needed
    │
    ▼
  AgentTool.call() ──── AgentTool.tsx:~251
    │
    ├── loadModelProfile() ── check multiAgent
    │       ├── false → throw "Model profile disables multi-agent"
    │       └── true  → continue to spawn
    │
    ▼
  client.ts:getAnthropicClient() ──── client.ts:~50
    │
    ├── Path A (Anthropic) → SDK direct, profile not consulted
    ├── Path B (Generic)   → LLMClient, profile.quirks applied:
    │       ├── sanitizeFunctionNames → clean tool names
    │       ├── toolNameMaxLength → truncate names
    │       └── disableThinking → strip thinking params
    └── Path C (Qwen OAuth) → same as Path B + token refresh
```

---

## PATCH MAP

> Audit date: 2026-04-25 — covers test coverage, keybindings, and hooks system.

---

### PM-1 — TEST COVERAGE

| Test File | Tests What Module | Functions/Behaviors Covered | Missing Coverage |
|-----------|-------------------|----------------------------|------------------|
| `tests/integration/api.test.ts` | `src/services/api/client.ts` | Anthropic client instantiation, model override via env, streaming happy path | Path B (Generic LLMClient), Path C (Qwen OAuth), error retry, rate-limit backoff |
| `tests/integration/mcp.test.ts` | `src/services/mcp/` | MCP client↔server roundtrip via in-memory transport, tool listing, tool call | Auth-gated MCP, reconnection, multi-server, timeout |
| `tests/integration/query.test.ts` | `src/query.ts` | `query()` happy path, tool dispatch, assistant message yield | Error recovery, timeout, compaction triggers, max_output_tokens recovery, reactive compact |
| `tests/smoke/commands.test.ts` | `src/commands.ts` | Command registry import, command count assertion, all commands have name+description | Command execution, argument parsing, handler side-effects |
| `tests/smoke/context.test.ts` | `src/utils/` (git/cwd) | `getCwd()`, `getGitStatus()` existence, env-skip in CI | Deep git context, worktree detection, nested repos |
| `tests/smoke/prompt.test.ts` | `src/constants/prompts.ts` | `getSystemPrompt()` returns non-empty string, contains tool names subset | Profile-aware prompt branches, BYOK vs Anthropic, model profile injection |
| `tests/smoke/tools.test.ts` | `src/tools.ts` | `getTools()` returns array, each tool has `name`+`inputSchema`+`call` | Tool execution, permission checks, concurrency safety, result size limits |
| `tests/shims/bun-bundle.test.ts` | `bun:bundle` shim | `feature()` returns boolean, feature flag names resolve | Dead-code elimination, tree-shaking correctness |
| `tests/shims/macro.test.ts` | `bun:macros` shim | Global constant shims (`__PACKAGE_VERSION__`, etc.) | Macro expansion at build time |
| `tests/setup.ts` | (global) | Sets `ANTHROPIC_API_KEY` dummy for module loading, vitest env | — |

#### Top 5 Untested Critical Paths

1. **`src/utils/hooks.ts`** (5024 lines) — Hook execution, shell spawning, JSON output parsing, trust gating. An RCE vector if broken.
2. **`src/services/api/llmClient.ts`** — Generic LLM streaming, SSE chunk parsing, tool call accumulation. Every BYOK user depends on this.
3. **`src/utils/permissions/`** — Permission rule evaluation, sandbox enforcement. Security-critical; no unit tests.
4. **`src/services/compact/`** — Auto-compaction, context window management. Silent data loss if buggy.
5. **`src/main.tsx`** (4717 lines) — REPL orchestrator. Startup sequence, migration, flag parsing. Untestable monolith risk.

#### Modules With NO Test File

| Module | Risk |
|--------|------|
| `src/utils/hooks.ts` | 159KB hook orchestrator — shell exec, JSON validation, trust checks. **Critical RCE surface.** |
| `src/services/api/llmClient.ts` | Generic SSE streaming client for all BYOK providers. Silent failures break every non-Anthropic user. |
| `src/main.tsx` | 4717-line monolith. CLI flag parsing, migrations, startup — regressions are invisible until runtime. |
| `src/utils/model/modelProfile.ts` | Profile matching drives agent behavior. Wrong match → wrong capabilities → broken tool dispatch. |
| `src/constants/prompts.ts` | System prompt builder. Profile-aware branching untested → models get wrong instructions. |
| `src/keybindings/` | Keybinding resolver, chord interceptor. Failures = dead keyboard in TUI. |
| `src/utils/config.ts` | Settings resolution across user/project/policy scopes. Misconfiguration = security bypass. |
| `src/services/compact/` | Compaction engine. Bugs silently destroy conversation history mid-session. |

---

### PM-2 — KEYBINDINGS MAP

Source: `src/keybindings/defaultBindings.ts` (342 lines)

#### Global Context (always active)

| Key | Modifier | Action | Notes |
|-----|----------|--------|-------|
| `c` | `ctrl` | `app:interrupt` | Reserved — double-press exits. Cannot be rebound. |
| `d` | `ctrl` | `app:exit` | Reserved — double-press exits. Cannot be rebound. |
| `l` | `ctrl` | `app:redraw` | Redraws TUI |
| `t` | `ctrl` | `app:toggleTodos` | Todo panel toggle |
| `o` | `ctrl` | `app:toggleTranscript` | Transcript viewer toggle |
| `b` | `ctrl+shift` | `app:toggleBrief` | Feature-gated: `KAIROS`/`KAIROS_BRIEF` |
| `o` | `ctrl+shift` | `app:toggleTeammatePreview` | Teammate preview panel |
| `r` | `ctrl` | `history:search` | Enter history search mode |
| `f` | `ctrl+shift` / `cmd+shift` | `app:globalSearch` | Feature-gated: `QUICK_SEARCH` |
| `p` | `ctrl+shift` / `cmd+shift` | `app:quickOpen` | Feature-gated: `QUICK_SEARCH` |
| `j` | `meta` | `app:toggleTerminal` | Feature-gated: `TERMINAL_PANEL` |

#### Chat Context (prompt input active)

| Key | Modifier | Action | Notes |
|-----|----------|--------|-------|
| `escape` | — | `chat:cancel` | Cancel current operation |
| `k` | `ctrl+x ctrl` | `chat:killAgents` | Chord: kill all sub-agents |
| `tab` | `shift` | `chat:cycleMode` | Windows fallback: `meta+m` if no VT mode |
| `p` | `meta` | `chat:modelPicker` | Open model picker |
| `o` | `meta` | `chat:fastMode` | Toggle fast mode |
| `t` | `meta` | `chat:thinkingToggle` | Toggle thinking |
| `enter` | — | `chat:submit` | Submit prompt |
| `up` / `down` | — | `history:previous/next` | History navigation |
| `_` | `ctrl` / `ctrl+shift+-` | `chat:undo` | Undo (dual binding for terminal compat) |
| `e` | `ctrl+x ctrl` | `chat:externalEditor` | Chord: open $EDITOR |
| `g` | `ctrl` | `chat:externalEditor` | Alt binding for external editor |
| `s` | `ctrl` | `chat:stash` | Stash current input |
| `v` | `alt` (Win) / `ctrl` (other) | `chat:imagePaste` | Platform-specific image paste |
| `up` | `shift` | `chat:messageActions` | Feature-gated: `MESSAGE_ACTIONS` |
| `space` | — | `voice:pushToTalk` | Feature-gated: `VOICE_MODE` |

#### Other Contexts

| Context | Key | Action |
|---------|-----|--------|
| **Autocomplete** | `tab` | `autocomplete:accept` |
| | `escape` | `autocomplete:dismiss` |
| | `up`/`down` | `autocomplete:previous/next` |
| **Settings** | `j`/`k`/`ctrl+n`/`ctrl+p`/`up`/`down` | `select:previous/next` |
| | `space` | `select:accept` (toggle) |
| | `enter` | `settings:close` (save) |
| | `/` | `settings:search` |
| | `r` | `settings:retry` |
| **Confirmation** | `y`/`enter` | `confirm:yes` |
| | `n`/`escape` | `confirm:no` |
| | `shift+tab` | `confirm:cycleMode` |
| | `ctrl+e` | `confirm:toggleExplanation` |
| | `ctrl+d` | `permission:toggleDebug` |
| **Transcript** | `ctrl+e` | `transcript:toggleShowAll` |
| | `q`/`escape`/`ctrl+c` | `transcript:exit` |
| **HistorySearch** | `ctrl+r` | `historySearch:next` |
| | `escape`/`tab` | `historySearch:accept` |
| | `enter` | `historySearch:execute` |
| **Task** | `ctrl+b` | `task:background` |
| **Scroll** | `pageup`/`pagedown` | `scroll:pageUp/pageDown` |
| | `wheelup`/`wheeldown` | `scroll:lineUp/lineDown` |
| | `ctrl+home`/`ctrl+end` | `scroll:top/bottom` |
| | `ctrl+shift+c`/`cmd+c` | `selection:copy` |
| **DiffDialog** | `left`/`right` | `diff:previousSource/nextSource` |
| | `up`/`down` | `diff:previousFile/nextFile` |
| | `enter` | `diff:viewDetails` |
| **Select** | `j`/`k`/`up`/`down`/`ctrl+n`/`ctrl+p` | `select:next/previous` |
| | `enter` | `select:accept` |
| | `escape` | `select:cancel` |
| **Plugin** | `space` | `plugin:toggle` |
| | `i` | `plugin:install` |

#### Platform Notes
- **Windows VT mode**: `shift+tab` requires Bun ≥1.2.23 or Node ≥22.17.0. Falls back to `meta+m`.
- **Image paste**: `alt+v` on Windows (avoids system `ctrl+v`), `ctrl+v` elsewhere.
- **Kitty protocol**: `cmd+shift+f/p` and `cmd+c` only work on kitty-protocol terminals.

---

### PM-3 — HOOKS SYSTEM INVENTORY

Source: `src/utils/hooks.ts` (5024 lines, 159KB) + `src/types/hooks.ts` + `src/entrypoints/sdk/coreTypes.ts`

#### Hook Events (26 total)

| Hook Event | Match Query | Executor Function | Execution Path | Blockable |
|------------|-------------|-------------------|----------------|-----------|
| `PreToolUse` | `tool_name` | `executePreToolHooks()` | REPL (generator) | ✅ exit=2 |
| `PostToolUse` | `tool_name` | `executePostToolHooks()` | REPL (generator) | ✅ |
| `PostToolUseFailure` | `tool_name` | `executePostToolUseFailureHooks()` | REPL (generator) | ✅ |
| `PermissionRequest` | `tool_name` | `executePermissionRequestHooks()` | REPL (generator) | ✅ |
| `PermissionDenied` | `tool_name` | `executePermissionDeniedHooks()` | REPL (generator) | — |
| `UserPromptSubmit` | — | `executeUserPromptSubmitHooks()` | REPL (generator) | ✅ |
| `SessionStart` | `source` | `executeSessionStartHooks()` | REPL (generator) | — |
| `SessionEnd` | `reason` | `executeSessionEndHooks()` | Outside REPL | — |
| `Stop` | — | `executeStopHooks()` | REPL (generator) | ✅ |
| `StopFailure` | `error` | `executeStopFailureHooks()` | Outside REPL | — |
| `SubagentStart` | `agent_type` | `executeSubagentStartHooks()` | REPL (generator) | — |
| `SubagentStop` | `agent_type` | `executeStopHooks()` (subagent) | REPL (generator) | ✅ |
| `PreCompact` | `trigger` | `executePreCompactHooks()` | Outside REPL | — |
| `PostCompact` | `trigger` | `executePostCompactHooks()` | Outside REPL | — |
| `Notification` | `notification_type` | `executeNotificationHooks()` | Outside REPL | — |
| `TeammateIdle` | — | `executeTeammateIdleHooks()` | REPL (generator) | ✅ |
| `TaskCreated` | — | `executeTaskCreatedHooks()` | REPL (generator) | ✅ |
| `TaskCompleted` | — | `executeTaskCompletedHooks()` | REPL (generator) | ✅ |
| `Elicitation` | `mcp_server_name` | `executeElicitationHooks()` | Outside REPL | ✅ |
| `ElicitationResult` | `mcp_server_name` | `executeElicitationResultHooks()` | Outside REPL | ✅ |
| `ConfigChange` | `source` | `executeConfigChangeHooks()` | Outside REPL | ✅* |
| `CwdChanged` | — | `executeCwdChangedHooks()` | Outside REPL | — |
| `FileChanged` | `basename(file_path)` | `executeFileChangedHooks()` | Outside REPL | — |
| `InstructionsLoaded` | `load_reason` | `executeInstructionsLoadedHooks()` | Outside REPL | — |
| `WorktreeCreate` | — | `executeWorktreeCreateHook()` | Outside REPL | — |
| `WorktreeRemove` | — | `executeWorktreeRemoveHook()` | Outside REPL | — |

\* `ConfigChange` with `source=policy_settings` forces `blocked=false` (enterprise policy cannot be blocked).

#### Hook Types (6 types)

| Type | Defined In | Execution | Notes |
|------|-----------|-----------|-------|
| `command` | `settings.json` | `execCommandHook()` — spawns shell process | Default shell: bash. Configurable via `hook.shell`. |
| `prompt` | `settings.json` | `execPromptHook()` — injects into model context | Requires `ToolUseContext`. |
| `agent` | `settings.json` | `execAgentHook()` — spawns sub-agent | Requires `ToolUseContext` + `messages`. |
| `http` | `settings.json` | `execHttpHook()` — HTTP POST with JSON body | Own timeout via `DEFAULT_HTTP_HOOK_TIMEOUT_MS`. |
| `callback` | Code (SDK) | Direct function call | Internal use: sessionFileAccessHooks, attributionHooks. Fastest path. |
| `function` | Session storage | `executeFunctionHook()` — callback with messages | Stop hooks only. Requires messages array. |

#### Registration Mechanisms

| Source | How Registered | Lookup |
|--------|---------------|--------|
| `settings.json` (user/project/policy) | Parsed at boot via `getHooksConfigFromSnapshot()` | `getHooksConfig()` merges snapshot + registered + session |
| Plugins | `loadPluginHooks.ts` → `registerHookCallbacks()` | Stored in `STATE.registeredHooks` (bootstrap/state.ts) |
| SDK callbacks | `registerHookCallbacks()` directly | Same `STATE.registeredHooks` map |
| Session hooks | `getSessionHooks()` / `getSessionFunctionHooks()` | `sessionHooks.ts` — per-session, per-agent-id scoped |

#### Execution Lifecycle

```
1. Guard checks:
   ├── shouldDisableAllHooksIncludingManaged() → skip all
   ├── CLAUDE_CODE_SIMPLE env → skip all
   └── shouldSkipHookDueToTrust() → skip (security: workspace trust)

2. Hook resolution:
   ├── getHooksConfig() → merges settings + registered + session hooks
   ├── matchesPattern(matchQuery, matcher) → glob/regex filter
   ├── Deduplication by type (command/prompt/agent/http via Map)
   ├── `if` condition filter → prepareIfConditionMatcher()
   └── HTTP hooks blocked for SessionStart/Setup events

3. Execution (parallel via AsyncGenerator):
   ├── callback → direct invocation (fast path, no spawn)
   ├── function → callback with messages array
   ├── command → execCommandHook() → spawn shell → parse JSON output
   ├── prompt → execPromptHook() → inject into model context
   ├── agent → execAgentHook() → spawn sub-agent
   └── http → execHttpHook() → HTTP POST → parse JSON response

4. Output processing:
   ├── parseHookOutput() → Zod validation via hookJSONOutputSchema
   ├── processHookJSONOutput() → extract decision, systemMessage, hookSpecificOutput
   ├── Exit code 0 → success
   ├── Exit code 2 → blocking error (tool blocked)
   └── Other non-zero → non-blocking error (logged, not fatal)

5. Result aggregation:
   ├── Permission precedence: deny > ask > allow > passthrough
   ├── Collect: additionalContext, watchPaths, updatedInput, updatedMCPToolOutput
   ├── Analytics: tengu_run_hook / tengu_repl_hook_finished
   └── OTEL tracing: hook_execution_start / hook_execution_complete
```

#### Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `TOOL_HOOK_EXECUTION_TIMEOUT_MS` | 600,000 (10 min) | Default per-hook timeout |
| `SESSION_END_HOOK_TIMEOUT_MS_DEFAULT` | 1,500 (1.5s) | SessionEnd hook timeout (tight for shutdown) |
| `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` | env override | User-configurable SessionEnd timeout |

#### Custom Hook Example (settings.json)

```jsonc
// Log every Bash tool invocation to a file
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"$(date): tool=$HOOK_TOOL_NAME input=$HOOK_INPUT\" >> /tmp/claude-hooks.log"
          }
        ]
      }
    ]
  }
}
```

Hook receives JSON on stdin with fields: `hook_event_name`, `tool_name`, `tool_input`, `session_id`, `cwd`, `transcript_path`.
Exit 0 = allow, exit 2 = block (with stderr as reason), JSON stdout = structured response via `hookJSONOutputSchema`.

#### Security Model

- **All hooks require workspace trust** — `shouldSkipHookDueToTrust()` gates every execution path.
- **Managed-only mode** — `shouldAllowManagedHooksOnly()` restricts to policy settings when `disableAllHooks` is set.
- **Plugin isolation** — plugin hooks run with `CLAUDE_PLUGIN_OPTION_*` env vars; data dir via `getPluginDataDir()`.
- **No eval** — hook output validated through Zod schema (`hookJSONOutputSchema`), never evaluated.
- **Policy override** — `ConfigChange` with `source=policy_settings` cannot be blocked by hooks.
