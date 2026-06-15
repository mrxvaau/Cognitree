/**
 * symbol_search — Find any function/type/class/const across the entire codebase.
 *
 * Checks CODEBASE.md function tables first (Track 1 cache hit),
 * falls back to live source file scanning on cache miss.
 *
 * Supports exact and fuzzy matching with type filtering.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { MemoryCache } from "../memoryCache.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SymbolSearchInput {
  query: string;
  type?: "function" | "class" | "type" | "interface" | "const" | "any";
  exact?: boolean;
}

interface SymbolMatch {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature: string;
  exported: boolean;
}

export interface SymbolSearchOutput {
  query: string;
  matches: SymbolMatch[];
  total: number;
  source: "memory" | "file";
  summary: string;
  error?: string;
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// Declaration patterns
// ---------------------------------------------------------------------------

interface DeclPattern {
  kind: string;
  regex: RegExp;
  exported: boolean;
}

const DECL_PATTERNS: DeclPattern[] = [
  // Exported declarations
  { kind: "function", regex: /^export\s+(?:async\s+)?function\s+(\w+)/,     exported: true },
  { kind: "function", regex: /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/, exported: true },
  { kind: "class",    regex: /^export\s+(?:abstract\s+)?class\s+(\w+)/,      exported: true },
  { kind: "type",     regex: /^export\s+type\s+(\w+)/,                       exported: true },
  { kind: "interface",regex: /^export\s+interface\s+(\w+)/,                   exported: true },
  { kind: "const",    regex: /^export\s+const\s+(\w+)/,                      exported: true },
  { kind: "const",    regex: /^export\s+(?:default\s+)?const\s+(\w+)/,       exported: true },
  // Non-exported declarations
  { kind: "function", regex: /^(?:async\s+)?function\s+(\w+)/,               exported: false },
  { kind: "class",    regex: /^(?:abstract\s+)?class\s+(\w+)/,               exported: false },
  { kind: "type",     regex: /^type\s+(\w+)/,                                exported: false },
  { kind: "interface",regex: /^interface\s+(\w+)/,                           exported: false },
  { kind: "const",    regex: /^const\s+(\w+)/,                               exported: false },
];

// ---------------------------------------------------------------------------
// File walking (reused pattern from depGraph)
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules", "dist", ".cache", ".git", ".next", "coverage",
]);

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function walkFiles(root: string, rel = ""): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return results;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      results.push(...walkFiles(root, child));
    } else if (SCAN_EXTENSIONS.has(path.extname(e.name))) {
      results.push(child);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/**
 * Simple Levenshtein distance for fuzzy matching.
 * Returns distance ≤ maxDist, or Infinity if > maxDist (early exit).
 */
function levenshtein(a: string, b: string, maxDist = 2): number {
  if (Math.abs(a.length - b.length) > maxDist) return Infinity;
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0]![j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
      rowMin = Math.min(rowMin, matrix[i]![j]!);
    }
    if (rowMin > maxDist) return Infinity;
  }
  return matrix[a.length]![b.length]!;
}

function matchesQuery(
  name: string,
  query: string,
  exact: boolean
): boolean {
  const nameLower = name.toLowerCase();
  const queryLower = query.toLowerCase();

  if (exact) {
    return nameLower === queryLower;
  }

  // Substring match
  if (nameLower.includes(queryLower)) return true;

  // Levenshtein ≤ 2 for short queries
  if (queryLower.length >= 3 && levenshtein(nameLower, queryLower) <= 2) {
    return true;
  }

  return false;
}

/** Sort priority: exact match > partial > fuzzy. Key files rank higher. */
function sortMatches(matches: SymbolMatch[], query: string): SymbolMatch[] {
  const queryLower = query.toLowerCase();
  return matches.sort((a, b) => {
    // Exact name match first
    const aExact = a.name.toLowerCase() === queryLower ? 0 : 1;
    const bExact = b.name.toLowerCase() === queryLower ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    // Exported over non-exported
    if (a.exported !== b.exported) return a.exported ? -1 : 1;

    // Key files rank higher
    const fileRank = (f: string) => {
      if (f.includes("query")) return 0;
      if (f.includes("main")) return 1;
      if (f.includes("Tool")) return 2;
      if (f.includes("utils")) return 3;
      if (f.includes("test")) return 5;
      return 4;
    };
    return fileRank(a.file) - fileRank(b.file);
  });
}

// ---------------------------------------------------------------------------
// CODEBASE.md cache search (Track 1 integration)
// ---------------------------------------------------------------------------

function searchCODEBASE(
  query: string,
  kind: string | undefined,
  cache: MemoryCache | undefined
): SymbolMatch[] {
  if (!cache) return [];

  // Try function table search
  const section = cache.queryByFunction(query);
  if (!section) return [];

  // Parse table rows: | `funcName` | description | ...
  const matches: SymbolMatch[] = [];
  const lines = section.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.includes("|")) continue;

    const cells = line.split("|").map((c) => c.trim());
    // Look for the query in any cell
    for (const cell of cells) {
      const cleanCell = cell.replace(/`/g, "").trim();
      if (
        cleanCell.toLowerCase().includes(query.toLowerCase()) &&
        cleanCell.length < 100 // skip description cells
      ) {
        matches.push({
          name: cleanCell,
          kind: kind ?? "unknown",
          file: "(from CODEBASE.md)",
          line: 0,
          signature: line.trim(),
          exported: true,
        });
        break; // don't match multiple cells in same row
      }
    }
  }

  return matches.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Live source scan
// ---------------------------------------------------------------------------

function scanSourceFiles(
  query: string,
  kind: string | undefined,
  exact: boolean,
  srcRoot: string
): SymbolMatch[] {
  const matches: SymbolMatch[] = [];
  const files = walkFiles(srcRoot);
  const filterKind = kind && kind !== "any" ? kind : undefined;

  for (const file of files) {
    if (matches.length >= 50) break; // hard cap before sorting
    const abs = path.join(srcRoot, file);
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trimStart();

      for (const pattern of DECL_PATTERNS) {
        if (filterKind && pattern.kind !== filterKind) continue;

        const match = line.match(pattern.regex);
        if (match && match[1] && matchesQuery(match[1], query, exact)) {
          // Avoid duplicates (exported + non-exported patterns can match same line)
          if (
            !matches.some(
              (m) => m.file === file && m.line === i + 1 && m.name === match[1]
            )
          ) {
            matches.push({
              name: match[1],
              kind: pattern.kind,
              file,
              line: i + 1,
              signature: lines[i]!.trim().slice(0, 200),
              exported: pattern.exported,
            });
          }
        }
      }
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export function handleSymbolSearch(
  input: SymbolSearchInput,
  srcRoot: string,
  cache?: MemoryCache
): SymbolSearchOutput {
  const { query, type: kind, exact = false } = input;

  if (!query || query.trim().length === 0) {
    return {
      query,
      matches: [],
      total: 0,
      source: "file",
      summary: "query is required",
      error: "empty query",
      suggestion: "Provide a function, class, type, or const name to search for",
    };
  }

  try {
    // Step 1: Check CODEBASE.md first (Track 1 cache)
    const cacheMatches = searchCODEBASE(query, kind, cache);
    if (cacheMatches.length > 0) {
      return {
        query,
        matches: cacheMatches.slice(0, 20),
        total: cacheMatches.length,
        source: "memory",
        summary: `Found ${cacheMatches.length} match(es) for "${query}" in CODEBASE.md`,
      };
    }

    // Step 2: Live scan
    const fileMatches = scanSourceFiles(query, kind, exact, srcRoot);
    const sorted = sortMatches(fileMatches, query).slice(0, 20);

    return {
      query,
      matches: sorted,
      total: sorted.length,
      source: "file",
      summary:
        sorted.length > 0
          ? `Found ${sorted.length} match(es) for "${query}"`
          : `No matches found for "${query}"`,
    };
  } catch (err) {
    return {
      query,
      matches: [],
      total: 0,
      source: "file",
      summary: `Symbol search error: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
      suggestion: "Check that the source directory exists",
    };
  }
}

// ---------------------------------------------------------------------------
// Tool description
// ---------------------------------------------------------------------------

export const SYMBOL_SEARCH_DESCRIPTIONS = {
  verbose:
    "Find any function, class, type, interface, or const across the entire codebase. Checks CODEBASE.md function tables first (instant memory hit), falls back to live source file scanning. Supports exact and fuzzy matching (Levenshtein ≤ 2). Results include name, kind, file, line number, signature, and export status. Sorted by relevance: exact matches first, then key files (query.ts > utils > tests).",
  terse: "Find symbols (functions, classes, types) by name. Exact or fuzzy.",
  structured:
    "// input: query, type? (function|class|type|interface|const|any), exact? — symbol search across codebase",
};
