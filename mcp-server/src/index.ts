#!/usr/bin/env node
/**
 * STDIO entrypoint — for local use with Claude Desktop, Claude Code, etc.
 *
 * Usage:
 *   node dist/index.js
 *   CLAUDE_CODE_SRC_ROOT=/path/to/src node dist/index.js
 *
 * Cache config (env vars):
 *   MCP_MEMORY_FILE         — Path to CODEBASE.md (default: ../CODEBASE.md relative to project root)
 *   MCP_CACHE_TTL_SECONDS   — Cache TTL in seconds (default: 300)
 *
 * Model config (env vars):
 *   MCP_MODEL               — Model profile override (e.g. "opus", "qwen", "gemini")
 *   LLM_MODEL               — Auto-detected from Claude Code BYOK config
 *   ANTHROPIC_MODEL          — Fallback model identifier
 */

import * as path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, validateSrcRoot, SRC_ROOT } from "./server.js";
import { MemoryCache } from "./memoryCache.js";
import { detectModel, getDetectedFrom } from "./modelAdapter.js";

async function main() {
  await validateSrcRoot();

  // Detect model profile from env
  const profile = detectModel();
  console.error(`[ModelAdapter] Profile: ${profile.name} (${getDetectedFrom()})`);
  console.error(`  Style: ${profile.toolDescriptionStyle} | Context: ${profile.maxContextChars} chars | Depth: ${profile.sectionDepth}`);

  // Initialize memory cache from CODEBASE.md
  const cache = new MemoryCache();
  const memoryFilePath = path.resolve(
    process.env.MCP_MEMORY_FILE ??
      path.join(SRC_ROOT, "..", "CODEBASE.md")
  );
  await cache.load(memoryFilePath);

  const server = createServer(cache);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Claude Code Explorer MCP (stdio) started — src: ${SRC_ROOT}`);
  console.error(`  Memory cache: ${memoryFilePath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
