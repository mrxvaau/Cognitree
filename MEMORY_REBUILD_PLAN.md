# COGNITREE MEMORY SYSTEM — COMPLETE REBUILD PLAN
# Goal: Perfect persistent memory, fully tested before any LLM connection
# Approach: Build → Unit Test → Integration Test (mock LLM) → Connect LLM
# Run from: D:\Project\REFECTOR\CC

---

## WHAT WE ARE BUILDING

A memory system that:
1. Captures events in real-time (zero manual work)
2. Stores structured JSON per session (never overwrites)
3. Injects only relevant memory into prompts (300 token cap)
4. Works perfectly without any LLM (pure logic, fully testable)
5. Connects to LLM only after all tests pass

---

## ARCHITECTURE (clean, no legacy)

```
src/cognitree/
  core/
    types.ts          ← all types, no logic
    storage.ts        ← read/write .cognitree/ JSON files
    checkpoint.ts     ← create/load/list checkpoints
    branch.ts         ← branch tree management
  
  events/
    eventBus.ts       ← central event emitter (no LLM dependency)
    collectors/
      goalCollector.ts     ← extracts goal from first user message
      fileCollector.ts     ← watches FileEdit/FileWrite tool calls
      todoCollector.ts     ← watches TodoWrite completions
      mistakeCollector.ts  ← watches StuckDetector signals
      decisionCollector.ts ← pattern-matches decision phrases
  
  injection/
    taskClassifier.ts ← classify user prompt → 9 categories
    memoryScorer.ts   ← score layers by relevance
    injector.ts       ← build final inject string (300 token cap)
    injectMd.ts       ← write/read inject.md to disk
  
  manager/
    memoryManager.ts  ← orchestrates everything, public API
    sessionLifecycle.ts ← onSessionStart, onTurn, onSessionEnd
  
  index.ts            ← single export point

tests/cognitree/
  unit/
    storage.test.ts
    checkpoint.test.ts
    branch.test.ts
    goalCollector.test.ts
    fileCollector.test.ts
    taskClassifier.test.ts
    memoryScorer.test.ts
    injector.test.ts
  
  integration/
    fullSession.test.ts    ← mock LLM, full session lifecycle
    multiSession.test.ts   ← cross-session memory persistence
    recovery.test.ts       ← mistake injection on next session
```

---

## PHASE 1 — CORE STORAGE (no events, no injection, no LLM)

### What Opus builds:
- `types.ts` — all TypeScript types
- `storage.ts` — read/write JSON
- `checkpoint.ts` — create/load/list
- `branch.ts` — branch management

### Exact JSON format (NEVER deviate from this):
```typescript
// Every layer uses this shape
type Layer<T> = {
  delta: boolean   // false = full value, true = append to array
  value: T | null
}

// goal.json
type GoalLayer = Layer<string>
// { "delta": false, "value": "Fix the MCP connection" }

// progress.json
type ProgressLayer = Layer<string[]>
// { "delta": true, "value": ["Fixed auth", "Updated config"] }

// decisions.json
type DecisionsLayer = Layer<string[]>
// { "delta": true, "value": ["Use TypeScript over JS because..."] }

// mistakes.json
type MistakesLayer = Layer<Mistake[]>
// { "delta": true, "value": [{ pattern, evidence, hint, timestamp }] }

// changed.json
type ChangedLayer = Layer<string[]>
// { "delta": true, "value": ["src/query.ts", "src/cognitree/inject.ts"] }

// next.json
type NextLayer = Layer<string[]>
// { "delta": true, "value": ["Fix encoding issue", "Test memory"] }

// warnings.json
type WarningsLayer = Layer<string[]>
// { "delta": true, "value": ["inject.md must be UTF-8"] }

// meta.json
type MetaMeta = {
  checkpoint_id: string   // "cp_001"
  branch: string          // "main"
  created_at: string      // ISO timestamp
  session_model: string   // "qwen3-coder-plus"
  turn_count: number
  confidence: number      // 0.0-1.0
}
```

### Unit tests for Phase 1:
```typescript
// tests/cognitree/unit/storage.test.ts
describe('storage', () => {
  it('writes and reads a layer correctly')
  it('creates checkpoint directory if missing')
  it('never overwrites existing checkpoint')
  it('throws if writing to wrong JSON format')
  it('reads null if layer file missing')
})

// tests/cognitree/unit/checkpoint.test.ts
describe('checkpoint', () => {
  it('creates cp_001 for new project')
  it('creates cp_002 after cp_001 exists')
  it('loads checkpoint by id')
  it('lists all checkpoints in order')
  it('creates branch checkpoint correctly')
  it('meta.json written with correct shape')
})
```

### Expected test results Phase 1:
```
PASS tests/cognitree/unit/storage.test.ts (5 tests)
PASS tests/cognitree/unit/checkpoint.test.ts (6 tests)
PASS tests/cognitree/unit/branch.test.ts (4 tests)
Total: 15 tests, 0 failed
```

---

## PHASE 2 — EVENT COLLECTORS (no LLM, pure logic)

### What Opus builds:
- `eventBus.ts` — typed event emitter
- All 5 collectors

### EventBus contract:
```typescript
type CognitreeEvent =
  | { type: 'first_prompt'; content: string }
  | { type: 'file_changed'; path: string; tool: 'Write' | 'Edit' | 'MultiEdit' }
  | { type: 'todo_completed'; text: string }
  | { type: 'stuck_detected'; pattern: StuckPattern; evidence: string; hint: string }
  | { type: 'decision_made'; text: string }
  | { type: 'session_end'; turn_count: number }

// Usage:
cognitreeEventBus.emit({ type: 'first_prompt', content: 'fix the MCP server' })
cognitreeEventBus.on('file_changed', (event) => { ... })
```

### Collector logic (no LLM):
```typescript
// goalCollector.ts
// Input: first_prompt event
// Logic: use first 200 chars of user message as goal
// Output: writes goal.json → { delta: false, value: "fix the MCP server" }
// NO LLM CALL — pure string extraction

// fileCollector.ts  
// Input: file_changed event from tool calls
// Logic: append file path to changed[] if not already there
// Output: writes changed.json → { delta: true, value: ["src/query.ts"] }

// todoCollector.ts
// Input: todo_completed event
// Logic: append todo text to progress[]
// Output: writes progress.json → { delta: true, value: ["Fixed auth"] }

// mistakeCollector.ts
// Input: stuck_detected event (from stuckDetector.ts — already built)
// Logic: append structured mistake to mistakes[]
// Output: writes mistakes.json

// decisionCollector.ts
// Input: assistant message text
// Logic: regex match for decision phrases:
//   "I decided", "I chose", "I will use", "better to use", "instead of"
// Output: appends to decisions[] if confidence > 0.7
// NO LLM CALL — pure pattern matching
```

### Unit tests for Phase 2:
```typescript
// tests/cognitree/unit/goalCollector.test.ts
describe('goalCollector', () => {
  it('extracts goal from short prompt')
  it('truncates goal from long prompt at 200 chars')
  it('writes correct JSON format to goal.json')
  it('only captures FIRST prompt, ignores subsequent')
  it('handles empty prompt gracefully')
})

// tests/cognitree/unit/fileCollector.test.ts
describe('fileCollector', () => {
  it('appends new file to changed[]')
  it('does NOT duplicate existing file in changed[]')
  it('ignores node_modules paths')
  it('ignores dist/ paths')
  it('handles both Write and Edit tool names')
})

// tests/cognitree/unit/taskClassifier.test.ts
describe('taskClassifier', () => {
  it('classifies "fix the bug" as debug')
  it('classifies "add a new feature" as implement')
  it('classifies "what does this do" as understand')
  it('classifies "run the tests" as test')
  it('classifies "hello" as unknown with low confidence')
  it('returns correct relevantLayers per category')
  it('never throws on empty string')
})
```

### Expected test results Phase 2:
```
PASS tests/cognitree/unit/goalCollector.test.ts (5 tests)
PASS tests/cognitree/unit/fileCollector.test.ts (5 tests)
PASS tests/cognitree/unit/todoCollector.test.ts (4 tests)
PASS tests/cognitree/unit/mistakeCollector.test.ts (4 tests)
PASS tests/cognitree/unit/decisionCollector.test.ts (5 tests)
PASS tests/cognitree/unit/taskClassifier.test.ts (7 tests)
Total: 30 tests, 0 failed
```

---

## PHASE 3 — INJECTION ENGINE (no LLM)

### What Opus builds:
- `memoryScorer.ts` — score layers by relevance
- `injector.ts` — build inject string within budget
- `injectMd.ts` — write/read inject.md

### Injector contract:
```typescript
// Input: checkpoint data + task signal + budget
// Output: final string to prepend to system prompt
// HARD RULE: output.length <= budgetChars ALWAYS

function buildInjectString(
  checkpoint: CheckpointData,
  signal: TaskSignal,
  budgetChars: number = 8000
): string

// Output format:
// [COGNITREE — cp_002 · main · confidence 0.94]
// GOAL: Fix the MCP connection
// DECISIONS: Use node dist/src/index.js not dist/index.js
// MISTAKES TO AVOID: Wrong JSON format: use {"delta":false,"value":"..."} not {"text":"..."}
// NEXT: Test memory injection after restart
// ---
// skipped: progress, changed, warnings (not relevant to debug task)
```

### Unit tests for Phase 3:
```typescript
// tests/cognitree/unit/injector.test.ts
describe('injector', () => {
  it('output never exceeds budgetChars')
  it('includes goal when available')
  it('skips empty layers')
  it('lists skipped layers at bottom')
  it('debug task includes mistakes + warnings + changed')
  it('implement task includes goal + decisions + next')
  it('unknown task includes only goal + progress (minimal)')
  it('truncates individual layer content to fit budget')
  it('header line always included regardless of budget')
  it('returns empty string when no .cognitree/ exists')
})

// tests/cognitree/unit/memoryScorer.test.ts
describe('memoryScorer', () => {
  it('scores relevant layers higher than irrelevant')
  it('scores empty layers as 0')
  it('fills budget greedily by score')
  it('partial include when layer doesnt fully fit')
  it('never exceeds budget')
})
```

### Expected test results Phase 3:
```
PASS tests/cognitree/unit/injector.test.ts (10 tests)
PASS tests/cognitree/unit/memoryScorer.test.ts (5 tests)
Total: 15 tests, 0 failed
```

---

## PHASE 4 — INTEGRATION TESTS (mock LLM, full flow)

### What Opus builds:
- Mock LLM that returns scripted responses
- Full session lifecycle tests
- Cross-session memory tests

### Mock LLM contract:
```typescript
// tests/cognitree/mocks/mockLLM.ts
// Returns pre-scripted responses — no real API calls
// Simulates: tool calls, assistant messages, session end

class MockLLM {
  addResponse(response: MockResponse): void
  // Each call pops next response from queue
  // Throws if queue empty (test setup error)
}

type MockResponse = {
  type: 'text' | 'tool_use' | 'tool_result'
  content: string
  toolName?: string
  toolInput?: unknown
}
```

### Integration tests:
```typescript
// tests/cognitree/integration/fullSession.test.ts
describe('full session lifecycle', () => {
  
  it('creates checkpoint on first session start', async () => {
    // Setup: empty .cognitree/
    // Action: simulate session start + first prompt "fix the MCP server"
    // Expected: cp_001/ created, goal.json = { delta: false, value: "fix the MCP server" }
    // NO real LLM call
  })

  it('captures file changes during session', async () => {
    // Setup: active session, cp_001 exists
    // Action: emit file_changed event for src/query.ts
    // Expected: changed.json = { delta: true, value: ["src/query.ts"] }
  })

  it('captures todo completion during session', async () => {
    // Action: emit todo_completed "Fixed MCP path"
    // Expected: progress.json has "Fixed MCP path"
  })

  it('captures mistake from stuck detector', async () => {
    // Action: emit stuck_detected { pattern: 'repeated_tool', evidence: '...' }
    // Expected: mistakes.json has structured mistake entry
  })

  it('writes inject.md on session end', async () => {
    // Action: emit session_end
    // Expected: inject.md exists and contains goal
  })

  it('inject.md is valid UTF-8', async () => {
    // Expected: no garbled characters
  })

})

// tests/cognitree/integration/multiSession.test.ts
describe('cross-session memory', () => {

  it('second session loads inject.md from first session', async () => {
    // Setup: run full first session, session ends
    // Action: start second session
    // Expected: inject.md contents available before first prompt
  })

  it('second session creates cp_002, cp_001 unchanged', async () => {
    // Expected: cp_001/ untouched, cp_002/ created
  })

  it('mistakes from session 1 appear in session 2 injection', async () => {
    // Setup: session 1 has mistake "Wrong JSON format"
    // Action: session 2 starts with debug task
    // Expected: inject string includes mistakes section
  })

  it('goal persists across sessions as persistent goal', async () => {
    // Session 1 goal: "Build Cognitree memory system"
    // Session 2 goal: "Fix the injection bug"  
    // Expected inject.md:
    //   PERSISTENT GOAL: Build Cognitree memory system (since cp_001)
    //   CURRENT GOAL: Fix the injection bug
  })

})

// tests/cognitree/integration/recovery.test.ts
describe('mistake-based recovery', () => {

  it('loads top 3 mistakes on debug task', async () => {
    // Setup: 5 mistakes stored across checkpoints
    // Action: start session with "why is it crashing"
    // Expected: inject includes top 3 most recent mistakes
  })

  it('skips mistakes on implement task', async () => {
    // Action: "add a new tool to MCP server"
    // Expected: mistakes NOT in inject (not relevant to implement)
  })

})
```

### Expected test results Phase 4:
```
PASS tests/cognitree/integration/fullSession.test.ts (6 tests)
PASS tests/cognitree/integration/multiSession.test.ts (4 tests)
PASS tests/cognitree/integration/recovery.test.ts (2 tests)
Total: 12 tests, 0 failed
```

---

## PHASE 5 — CONNECT TO LIVE SYSTEM (only after all tests pass)

### Gate: ALL 72 tests must pass before this phase

### What Opus wires:
1. `memoryManager.ts` → hooks into `query.ts` (already has import stubs)
2. `sessionLifecycle.ts` → hooks into `gracefulShutdown.ts`
3. `injector.ts` → hooks into `prompts.ts`
4. EventBus emitters → placed in tool dispatch loop in `query.ts`

### Integration points (exact lines from CODEBASE.md):
```
query.ts:287       ← session start, init memory manager
query.ts:1424      ← after tool dispatch, emit file_changed / todo_completed
query.ts:1444      ← after tool call, emit events
prompts.ts:474     ← inject memory into system prompt
gracefulShutdown.ts:448 ← session end, save checkpoint + regenerate inject.md
```

### Live test (with real LLM):
```bash
$env:COGNITREE_DEBUG="1"; bun src/entrypoints/cli.tsx

# Test 1: First prompt goal capture
Type: "fix the broken MCP path in .mcp.json"
Expected debug log:
  [Cognitree] Session start: cp_003 created
  [Cognitree] Goal captured: "fix the broken MCP path in .mcp.json"

# Test 2: File change capture
Let agent edit a file
Expected:
  [Cognitree] File changed: src/something.ts → added to changed[]

# Test 3: Session end
Exit with Ctrl+C
Expected:
  [Cognitree] Session end: checkpoint saved, inject.md regenerated

# Test 4: Memory injection next session
Start new session
Type: "what was I working on"
Expected: Agent answers from inject.md without reading any files
```

---

## TOTAL TEST SUMMARY

| Phase | Tests | What is tested |
|-------|-------|---------------|
| Phase 1 | 15 | Storage, checkpoint, branch |
| Phase 2 | 30 | Event collectors, task classifier |
| Phase 3 | 15 | Injection engine, memory scorer |
| Phase 4 | 12 | Full session, cross-session, recovery |
| **Total** | **72** | **Complete memory system** |

**All 72 must pass before connecting to live LLM.**

---

## RULES FOR OPUS

- Build one phase at a time — do not start Phase 2 until Phase 1 tests pass
- Every function must have a corresponding unit test
- Zero LLM calls in any test — use mock data or MockLLM only
- JSON format is FIXED: always `{ "delta": boolean, "value": T | null }`
- Storage layer must never throw — always return null on read failure
- inject.md must always be UTF-8 encoded (use explicit encoding)
- Budget cap (8000 chars default) is a HARD limit — never exceed it
- All files go in src/cognitree/ — no spreading
- Old cognitree files in src/cognitree/ should be READ first and ported/replaced
- After each phase: run `bun run typecheck` — zero new errors allowed

---

## HOW TO RUN

```bash
# Run all unit tests
bun test tests/cognitree/unit/

# Run integration tests
bun test tests/cognitree/integration/

# Run everything
bun test tests/cognitree/

# Run with coverage
bun test tests/cognitree/ --coverage
```
