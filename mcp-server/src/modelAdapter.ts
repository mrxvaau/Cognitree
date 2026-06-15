/**
 * MCP Model Adapter — makes the explorer model-agnostic.
 *
 * Detects which LLM is calling the MCP server and adapts:
 * - Tool descriptions (verbose/terse/structured)
 * - Context injection depth (full/summary/headers-only)
 * - Response format (JSON vs prose)
 * - Step-by-step instruction injection
 *
 * Detection priority (first match wins):
 *   1. MCP_MODEL env var (explicit override, e.g. "opus")
 *   2. LLM_MODEL env var (from Claude Code BYOK config)
 *   3. ANTHROPIC_MODEL env var
 *   4. Default profile (safe fallback)
 *
 * ─── Profile Reference ───────────────────────────────────────────────
 *
 *   claude/opus  → verbose descriptions, full sections, prose output
 *   qwen         → terse descriptions, summaries, JSON output, explicit steps
 *   gpt          → terse descriptions, summaries, JSON output
 *   gemini       → verbose descriptions, full sections, prose output, large context
 *   deepseek     → structured descriptions, headers-only, JSON output, explicit steps
 *   llama        → terse descriptions, headers-only, JSON output, explicit steps
 *   mistral      → terse descriptions, summaries, prose output
 *   default      → terse descriptions, summaries, JSON output, explicit steps
 *
 * ─────────────────────────────────────────────────────────────────────
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolDescriptionStyle = "verbose" | "terse" | "structured";
export type SectionDepth = "full" | "summary" | "headers-only";

export interface MCPModelProfile {
  /** Profile display name */
  name: string;
  /** How verbose tool descriptions should be */
  toolDescriptionStyle: ToolDescriptionStyle;
  /** Max chars of context to inject per tool call */
  maxContextChars: number;
  /** Does this model handle JSON better than prose? */
  preferJSON: boolean;
  /** Should we inject step-by-step instructions? */
  forceExplicitSteps: boolean;
  /** How much CODEBASE.md to inject per call */
  sectionDepth: SectionDepth;
}

// ---------------------------------------------------------------------------
// Built-in Profiles
// ---------------------------------------------------------------------------

const PROFILES: Record<string, MCPModelProfile> = {
  claude: {
    name: "Claude",
    toolDescriptionStyle: "verbose",
    maxContextChars: 4000,
    preferJSON: false,
    forceExplicitSteps: false,
    sectionDepth: "full",
  },
  opus: {
    name: "Opus",
    toolDescriptionStyle: "verbose",
    maxContextChars: 6000,
    preferJSON: false,
    forceExplicitSteps: false,
    sectionDepth: "full",
  },
  qwen: {
    name: "Qwen",
    toolDescriptionStyle: "terse",
    maxContextChars: 2000,
    preferJSON: true,
    forceExplicitSteps: true,
    sectionDepth: "summary",
  },
  gpt: {
    name: "GPT",
    toolDescriptionStyle: "terse",
    maxContextChars: 2000,
    preferJSON: true,
    forceExplicitSteps: false,
    sectionDepth: "summary",
  },
  gemini: {
    name: "Gemini",
    toolDescriptionStyle: "verbose",
    maxContextChars: 8000,
    preferJSON: false,
    forceExplicitSteps: false,
    sectionDepth: "full",
  },
  deepseek: {
    name: "DeepSeek",
    toolDescriptionStyle: "structured",
    maxContextChars: 2000,
    preferJSON: true,
    forceExplicitSteps: true,
    sectionDepth: "headers-only",
  },
  llama: {
    name: "Llama",
    toolDescriptionStyle: "terse",
    maxContextChars: 1500,
    preferJSON: true,
    forceExplicitSteps: true,
    sectionDepth: "headers-only",
  },
  mistral: {
    name: "Mistral",
    toolDescriptionStyle: "terse",
    maxContextChars: 2000,
    preferJSON: false,
    forceExplicitSteps: false,
    sectionDepth: "summary",
  },
  default: {
    name: "Unknown",
    toolDescriptionStyle: "terse",
    maxContextChars: 2000,
    preferJSON: true,
    forceExplicitSteps: true,
    sectionDepth: "summary",
  },
};

// ---------------------------------------------------------------------------
// Pattern matching — maps model name substrings to profile keys
// Order matters: more specific patterns first.
// ---------------------------------------------------------------------------

const PROFILE_MATCHERS: [pattern: string, profileKey: string][] = [
  ["opus", "opus"],
  ["claude", "claude"],
  ["qwen", "qwen"],
  ["gpt-4", "gpt"],
  ["gpt-3", "gpt"],
  ["o1", "gpt"],
  ["o3", "gpt"],
  ["o4", "gpt"],
  ["gemini", "gemini"],
  ["deepseek", "deepseek"],
  ["llama", "llama"],
  ["codellama", "llama"],
  ["mistral", "mistral"],
  ["mixtral", "mistral"],
  ["codestral", "mistral"],
];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Cached profile — resolved once at startup. */
let _activeProfile: MCPModelProfile | null = null;
let _detectedFrom: string = "none";

/**
 * Detect which model profile to use.
 * Priority: MCP_MODEL → LLM_MODEL → ANTHROPIC_MODEL → default.
 * Never throws — always returns a valid profile.
 */
export function detectModel(envOrHeader?: string): MCPModelProfile {
  const source = envOrHeader
    ?? process.env.MCP_MODEL
    ?? process.env.LLM_MODEL
    ?? process.env.ANTHROPIC_MODEL
    ?? "";

  if (!source) {
    _detectedFrom = "default (no env set)";
    _activeProfile = PROFILES.default!;
    return _activeProfile;
  }

  const lower = source.toLowerCase();

  // Direct profile key match (e.g. MCP_MODEL=opus)
  if (PROFILES[lower]) {
    _detectedFrom = `direct match: "${source}"`;
    _activeProfile = PROFILES[lower]!;
    return _activeProfile;
  }

  // Substring pattern match (e.g. LLM_MODEL=claude-sonnet-4-20250514)
  for (const [pattern, profileKey] of PROFILE_MATCHERS) {
    if (lower.includes(pattern)) {
      _detectedFrom = `pattern "${pattern}" in "${source}"`;
      _activeProfile = PROFILES[profileKey]!;
      return _activeProfile;
    }
  }

  // No match — use default
  _detectedFrom = `no match for "${source}", using default`;
  _activeProfile = PROFILES.default!;
  return _activeProfile;
}

/**
 * Get the active profile. Returns cached if already detected,
 * otherwise auto-detects from env.
 */
export function getActiveProfile(): MCPModelProfile {
  if (_activeProfile) return _activeProfile;
  return detectModel();
}

/** Get how the profile was detected (for diagnostics). */
export function getDetectedFrom(): string {
  return _detectedFrom;
}

/** Get all available profile names. */
export function getProfileNames(): string[] {
  return Object.keys(PROFILES);
}

/** Get a specific profile by key. */
export function getProfile(key: string): MCPModelProfile | undefined {
  return PROFILES[key.toLowerCase()];
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/**
 * Base tool descriptions — the canonical "verbose" version.
 * Terse and structured styles are derived from these.
 */
export const BASE_DESCRIPTIONS: Record<string, { verbose: string; terse: string; structured: string }> = {
  list_tools: {
    verbose: "List all Claude Code agent tools (BashTool, FileReadTool, FileEditTool, etc.) with their source file names. Returns the full registry of 42+ tools available to the coding agent, including tool directory names and files within each directory.",
    terse: "List all agent tools with source files.",
    structured: "// returns: tool_name[], directory, files[] — full agent tool registry",
  },
  list_commands: {
    verbose: "List all Claude Code slash commands (/commit, /review, /mcp, /compact, /security-review, etc.) with their source files. Shows whether each command is implemented as a single file or a directory with multiple files.",
    terse: "List all slash commands with source files.",
    structured: "// returns: command_name[], path, is_directory, files[] — slash command registry",
  },
  get_tool_source: {
    verbose: "Read the full source code of a specific Claude Code tool implementation. Specify the tool directory name (e.g. 'BashTool', 'FileEditTool'). Optionally specify a particular file within the tool directory. If omitted, reads the main .ts/.tsx file.",
    terse: "Read a tool's source code by directory name.",
    structured: "// input: toolName, fileName? — reads tool source from tools/{toolName}/{fileName}",
  },
  get_command_source: {
    verbose: "Read the source code of a specific Claude Code slash command. Specify the command name (e.g. 'commit', 'review', 'mcp'). For directory-based commands, optionally specify a file within the directory.",
    terse: "Read a slash command's source code.",
    structured: "// input: commandName, fileName? — reads command source from commands/{commandName}",
  },
  read_source_file: {
    verbose: "Read any source file from the Claude Code src/ directory by its relative path. Supports optional line range (startLine/endLine) for reading specific sections. Example paths: 'QueryEngine.ts', 'services/api/client.ts', 'utils/hooks.ts'.",
    terse: "Read a source file by relative path. Supports line ranges.",
    structured: "// input: path, startLine?, endLine? — reads src/{path} with optional line range",
  },
  search_source: {
    verbose: "Search for a regex pattern across the Claude Code source tree. Returns matching lines with file paths and line numbers. Filter by file extension (e.g. '.ts'). Default limit: 50 matches.",
    terse: "Regex search across source files.",
    structured: "// input: pattern (regex), filePattern?, maxResults? — grep-like source search",
  },
  list_directory: {
    verbose: "List files and subdirectories under the Claude Code src/ directory. Pass '' for the root, or a relative path like 'services', 'tools/BashTool'. Shows directories with trailing '/'.",
    terse: "List files in a src/ subdirectory.",
    structured: "// input: path — lists entries under src/{path}",
  },
  get_architecture: {
    verbose: "Get a high-level architecture overview of the Claude Code codebase, including the source root, top-level directory structure, all registered agent tools, all slash commands, key files, and core subsystems.",
    terse: "Get architecture overview.",
    structured: "// returns: source_root, top_level_entries, tools[], commands[], key_files, subsystems",
  },
  cache_control: {
    verbose: "Manage the memory cache — reload CODEBASE.md from disk, invalidate the cache, show hit/miss statistics, or view the cache miss log. Actions: 'reload' forces a fresh read, 'invalidate' clears the cache, 'stats' shows performance counters, 'misses' shows the miss log.",
    terse: "Cache management: reload, invalidate, stats, misses.",
    structured: "// input: action (reload|invalidate|stats|misses) — memory cache control",
  },
  model_info: {
    verbose: "Show which model profile is active and how it affects tool descriptions, context injection depth, response format, and other adaptations. Useful for debugging model-specific behavior.",
    terse: "Show active model profile.",
    structured: "// returns: active_profile, detected_from, capabilities, all_profiles",
  },
  git_history: {
    verbose: "Query git history for any file in the project. Actions: 'log' shows recent commits, 'blame' shows who wrote each line (with optional line range), 'diff' shows changes from last commit, 'who_changed' ranks authors by line count. All output includes structured data plus a human-readable summary.",
    terse: "Git log, blame, diff, or author ranking for a file.",
    structured: "// input: action (log|blame|diff|who_changed), file?, lines?, depth? — git history query",
  },
  test_runner: {
    verbose: "Run tests, list test names, or retrieve last results. Auto-detects test runner (vitest/jest/bun) from package.json. Mode 'run' executes tests and returns structured pass/fail/skip counts with failure details. Mode 'list' shows test names without running. Mode 'last_result' returns cached results from the previous run.",
    terse: "Run tests or list test names. Returns structured results.",
    structured: "// input: mode (run|list|last_result), pattern?, timeout? — test execution and reporting",
  },
  dep_graph: {
    verbose: "Analyze the dependency graph of source files. Actions: 'imports' shows what a file imports, 'imported_by' shows what imports a file or symbol, 'circular' detects circular dependency chains (max 10), 'orphans' finds files with no imports and no importers (potential dead code). The import graph is cached in memory for performance.",
    terse: "Dependency analysis: imports, importers, circular deps, orphans.",
    structured: "// input: action (imports|imported_by|circular|orphans), file?, symbol? — import graph analysis",
  },
  symbol_search: {
    verbose: "Find any function, class, type, interface, or const across the entire codebase. Checks CODEBASE.md function tables first (instant memory hit), falls back to live source file scanning. Supports exact and fuzzy matching (Levenshtein ≤ 2). Results include name, kind, file, line number, signature, and export status.",
    terse: "Find symbols (functions, classes, types) by name. Exact or fuzzy.",
    structured: "// input: query, type? (function|class|type|interface|const|any), exact? — symbol search across codebase",
  },
  project_understand: {
    verbose: "Deep code-based project understanding. Analyzes actual source files — not README. Builds a cached understanding from entry points, imports, data flow, and dependencies. Actions: 'summarize' (full analysis), 'purpose' (one-sentence what-is-this), 'stack' (runtime + frameworks), 'entrypoints' (all entry files with roles), 'dataflow' (input→processing→output), 'dependencies' (grouped packages), 'ask' (answer from cached understanding). Results are cached for 10 minutes.",
    terse: "Code-first project analysis. Actions: summarize, purpose, stack, entrypoints, dataflow, dependencies, ask.",
    structured: "// input: action (summarize|purpose|stack|entrypoints|dataflow|dependencies|ask), question?, depth? (quick|deep) — code analysis pipeline",
  },
};

/**
 * Adapt a tool's description based on the active model profile.
 * Never changes tool names or input schemas — only the description text.
 */
export function adaptToolDescription(
  toolName: string,
  profile: MCPModelProfile
): string {
  const entry = BASE_DESCRIPTIONS[toolName];
  if (!entry) return toolName; // shouldn't happen — fallback to tool name

  switch (profile.toolDescriptionStyle) {
    case "verbose":
      return entry.verbose;
    case "terse":
      return entry.terse;
    case "structured":
      return entry.structured;
    default:
      return entry.terse;
  }
}

/**
 * Adapt context injection from CODEBASE.md based on the model profile.
 * Controls how much of a matched section is returned.
 */
export function adaptContext(
  raw: string,
  profile: MCPModelProfile
): string {
  if (!raw) return "";

  const maxChars = profile.maxContextChars;

  switch (profile.sectionDepth) {
    case "full": {
      if (raw.length <= maxChars) return raw;
      return raw.slice(0, maxChars) + "\n... (truncated)";
    }

    case "summary": {
      // First 500 chars or first paragraph, whichever is shorter
      const summary = raw.slice(0, Math.min(500, maxChars));
      const endOfParagraph = summary.indexOf("\n\n");
      if (endOfParagraph > 100) {
        return summary.slice(0, endOfParagraph);
      }
      return summary;
    }

    case "headers-only": {
      // Extract only lines starting with # (markdown headers)
      const headers = raw
        .split("\n")
        .filter((line) => line.startsWith("#"))
        .join("\n");
      if (headers.length <= maxChars) return headers;
      return headers.slice(0, maxChars);
    }

    default:
      return raw.slice(0, maxChars);
  }
}

/**
 * Adapt a response value based on the model profile.
 * JSON-preferring models get compact JSON; prose models get formatted text.
 */
export function adaptResponse(
  data: unknown,
  profile: MCPModelProfile
): string {
  if (typeof data === "string") {
    if (profile.preferJSON) {
      // Wrap plain strings in a JSON envelope for consistency
      return JSON.stringify({ result: data });
    }
    return data;
  }

  if (profile.preferJSON) {
    return JSON.stringify(data, null, 2);
  }

  // Prose format — flatten objects into readable text
  return formatAsProse(data);
}

/**
 * Format an object as human-readable prose.
 * Used by Claude/Gemini profiles that prefer natural language.
 */
function formatAsProse(data: unknown, indent = 0): string {
  if (data === null || data === undefined) return "(none)";
  if (typeof data === "string") return data;
  if (typeof data === "number" || typeof data === "boolean") return String(data);

  if (Array.isArray(data)) {
    if (data.length === 0) return "(empty list)";
    return data
      .map((item, i) => `${" ".repeat(indent)}${i + 1}. ${formatAsProse(item, indent + 2)}`)
      .join("\n");
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return "(empty)";
    return entries
      .map(([key, val]) => {
        const label = key.replace(/_/g, " ");
        const value = formatAsProse(val, indent + 2);
        if (value.includes("\n")) {
          return `${" ".repeat(indent)}**${label}:**\n${value}`;
        }
        return `${" ".repeat(indent)}**${label}:** ${value}`;
      })
      .join("\n");
  }

  return String(data);
}
