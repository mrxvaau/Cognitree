/**
 * Memory Cache — loads CODEBASE.md once, answers queries from it.
 * Falls back to live file reads only on cache miss.
 *
 * Key design:
 * - TTL-based expiry (default 5 min, configurable via MCP_CACHE_TTL_SECONDS)
 * - Section-level querying by header, file name, or function name
 * - Hit/miss tracking for diagnostics
 * - Miss log written to mcp-server/.cache-misses.log
 */

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheStats {
  loaded_at: number;
  ttl_remaining_seconds: number;
  hit_count: number;
  miss_count: number;
  cache_size_kb: number;
  section_count: number;
}

interface Section {
  /** The full header line (e.g. "## 4. TOOL SYSTEM") */
  header: string;
  /** Header depth: 1 = #, 2 = ##, 3 = ### etc. */
  depth: number;
  /** The text content below the header (until the next same-or-higher-level header) */
  body: string;
  /** Lowercase keywords extracted from header for fast matching */
  keywords: string[];
}

// ---------------------------------------------------------------------------
// MemoryCache
// ---------------------------------------------------------------------------

export class MemoryCache {
  private raw: string | null = null;
  private sections: Section[] = [];
  private loadedAt: number = 0;
  private ttlMs: number;
  private hitCount: number = 0;
  private missCount: number = 0;
  private missLogPath: string;
  private memoryFilePath: string | null = null;

  // Project understanding cache
  private understanding: unknown | null = null;
  private understandingBuiltAt: number = 0;
  private understandingPkgMtime: number = 0;
  private static readonly UNDERSTANDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor() {
    const ttlSeconds = parseInt(process.env.MCP_CACHE_TTL_SECONDS ?? "300", 10);
    this.ttlMs = (Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 300) * 1000;
    // Miss log lives next to the built server
    this.missLogPath = path.resolve(
      process.env.MCP_MISS_LOG_PATH ??
        path.join(process.cwd(), "mcp-server", ".cache-misses.log")
    );
  }

  // ---- Loading -----------------------------------------------------------

  /** Load (or reload) CODEBASE.md from disk. */
  async load(codbaseMapPath: string): Promise<void> {
    this.memoryFilePath = codbaseMapPath;
    try {
      this.raw = await fs.readFile(codbaseMapPath, "utf-8");
      this.sections = this.parseSections(this.raw);
      this.loadedAt = Date.now();
      console.error(
        `[MemoryCache] Loaded ${this.sections.length} sections from ${codbaseMapPath} (${(Buffer.byteLength(this.raw) / 1024).toFixed(1)} KB)`
      );
    } catch (err) {
      console.error(`[MemoryCache] Failed to load ${codbaseMapPath}: ${err}`);
      this.raw = null;
      this.sections = [];
    }
  }

  /** Is the cache past its TTL? */
  isStale(): boolean {
    if (!this.raw) return true;
    return Date.now() - this.loadedAt > this.ttlMs;
  }

  /** Ensure cache is fresh — reload if stale. */
  async ensureFresh(): Promise<void> {
    if (this.isStale() && this.memoryFilePath) {
      await this.load(this.memoryFilePath);
    }
  }

  // ---- Querying ----------------------------------------------------------

  /**
   * Find a section matching the question by keyword matching against headers.
   * Returns the section body text, or null on miss.
   */
  query(question: string): string | null {
    if (!this.raw || this.sections.length === 0) {
      this.recordMiss(question, "cache_empty");
      return null;
    }

    const q = question.toLowerCase();
    const qWords = q.split(/\s+/).filter((w) => w.length > 2);

    // Score each section by how many query words appear in its header keywords
    let bestScore = 0;
    let bestSection: Section | null = null;

    for (const section of this.sections) {
      let score = 0;

      // Exact header substring match — high confidence
      if (section.header.toLowerCase().includes(q)) {
        score += 10;
      }

      // Keyword overlap
      for (const word of qWords) {
        if (section.keywords.some((kw) => kw.includes(word))) {
          score += 2;
        }
        // Also check body for the word (lower weight)
        if (section.body.toLowerCase().includes(word)) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestSection = section;
      }
    }

    // Require a minimum score to avoid false matches
    if (bestScore >= 3 && bestSection) {
      this.hitCount++;
      return `${bestSection.header}\n\n${bestSection.body}`;
    }

    this.recordMiss(question, "no_match");
    return null;
  }

  /**
   * Find sections that mention a specific file name.
   * Used for context injection — prepends relevant CODEBASE.md context to tool responses.
   */
  queryByFile(fileName: string): string | null {
    if (!this.raw || this.sections.length === 0) return null;

    const baseName = path.basename(fileName).toLowerCase();
    const matches: Section[] = [];

    for (const section of this.sections) {
      if (
        section.body.toLowerCase().includes(baseName) ||
        section.header.toLowerCase().includes(baseName)
      ) {
        matches.push(section);
      }
    }

    if (matches.length > 0) {
      this.hitCount++;
      // Return most relevant (deepest header wins for specificity)
      const best = matches.sort((a, b) => b.depth - a.depth)[0]!;
      return `${best.header}\n\n${best.body}`;
    }

    return null;
  }

  /**
   * Find sections that mention a specific function name.
   * Targets function tables in CODEBASE.md's DEEP MAP.
   */
  queryByFunction(funcName: string): string | null {
    if (!this.raw || this.sections.length === 0) return null;

    const target = funcName.toLowerCase();

    for (const section of this.sections) {
      // Look for the function name in table rows (pipe-delimited)
      if (section.body.toLowerCase().includes(`| \`${target}\` |`) ||
          section.body.toLowerCase().includes(`| ${target} |`) ||
          section.body.toLowerCase().includes(target)) {
        this.hitCount++;
        return `${section.header}\n\n${section.body}`;
      }
    }

    return null;
  }

  /** Get the full raw content. */
  getRaw(): string {
    return this.raw ?? "";
  }

  /** Clear the cache — next call triggers fresh load. Also clears understanding cache. */
  invalidate(): void {
    this.raw = null;
    this.sections = [];
    this.loadedAt = 0;
    this.understanding = null;
    this.understandingBuiltAt = 0;
    console.error("[MemoryCache] Cache invalidated (including project understanding)");
  }

  // ---- Project Understanding Cache ---------------------------------------

  /** Store a ProjectUnderstanding object in cache. */
  setProjectUnderstanding(u: unknown): void {
    this.understanding = u;
    this.understandingBuiltAt = Date.now();
    // Snapshot package.json mtime for staleness check
    try {
      const pkgPath = path.join(process.cwd(), "package.json");
      this.understandingPkgMtime = fsSync.statSync(pkgPath).mtimeMs;
    } catch {
      this.understandingPkgMtime = 0;
    }
    console.error(`[MemoryCache] Project understanding cached`);
  }

  /** Retrieve cached ProjectUnderstanding, or null if not cached. */
  getProjectUnderstanding(): any | null {
    if (!this.understanding) return null;
    if (this.isUnderstandingStale()) return null;
    return this.understanding;
  }

  /** Check if the cached understanding is stale (>10min or package.json changed). */
  isUnderstandingStale(): boolean {
    if (!this.understanding) return true;
    if (Date.now() - this.understandingBuiltAt > MemoryCache.UNDERSTANDING_TTL_MS) return true;
    // Check if package.json has been modified
    try {
      const pkgPath = path.join(process.cwd(), "package.json");
      const currentMtime = fsSync.statSync(pkgPath).mtimeMs;
      if (currentMtime !== this.understandingPkgMtime) return true;
    } catch {
      // If we can't stat, don't invalidate
    }
    return false;
  }

  /** Get cache statistics. */
  getStats(): CacheStats {
    const now = Date.now();
    const elapsed = now - this.loadedAt;
    const remaining = Math.max(0, this.ttlMs - elapsed);
    return {
      loaded_at: this.loadedAt,
      ttl_remaining_seconds: Math.round(remaining / 1000),
      hit_count: this.hitCount,
      miss_count: this.missCount,
      cache_size_kb: this.raw ? Math.round(Buffer.byteLength(this.raw) / 1024) : 0,
      section_count: this.sections.length,
    };
  }

  /** Read the miss log contents. */
  async getMissLog(): Promise<string> {
    try {
      return await fs.readFile(this.missLogPath, "utf-8");
    } catch {
      return "(no misses logged yet)";
    }
  }

  // ---- Internals ---------------------------------------------------------

  /**
   * Parse markdown into sections by splitting on headers.
   * Each section runs from its header line to the next header of equal or lesser depth.
   */
  private parseSections(markdown: string): Section[] {
    const lines = markdown.split("\n");
    const sections: Section[] = [];
    let currentHeader = "";
    let currentDepth = 0;
    let currentBody: string[] = [];

    const flush = () => {
      if (currentHeader) {
        const body = currentBody.join("\n").trim();
        sections.push({
          header: currentHeader,
          depth: currentDepth,
          body,
          keywords: this.extractKeywords(currentHeader),
        });
      }
    };

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        flush();
        currentDepth = headerMatch[1]!.length;
        currentHeader = line;
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }
    flush(); // final section

    return sections;
  }

  /** Extract lowercase keywords from a header line for matching. */
  private extractKeywords(header: string): string[] {
    return header
      .toLowerCase()
      .replace(/^#+\s*/, "")       // strip leading hashes
      .replace(/[^a-z0-9\s_.-]/g, " ")  // strip special chars
      .split(/\s+/)
      .filter((w) => w.length > 2);
  }

  /** Record a cache miss to the log file. */
  private recordMiss(question: string, reason: string): void {
    this.missCount++;
    const entry = `${new Date().toISOString()} | ${reason} | ${question}\n`;
    // Fire-and-forget write — don't block on logging
    fs.appendFile(this.missLogPath, entry).catch(() => {
      /* swallow — logging failure is not critical */
    });
  }
}
