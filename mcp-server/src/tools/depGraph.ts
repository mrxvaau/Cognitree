/**
 * dep_graph — Dependency graph analysis for imports.
 *
 * Actions:
 *   imports     — what does this file import?
 *   imported_by — what files import this file/symbol?
 *   circular    — detect circular dependency chains
 *   orphans     — files with no imports and no importers
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepGraphInput {
  file?: string;
  symbol?: string;
  action: "imports" | "imported_by" | "circular" | "orphans";
}

export interface DepGraphOutput {
  action: string;
  file?: string;
  imports?: string[];
  imported_by?: string[];
  circular?: string[][];
  orphans?: string[];
  depth: number;
  summary: string;
  error?: string;
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// Import graph builder
// ---------------------------------------------------------------------------

/** Directories to skip when walking. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".cache",
  ".git",
  ".next",
  "coverage",
  "__pycache__",
]);

/** File extensions to scan for imports. */
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);

/** Regex patterns to extract import paths. */
const IMPORT_PATTERNS = [
  /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
  /import\s+['"]([^'"]+)['"]/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /export\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
];

interface ImportGraph {
  /** file → files it imports */
  forward: Map<string, Set<string>>;
  /** file → files that import it */
  reverse: Map<string, Set<string>>;
  /** all known files */
  allFiles: Set<string>;
}

/** Cache the graph in memory. */
let _cachedGraph: ImportGraph | null = null;
let _cachedRoot: string | null = null;

function walkSourceFiles(root: string, rel = ""): string[] {
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
      results.push(...walkSourceFiles(root, child));
    } else if (SCAN_EXTENSIONS.has(path.extname(e.name))) {
      results.push(child);
    }
  }
  return results;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    // Reset lastIndex for global regexes
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath && !importPath.startsWith("node:") && !importPath.includes("node_modules")) {
        imports.push(importPath);
      }
    }
  }
  return imports;
}

/**
 * Resolve an import path relative to the importing file.
 * Returns a normalized relative path from the project root, or null if external.
 */
function resolveImport(
  importPath: string,
  fromFile: string,
  root: string,
  allFiles: Set<string>
): string | null {
  // Skip external packages
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  let resolved = path.posix.normalize(path.posix.join(fromDir, importPath));

  // Try exact match first, then with extensions
  if (allFiles.has(resolved)) return resolved;

  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"];
  for (const ext of extensions) {
    if (allFiles.has(resolved + ext)) return resolved + ext;
  }

  // Try /index
  for (const ext of extensions) {
    if (allFiles.has(`${resolved}/index${ext}`)) return `${resolved}/index${ext}`;
  }

  return null;
}

function buildGraph(srcRoot: string): ImportGraph {
  if (_cachedGraph && _cachedRoot === srcRoot) {
    return _cachedGraph;
  }

  const allFiles = new Set(walkSourceFiles(srcRoot));
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();

  // Initialize all files
  for (const file of allFiles) {
    forward.set(file, new Set());
    reverse.set(file, new Set());
  }

  for (const file of allFiles) {
    const abs = path.join(srcRoot, file);
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf-8");
    } catch {
      continue;
    }

    const importPaths = extractImports(content);
    for (const imp of importPaths) {
      const resolved = resolveImport(imp, file, srcRoot, allFiles);
      if (resolved && resolved !== file) {
        forward.get(file)!.add(resolved);
        if (!reverse.has(resolved)) {
          reverse.set(resolved, new Set());
        }
        reverse.get(resolved)!.add(file);
      }
    }
  }

  _cachedGraph = { forward, reverse, allFiles };
  _cachedRoot = srcRoot;
  return _cachedGraph;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function getImports(file: string, graph: ImportGraph): string[] {
  const deps = graph.forward.get(file);
  return deps ? Array.from(deps).sort() : [];
}

function getImportedBy(file: string, graph: ImportGraph): string[] {
  // Also check if the query is a symbol — search file content
  const importers = graph.reverse.get(file);
  return importers ? Array.from(importers).sort() : [];
}

function findCircular(graph: ImportGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string, pathSoFar: string[]): void {
    if (cycles.length >= 10) return; // limit output
    if (stack.has(node)) {
      // Found a cycle — extract it
      const cycleStart = pathSoFar.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push([...pathSoFar.slice(cycleStart), node]);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);

    const deps = graph.forward.get(node);
    if (deps) {
      for (const dep of deps) {
        dfs(dep, [...pathSoFar, node]);
        if (cycles.length >= 10) return;
      }
    }

    stack.delete(node);
  }

  for (const file of graph.allFiles) {
    if (!visited.has(file)) {
      dfs(file, []);
    }
    if (cycles.length >= 10) break;
  }

  return cycles;
}

function findOrphans(graph: ImportGraph): string[] {
  const orphans: string[] = [];
  for (const file of graph.allFiles) {
    const imports = graph.forward.get(file);
    const importers = graph.reverse.get(file);
    const hasNoImports = !imports || imports.size === 0;
    const hasNoImporters = !importers || importers.size === 0;
    if (hasNoImports && hasNoImporters) {
      orphans.push(file);
    }
  }
  return orphans.sort();
}

function findSymbolImporters(
  symbol: string,
  srcRoot: string,
  graph: ImportGraph
): string[] {
  const results: string[] = [];
  const symbolPattern = new RegExp(
    `import\\s+.*?\\b${symbol}\\b.*?from\\s+['"]`,
    "i"
  );
  for (const file of graph.allFiles) {
    const abs = path.join(srcRoot, file);
    try {
      const content = fs.readFileSync(abs, "utf-8");
      if (symbolPattern.test(content)) {
        results.push(file);
      }
    } catch {
      continue;
    }
  }
  return results.sort();
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export function handleDepGraph(
  input: DepGraphInput,
  srcRoot: string
): DepGraphOutput {
  const { action, file, symbol } = input;

  try {
    const graph = buildGraph(srcRoot);

    switch (action) {
      case "imports": {
        if (!file) {
          return {
            action,
            depth: 0,
            summary: "file is required for imports action",
            error: "missing file",
            suggestion: "Provide a relative file path",
          };
        }
        const imports = getImports(file, graph);
        return {
          action,
          file,
          imports,
          depth: 1,
          summary: `${file} imports ${imports.length} file(s)`,
        };
      }

      case "imported_by": {
        if (symbol) {
          const importers = findSymbolImporters(symbol, srcRoot, graph);
          return {
            action,
            imported_by: importers,
            depth: 1,
            summary: `Symbol "${symbol}" is imported by ${importers.length} file(s)`,
          };
        }
        if (!file) {
          return {
            action,
            depth: 0,
            summary: "file or symbol is required",
            error: "missing file/symbol",
            suggestion: "Provide a file path or symbol name",
          };
        }
        const importers = getImportedBy(file, graph);
        return {
          action,
          file,
          imported_by: importers,
          depth: 1,
          summary: `${file} is imported by ${importers.length} file(s)`,
        };
      }

      case "circular": {
        const cycles = findCircular(graph);
        return {
          action,
          circular: cycles,
          depth: cycles.reduce((max, c) => Math.max(max, c.length), 0),
          summary:
            cycles.length > 0
              ? `Found ${cycles.length} circular dependency chain(s)`
              : "No circular dependencies detected",
        };
      }

      case "orphans": {
        const orphans = findOrphans(graph);
        return {
          action,
          orphans,
          depth: 0,
          summary: `${orphans.length} orphan file(s) (no imports or importers)`,
        };
      }

      default:
        return {
          action,
          depth: 0,
          summary: `Unknown action: ${action}`,
          error: `Invalid action: ${action}`,
          suggestion: "Use: imports, imported_by, circular, or orphans",
        };
    }
  } catch (err) {
    return {
      action,
      depth: 0,
      summary: `Dependency analysis error: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
      suggestion: "Check that the source directory exists and is readable",
    };
  }
}

/** Invalidate cached graph (call when files change). */
export function invalidateDepGraph(): void {
  _cachedGraph = null;
  _cachedRoot = null;
}

// ---------------------------------------------------------------------------
// Tool description
// ---------------------------------------------------------------------------

export const DEP_GRAPH_DESCRIPTIONS = {
  verbose:
    "Analyze the dependency graph of source files. Actions: 'imports' shows what a file imports, 'imported_by' shows what imports a file or symbol, 'circular' detects circular dependency chains (max 10), 'orphans' finds files with no imports and no importers (potential dead code). The import graph is cached in memory for performance.",
  terse: "Dependency analysis: imports, importers, circular deps, orphans.",
  structured:
    "// input: action (imports|imported_by|circular|orphans), file?, symbol? — import graph analysis",
};
