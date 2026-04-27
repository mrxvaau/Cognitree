/**
 * git_history — Git blame, log, diff for any file in the project.
 *
 * Actions:
 *   log         — recent commits touching a file
 *   blame       — who wrote each line (with optional line range)
 *   diff        — diff of last commit for a file
 *   who_changed — top authors by line count from blame
 */

import { execSync } from "node:child_process";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHistoryInput {
  file?: string;
  lines?: string;
  depth?: number;
  action: "log" | "blame" | "diff" | "who_changed";
}

interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
  files_changed: number;
}

interface BlameLine {
  line: number;
  author: string;
  date: string;
  commit: string;
  code: string;
}

export interface GitHistoryOutput {
  action: string;
  file?: string;
  commits?: CommitInfo[];
  blame?: BlameLine[];
  diff?: string;
  who_changed?: Array<{ author: string; lines: number }>;
  summary: string;
  error?: string;
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXEC_TIMEOUT = 5000; // 5 seconds max

function execGit(cmd: string, cwd: string): string {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    timeout: EXEC_TIMEOUT,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function isGitAvailable(cwd: string): boolean {
  try {
    execGit("git rev-parse --is-inside-work-tree", cwd);
    return true;
  } catch {
    return false;
  }
}

function isFileTracked(file: string, cwd: string): boolean {
  try {
    execGit(`git ls-files --error-unmatch "${file}"`, cwd);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function gitLog(
  file: string | undefined,
  depth: number,
  cwd: string
): CommitInfo[] {
  const fileArg = file ? `-- "${file}"` : "";
  const raw = execGit(
    `git log --oneline --format="%H|%an|%ai|%s" -n ${depth} ${fileArg}`,
    cwd
  );
  if (!raw) return [];
  return raw.split("\n").map((line) => {
    const [hash, author, date, ...msgParts] = line.split("|");
    return {
      hash: hash?.slice(0, 8) ?? "",
      author: author ?? "",
      date: date?.split(" ")[0] ?? "",
      message: msgParts.join("|"),
      files_changed: 0,
    };
  });
}

function gitBlame(
  file: string,
  lines: string | undefined,
  cwd: string
): BlameLine[] {
  const lineArg = lines ? `-L ${lines}` : "";
  const raw = execGit(`git blame ${lineArg} --porcelain "${file}"`, cwd);

  const result: BlameLine[] = [];
  const blameLines = raw.split("\n");
  let currentCommit = "";
  let currentAuthor = "";
  let currentDate = "";
  let currentLineNum = 0;

  for (const bl of blameLines) {
    if (bl.match(/^[0-9a-f]{40}\s/)) {
      const parts = bl.split(" ");
      currentCommit = parts[0]?.slice(0, 8) ?? "";
      currentLineNum = parseInt(parts[2] ?? "0", 10);
    } else if (bl.startsWith("author ")) {
      currentAuthor = bl.slice(7);
    } else if (bl.startsWith("author-time ")) {
      const ts = parseInt(bl.slice(12), 10);
      currentDate = new Date(ts * 1000).toISOString().split("T")[0] ?? "";
    } else if (bl.startsWith("\t")) {
      result.push({
        line: currentLineNum,
        author: currentAuthor,
        date: currentDate,
        commit: currentCommit,
        code: bl.slice(1),
      });
    }
  }
  return result;
}

function gitDiff(file: string | undefined, cwd: string): string {
  const fileArg = file ? `-- "${file}"` : "";
  try {
    return execGit(`git diff HEAD~1 HEAD ${fileArg}`, cwd);
  } catch {
    return "(no diff available — may be first commit)";
  }
}

function whoChanged(
  file: string,
  cwd: string
): Array<{ author: string; lines: number }> {
  const blameResult = gitBlame(file, undefined, cwd);
  const counts = new Map<string, number>();
  for (const bl of blameResult) {
    counts.set(bl.author, (counts.get(bl.author) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([author, lines]) => ({ author, lines }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 3);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export function handleGitHistory(
  input: GitHistoryInput,
  projectRoot: string
): GitHistoryOutput {
  if (!isGitAvailable(projectRoot)) {
    return {
      action: input.action,
      summary: "git is not available",
      error: "git not found",
      suggestion: "Install git and ensure it is in PATH",
    };
  }

  const { action, file, lines, depth = 10 } = input;

  if (file && !isFileTracked(file, projectRoot)) {
    return {
      action,
      file,
      summary: `File ${file} is not tracked by git`,
      error: "file not tracked",
      suggestion: `git add ${file}`,
    };
  }

  try {
    switch (action) {
      case "log": {
        const commits = gitLog(file, depth, projectRoot);
        return {
          action,
          file,
          commits,
          summary: `${commits.length} commit(s)${file ? ` touching ${file}` : ""}`,
        };
      }

      case "blame": {
        if (!file) {
          return {
            action,
            summary: "file is required for blame",
            error: "missing file",
            suggestion: "Provide a file path",
          };
        }
        const blame = gitBlame(file, lines, projectRoot);
        return {
          action,
          file,
          blame,
          summary: `${blame.length} line(s) blamed in ${file}${lines ? ` (lines ${lines})` : ""}`,
        };
      }

      case "diff": {
        const diff = gitDiff(file, projectRoot);
        const lineCount = diff.split("\n").length;
        return {
          action,
          file,
          diff,
          summary: `${lineCount} line(s) of diff${file ? ` in ${file}` : ""}`,
        };
      }

      case "who_changed": {
        if (!file) {
          return {
            action,
            summary: "file is required for who_changed",
            error: "missing file",
            suggestion: "Provide a file path",
          };
        }
        const authors = whoChanged(file, projectRoot);
        const topAuthor = authors[0];
        return {
          action,
          file,
          who_changed: authors,
          summary: topAuthor
            ? `Top contributor: ${topAuthor.author} (${topAuthor.lines} lines)`
            : "No blame data available",
        };
      }

      default:
        return {
          action,
          summary: `Unknown action: ${action}`,
          error: `Invalid action: ${action}`,
          suggestion: "Use: log, blame, diff, or who_changed",
        };
    }
  } catch (err) {
    return {
      action,
      file,
      summary: `Git error: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
      suggestion: "Check that the file exists and git is configured",
    };
  }
}

// ---------------------------------------------------------------------------
// Tool description (for modelAdapter BASE_DESCRIPTIONS)
// ---------------------------------------------------------------------------

export const GIT_HISTORY_DESCRIPTIONS = {
  verbose:
    "Query git history for any file in the project. Actions: 'log' shows recent commits, 'blame' shows who wrote each line (with optional line range), 'diff' shows changes from last commit, 'who_changed' ranks authors by line count. All output includes structured data plus a human-readable summary.",
  terse: "Git log, blame, diff, or author ranking for a file.",
  structured:
    "// input: action (log|blame|diff|who_changed), file?, lines?, depth? — git history query",
};
