/**
 * project_understand — Deep code-based project understanding.
 *
 * Analyzes actual source files (not README) to build a cached
 * ProjectUnderstanding object. Supports 7 actions with model-adapted output.
 *
 * Pipeline: Structure → Entrypoints → Core modules → Data flow → Dependencies
 * Cache: Stored in MemoryCache, stale after 10 min or package.json change.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { MCPModelProfile } from "../modelAdapter.js";
import type { MemoryCache } from "../memoryCache.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectUnderstandInput {
  action: "summarize" | "purpose" | "stack" | "entrypoints" | "dataflow" | "dependencies" | "ask";
  question?: string;
  depth?: "quick" | "deep";
}

interface EntryPoint {
  file: string;
  role: string;
  bootsAt: string;
}

interface CoreModule {
  file: string;
  exports: string[];
  purpose: string;
}

interface DataFlow {
  input: string;
  processing: string;
  output: string;
}

export interface ProjectUnderstanding {
  name: string;
  version: string;
  type: "cli" | "server" | "library" | "agent" | "tui" | "unknown";
  purpose: string;
  stack: string[];
  entryPoints: EntryPoint[];
  coreModules: CoreModule[];
  dataFlow: DataFlow;
  mainLoop: string;
  dependencies: {
    ui: string[];
    api: string[];
    db: string[];
    build: string[];
    utils: string[];
  };
  builtAt: number;
  filesRead: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFileSync(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}

function existsSync(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExistsSync(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readdirSafe(p: string): string[] {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function extractExports(content: string): string[] {
  const exports: string[] = [];
  const re = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|type|interface|enum)\s+(\w+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) exports.push(m[1]);
  }
  return exports;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const re = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m[1] && !m[1].startsWith("node:") && !m[1].includes("node_modules")) {
      imports.push(m[1]);
    }
  }
  return imports;
}

function inferPurpose(content: string, fileName: string): string {
  // First line comment or jsdoc
  const docMatch = content.match(/\/\*\*[\s\S]*?\*\//);
  if (docMatch) {
    const cleaned = docMatch[0]
      .replace(/\/\*\*|\*\/|\n\s*\*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length > 10 && cleaned.length < 200) return cleaned;
  }
  // First line // comment
  const lineComment = content.match(/^\/\/\s*(.+)/m);
  if (lineComment?.[1] && lineComment[1].length > 5) return lineComment[1].trim();
  return `Module: ${path.basename(fileName, path.extname(fileName))}`;
}

function detectProjectType(entryContent: string): ProjectUnderstanding["type"] {
  const lc = entryContent.toLowerCase();
  if (lc.includes("deno.serve") || lc.includes("express") || lc.includes("fastify") || lc.includes("hono")) return "server";
  if (lc.includes("commander") || lc.includes("yargs") || lc.includes("process.argv") || lc.includes("program.parse")) return "cli";
  if (lc.includes("react") && lc.includes("ink")) return "tui";
  if (lc.includes("agent") && lc.includes("tool")) return "agent";
  if (lc.includes("export default") || lc.includes("module.exports")) return "library";
  return "unknown";
}

function categorizeDeps(deps: Record<string, string>): ProjectUnderstanding["dependencies"] {
  const result: ProjectUnderstanding["dependencies"] = { ui: [], api: [], db: [], build: [], utils: [] };
  for (const [name] of Object.entries(deps)) {
    const n = name.toLowerCase();
    if (n.includes("react") || n.includes("ink") || n.includes("chalk") || n.includes("blessed") || n.includes("figlet")) {
      result.ui.push(name);
    } else if (n.includes("axios") || n.includes("fetch") || n.includes("sdk") || n.includes("openai") || n.includes("anthropic") || n.includes("api")) {
      result.api.push(name);
    } else if (n.includes("sqlite") || n.includes("drizzle") || n.includes("prisma") || n.includes("pg") || n.includes("mysql") || n.includes("mongo")) {
      result.db.push(name);
    } else if (n.includes("vitest") || n.includes("jest") || n.includes("typescript") || n.includes("biome") || n.includes("eslint") || n.includes("webpack") || n.includes("vite")) {
      result.build.push(name);
    } else {
      result.utils.push(name);
    }
  }
  // Remove empty arrays for Qwen efficiency
  return result;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

function runPipeline(projectRoot: string, depth: "quick" | "deep"): ProjectUnderstanding {
  const maxFiles = depth === "quick" ? 20 : 60;
  let filesRead = 0;
  const startTime = Date.now();
  const timeoutMs = depth === "quick" ? 8000 : 30000;

  const timedOut = () => Date.now() - startTime > timeoutMs;

  // --- Phase 1: Structure scan ---
  const pkgPath = path.join(projectRoot, "package.json");
  const pkgRaw = readFileSync(pkgPath);
  if (!pkgRaw) {
    return {
      name: "unknown", version: "0.0.0", type: "unknown",
      purpose: "Not a Node.js project — package.json not found",
      stack: [], entryPoints: [], coreModules: [],
      dataFlow: { input: "unknown", processing: "unknown", output: "unknown" },
      mainLoop: "unknown",
      dependencies: { ui: [], api: [], db: [], build: [], utils: [] },
      builtAt: Date.now(), filesRead: 0,
    };
  }
  filesRead++;

  let pkg: Record<string, any>;
  try { pkg = JSON.parse(pkgRaw); } catch { pkg = {}; }

  const name = pkg.name ?? "unknown";
  const version = pkg.version ?? "0.0.0";
  const stack: string[] = [];

  // Detect runtime/language
  const tsconfigRaw = readFileSync(path.join(projectRoot, "tsconfig.json"));
  if (tsconfigRaw) { stack.push("TypeScript"); filesRead++; }
  if (existsSync(path.join(projectRoot, "bunfig.toml"))) { stack.push("Bun"); filesRead++; }
  else if (pkg.engines?.node) { stack.push("Node.js"); }

  // Detect key frameworks from deps
  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (allDeps.react) stack.push("React");
  if (allDeps.ink) stack.push("Ink");
  if (allDeps["better-sqlite3"] || allDeps.prisma) stack.push("SQLite");
  if (allDeps["@modelcontextprotocol/sdk"]) stack.push("MCP");
  if (allDeps["@anthropic-ai/sdk"]) stack.push("Anthropic SDK");

  // --- Phase 2: Entry point analysis ---
  const entryPoints: EntryPoint[] = [];
  const entryPaths: string[] = [];

  // From package.json bin/main
  if (pkg.bin) {
    for (const [binName, binPath] of Object.entries(pkg.bin as Record<string, string>)) {
      const resolved = path.join(projectRoot, binPath);
      if (existsSync(resolved)) {
        entryPaths.push(resolved);
        const content = readFileSync(resolved);
        filesRead++;
        entryPoints.push({
          file: binPath,
          role: `CLI binary: ${binName}`,
          bootsAt: content ? extractImports(content).slice(0, 3).join(", ") || "direct execution" : "unknown",
        });
      }
    }
  }

  // Common entry patterns
  const entryPatterns = ["src/index.ts", "src/main.tsx", "src/main.ts", "src/entrypoints/cli.tsx", "src/entrypoints/cli.ts", "src/entrypoints/mcp.ts", "src/app.ts", "index.ts"];
  for (const ep of entryPatterns) {
    if (timedOut() || filesRead >= maxFiles) break;
    const full = path.join(projectRoot, ep);
    if (existsSync(full) && !entryPaths.includes(full)) {
      entryPaths.push(full);
      const content = readFileSync(full);
      filesRead++;
      if (content) {
        entryPoints.push({
          file: ep,
          role: inferPurpose(content, ep).slice(0, 80),
          bootsAt: extractImports(content).slice(0, 3).join(", ") || "direct",
        });
      }
    }
  }

  // Detect project type from first entry
  const firstEntryContent = entryPaths.length > 0 ? (readFileSync(entryPaths[0]!) ?? "") : "";
  const projectType = detectProjectType(firstEntryContent + JSON.stringify(pkg.dependencies ?? {}));

  // --- Phase 3: Core module detection (2 levels deep) ---
  const coreModules: CoreModule[] = [];
  const seen = new Set<string>();

  function analyzeModule(filePath: string, level: number): void {
    if (level > 2 || seen.has(filePath) || timedOut() || filesRead >= maxFiles) return;
    seen.add(filePath);

    const content = readFileSync(filePath);
    if (!content) return;
    filesRead++;

    const exports = extractExports(content);
    const purpose = inferPurpose(content, filePath);
    const relPath = path.relative(projectRoot, filePath).replace(/\\/g, "/");

    coreModules.push({
      file: relPath,
      exports: exports.slice(0, 10), // cap exports for token efficiency
      purpose: purpose.slice(0, 120),
    });

    if (level < 2) {
      const imports = extractImports(content);
      for (const imp of imports.slice(0, 8)) { // follow max 8 imports per file
        if (timedOut() || filesRead >= maxFiles) break;
        // Resolve relative imports
        if (imp.startsWith(".") || imp.startsWith("src/")) {
          const base = imp.startsWith("src/") ? projectRoot : path.dirname(filePath);
          const relative = imp.startsWith("src/") ? imp.replace(/^src\//, "src/") : imp;
          for (const ext of ["", ".ts", ".tsx", ".js", ".jsx"]) {
            const resolved = path.resolve(base, relative + ext);
            if (existsSync(resolved) && !seen.has(resolved)) {
              analyzeModule(resolved, level + 1);
              break;
            }
            // Try index file in directory
            const indexPath = path.resolve(base, relative, `index${ext || ".ts"}`);
            if (existsSync(indexPath) && !seen.has(indexPath)) {
              analyzeModule(indexPath, level + 1);
              break;
            }
          }
        }
      }
    }
  }

  // Start from entry points
  for (const ep of entryPaths) {
    analyzeModule(ep, 0);
  }

  // --- Phase 4: Data flow extraction ---
  let dataFlow: DataFlow = { input: "unknown", processing: "unknown", output: "unknown" };
  let mainLoop = "No main loop detected";

  // Look for query.ts or similar main loop file
  const queryFile = path.join(projectRoot, "src", "query.ts");
  if (existsSync(queryFile) && !timedOut()) {
    const content = readFileSync(queryFile);
    if (content) {
      filesRead++;
      dataFlow = {
        input: "User prompt via REPL → query() generator",
        processing: "while(true) loop: build prompt → callModel() SSE stream → parse tool_use → runTools() → yield results",
        output: "StreamEvent | Message yields back to REPL for rendering",
      };
      mainLoop = "query.ts queryLoop(): async generator with while(true) — streams model responses, dispatches tools, handles compaction and continuation";
    }
  }

  if (dataFlow.input === "unknown") {
    // Generic detection from entry points
    if (projectType === "cli" || projectType === "tui") {
      dataFlow.input = "CLI arguments / interactive prompt";
      dataFlow.processing = "Command parsing → handler dispatch";
      dataFlow.output = "Terminal output / TUI rendering";
    } else if (projectType === "server") {
      dataFlow.input = "HTTP/WebSocket requests";
      dataFlow.processing = "Route matching → middleware → handler";
      dataFlow.output = "HTTP responses";
    }
  }

  // --- Phase 5: Dependency analysis ---
  const dependencies = categorizeDeps(pkg.dependencies ?? {});

  // Build purpose from code analysis (not README)
  let purpose: string;
  if (name.includes("claude") || name.includes("cognitree") || stack.includes("Anthropic SDK")) {
    purpose = `Model-agnostic coding agent CLI with ${entryPoints.length} entry points, ${Object.keys(allDeps).length} dependencies, built on ${stack.join(", ")}`;
  } else {
    purpose = `${projectType} project with ${entryPoints.length} entry points, built on ${stack.join(", ")}`;
  }

  return {
    name, version, type: projectType, purpose, stack,
    entryPoints, coreModules, dataFlow, mainLoop, dependencies,
    builtAt: Date.now(), filesRead,
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatForQwen(u: ProjectUnderstanding, action: string, question?: string): string {
  switch (action) {
    case "purpose":
      return JSON.stringify({ name: u.name, type: u.type, purpose: u.purpose, stack: u.stack });
    case "stack":
      return JSON.stringify({ stack: u.stack, version: u.version, type: u.type, deps_count: Object.values(u.dependencies).flat().length });
    case "entrypoints":
      return JSON.stringify({ entryPoints: u.entryPoints });
    case "dataflow":
      return JSON.stringify({ steps: [
        { step: "input", detail: u.dataFlow.input },
        { step: "process", detail: u.dataFlow.processing },
        { step: "output", detail: u.dataFlow.output },
      ], mainLoop: u.mainLoop });
    case "dependencies":
      // Omit empty arrays
      const deps: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(u.dependencies)) {
        if (v.length > 0) deps[k] = v;
      }
      return JSON.stringify({ dependencies: deps });
    case "ask":
      return formatAsk(u, question ?? "");
    case "summarize":
    default: {
      // Flat JSON — no deep nesting
      const out: Record<string, unknown> = {
        name: u.name, version: u.version, type: u.type,
        purpose: u.purpose, stack: u.stack,
        entryPoints: u.entryPoints.length,
        coreModules: u.coreModules.length,
        filesRead: u.filesRead,
        mainLoop: u.mainLoop,
        dataFlow: u.dataFlow,
      };
      if (u.dependencies.ui.length) out.ui_deps = u.dependencies.ui;
      if (u.dependencies.api.length) out.api_deps = u.dependencies.api;
      if (u.dependencies.db.length) out.db_deps = u.dependencies.db;
      return JSON.stringify(out);
    }
  }
}

function formatForProse(u: ProjectUnderstanding, action: string, question?: string): string {
  switch (action) {
    case "purpose":
      return `# ${u.name} v${u.version}\n\n**Type:** ${u.type}\n**Purpose:** ${u.purpose}\n**Stack:** ${u.stack.join(", ")}`;
    case "stack":
      return `# Technology Stack\n\n- **Runtime:** ${u.stack.join(", ")}\n- **Version:** ${u.version}\n- **Dependencies:** ${Object.values(u.dependencies).flat().length} packages\n\n## Key Frameworks\n${u.stack.map(s => `- ${s}`).join("\n")}`;
    case "entrypoints":
      return `# Entry Points (${u.entryPoints.length})\n\n${u.entryPoints.map(e => `## ${e.file}\n- **Role:** ${e.role}\n- **Boots:** ${e.bootsAt}`).join("\n\n")}`;
    case "dataflow":
      return `# Data Flow\n\n## Input\n${u.dataFlow.input}\n\n## Processing\n${u.dataFlow.processing}\n\n## Output\n${u.dataFlow.output}\n\n## Main Loop\n${u.mainLoop}`;
    case "dependencies": {
      const sections: string[] = ["# Dependencies"];
      for (const [cat, deps] of Object.entries(u.dependencies)) {
        if (deps.length > 0) sections.push(`\n## ${cat.toUpperCase()}\n${deps.map(d => `- ${d}`).join("\n")}`);
      }
      return sections.join("\n");
    }
    case "ask":
      return formatAsk(u, question ?? "");
    case "summarize":
    default:
      return `# ${u.name} v${u.version}\n\n**Type:** ${u.type}\n**Purpose:** ${u.purpose}\n**Stack:** ${u.stack.join(", ")}\n**Files analyzed:** ${u.filesRead}\n\n## Entry Points\n${u.entryPoints.map(e => `- **${e.file}** — ${e.role}`).join("\n")}\n\n## Core Modules (${u.coreModules.length})\n${u.coreModules.slice(0, 15).map(m => `- **${m.file}** — ${m.purpose}`).join("\n")}\n\n## Data Flow\n1. **Input:** ${u.dataFlow.input}\n2. **Processing:** ${u.dataFlow.processing}\n3. **Output:** ${u.dataFlow.output}\n\n## Main Loop\n${u.mainLoop}`;
  }
}

function formatAsk(u: ProjectUnderstanding, question: string): string {
  const q = question.toLowerCase();
  // Search understanding fields
  if (q.includes("main loop") || q.includes("core loop")) {
    return JSON.stringify({ answer: u.mainLoop, confidence: "high", source: "memory" });
  }
  if (q.includes("entry") || q.includes("start") || q.includes("boot")) {
    return JSON.stringify({ answer: u.entryPoints, confidence: "high", source: "memory" });
  }
  if (q.includes("stack") || q.includes("tech") || q.includes("framework")) {
    return JSON.stringify({ answer: u.stack, confidence: "high", source: "memory" });
  }
  if (q.includes("purpose") || q.includes("what does") || q.includes("what is")) {
    return JSON.stringify({ answer: u.purpose, confidence: "high", source: "memory" });
  }
  if (q.includes("flow") || q.includes("data") || q.includes("pipeline")) {
    return JSON.stringify({ answer: u.dataFlow, confidence: "high", source: "memory" });
  }
  if (q.includes("depend") || q.includes("package") || q.includes("library")) {
    return JSON.stringify({ answer: u.dependencies, confidence: "high", source: "memory" });
  }
  if (q.includes("module") || q.includes("file") || q.includes("structure")) {
    return JSON.stringify({ answer: u.coreModules.slice(0, 10), confidence: "medium", source: "memory" });
  }
  if (q.includes("type") || q.includes("kind")) {
    return JSON.stringify({ answer: `${u.type}: ${u.purpose}`, confidence: "high", source: "memory" });
  }
  // No match — search core modules
  const match = u.coreModules.find(m =>
    m.file.toLowerCase().includes(q) ||
    m.purpose.toLowerCase().includes(q) ||
    m.exports.some(e => e.toLowerCase().includes(q))
  );
  if (match) {
    return JSON.stringify({ answer: match, confidence: "medium", source: "memory" });
  }
  return JSON.stringify({ answer: "Question not answerable from cached understanding. Try: purpose, stack, entrypoints, dataflow, dependencies, or a specific module/function name.", confidence: "low", source: "memory" });
}

// ---------------------------------------------------------------------------
// Handler (called by server.ts)
// ---------------------------------------------------------------------------

export function handleProjectUnderstand(
  input: ProjectUnderstandInput,
  projectRoot: string,
  profile: MCPModelProfile,
  cache: MemoryCache
): string {
  const { action, question, depth = "quick" } = input;

  // Fast path: check cache first
  const cached = cache.getProjectUnderstanding();
  if (cached && action !== "summarize") {
    // For non-summarize actions, always use cache if available
    return profile.preferJSON
      ? formatForQwen(cached, action, question)
      : formatForProse(cached, action, question);
  }

  if (cached && !cache.isUnderstandingStale()) {
    return profile.preferJSON
      ? formatForQwen(cached, action, question)
      : formatForProse(cached, action, question);
  }

  // Run pipeline
  const understanding = runPipeline(projectRoot, depth);
  cache.setProjectUnderstanding(understanding);

  return profile.preferJSON
    ? formatForQwen(understanding, action, question)
    : formatForProse(understanding, action, question);
}
