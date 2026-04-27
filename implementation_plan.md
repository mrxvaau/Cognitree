# Token Efficiency Upgrade — MCP Memory Cache Layer

## Problem

Every MCP tool call reads raw source files from disk → massive token waste. Tools like `get_architecture`, `list_tools`, `read_source_file`, and prompt handlers all do fresh `fs.readFile()` on every invocation.

## Audit Findings

### 1. Tools That Read Files on Every Call

| Tool | File Reads per Call | What It Reads |
|------|-------------------|---------------|
| `get_tool_source` | 1–2 | `fs.readFile()` on tool main file |
| `get_command_source` | 1 | `fs.readFile()` on command file |
| `read_source_file` | 1 | `fs.readFile()` on arbitrary src/ file |
| `search_source` | **N** (walks ALL files) | `fs.readFile()` on every matched file |
| `get_architecture` | 0 direct, but 2 `listDir()` + `getToolList()` + `getCommandList()` | Directory scans |
| `list_tools` | N dirs | `fs.readdir()` per tool directory |
| `list_commands` | N dirs | `fs.readdir()` per command directory |
| `list_directory` | 1 | `fs.readdir()` |
| All 5 prompt handlers | 1–N | `fs.readFile()` on tool/command sources |

### 2. Existing Caching Layer

**None.** Zero caching — every call is a cold disk read.

### 3. Current Tool Call Flow

```
Client → MCP request → CallToolRequestSchema handler → switch(name)
  → fs.readFile() / fs.readdir() (cold disk I/O)
  → return { content: [{ type: "text", text: rawContent }] }
```

## Proposed Changes

### Memory Cache Module

#### [NEW] [memoryCache.ts](file:///d:/Project/REFECTOR/CC/mcp-server/src/memoryCache.ts)

Core cache class that:
- Loads `CODEBASE.md` once at startup (path from `MCP_MEMORY_FILE` env, default `../CODEBASE.md` relative to project root)
- 5-minute TTL (configurable via `MCP_CACHE_TTL_SECONDS`)
- `query(question)` — keyword-matches against section headers (`##`, `###`), returns matching section text
- `queryByFile(fileName)` — finds sections mentioning a specific file
- `queryByFunction(funcName)` — finds function entries in tables
- Hit/miss counters for stats
- Miss logging to `.cache-misses.log`
- `invalidate()` and `reload()` for manual control

---

### Server Integration

#### [MODIFY] [server.ts](file:///d:/Project/REFECTOR/CC/mcp-server/src/server.ts)

Changes:
1. Import `MemoryCache` and instantiate a singleton
2. Add `cache_control` tool to `ListToolsRequestSchema`
3. Add `cache_control` handler to `CallToolRequestSchema`
4. Wrap `get_architecture` to use cache (biggest win — currently builds from scratch every time)
5. Wrap `list_tools` / `list_commands` to try cache first
6. Add context injection helper: before tool execution, extract relevant CODEBASE.md section and prepend to response
7. Every tool response gains `source` metadata field

**Tools NOT wrapped** (by design):
- `read_source_file` — always needs live file content (specific line ranges)
- `search_source` — regex search must scan real files
- `list_directory` — must reflect live filesystem

These tools still benefit from **context injection** (relevant CODEBASE.md section prepended to help the LLM interpret results).

---

### Index Update

#### [MODIFY] [index.ts](file:///d:/Project/REFECTOR/CC/mcp-server/src/index.ts)

Add cache initialization before server start:
```typescript
const cache = new MemoryCache();
await cache.load(memoryFilePath);
```

Pass cache instance to `createServer()`.

---

### Config Update

#### [MODIFY] [.mcp.json](file:///d:/Project/REFECTOR/CC/.mcp.json)

Add cache-related env vars:
- `MCP_CACHE_TTL_SECONDS`: "300"
- `MCP_MEMORY_FILE`: "./CODEBASE.md"

---

## Response Format

Every tool response includes source metadata:

```typescript
// Cached response (token-efficient)
{
  content: [{
    type: "text",
    text: JSON.stringify({
      source: "memory",
      tokens_saved: true,
      data: "## Architecture Overview\n..."
    })
  }]
}

// File fallback (full read)
{
  content: [{
    type: "text",
    text: JSON.stringify({
      source: "file",
      tokens_saved: false,
      data: "const foo = ..."
    })
  }]
}
```

## Verification Plan

### Automated Tests
```bash
cd mcp-server
npm run build          # Must compile cleanly
node dist/src/index.js # Must start without errors
```

### Manual Verification
1. Call `cache_control` with `stats` → verify hit/miss counters
2. Call `get_architecture` → verify `source: "memory"`
3. Call `read_source_file` with a specific path → verify `source: "file"` (expected — this tool always reads live)
4. Call `cache_control` with `invalidate` then `get_architecture` → verify fresh load
5. Call `cache_control` with `misses` → verify miss log contents

## Open Questions

> [!IMPORTANT]
> **Context injection depth**: The plan prepends max 2000 chars of relevant CODEBASE.md section to tool responses. Should this be configurable, or is 2000 a good universal cap?

> [!IMPORTANT]
> **search_source caching**: Currently excluded from cache wrapping since regex must scan real files. An alternative is to cache file contents in memory (not just CODEBASE.md) to avoid disk I/O. This would increase memory usage significantly. Should we implement this as a Phase 2?
