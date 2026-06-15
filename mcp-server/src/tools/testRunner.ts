/**
 * test_runner — Run tests, list test names, or retrieve last results.
 *
 * Modes:
 *   run         — execute tests and return structured results
 *   list        — list test names without running
 *   last_result — return cached results from last run
 *
 * Auto-detects test runner from package.json (vitest > jest > bun test).
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestRunnerInput {
  pattern?: string;
  timeout?: number;
  mode: "run" | "list" | "last_result";
}

interface TestFailure {
  test: string;
  file: string;
  error: string;
  line?: number;
}

export interface TestRunnerOutput {
  mode: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  failures: TestFailure[];
  tests?: string[];
  timed_out?: boolean;
  summary: string;
  error?: string;
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// Runner detection
// ---------------------------------------------------------------------------

type Runner = "vitest" | "jest" | "bun" | null;

function detectRunner(projectRoot: string): Runner {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts ?? {};
    const devDeps = pkg.devDependencies ?? {};
    const deps = pkg.dependencies ?? {};

    // Check scripts first
    for (const val of Object.values(scripts) as string[]) {
      if (val.includes("vitest")) return "vitest";
    }
    for (const val of Object.values(scripts) as string[]) {
      if (val.includes("jest")) return "jest";
    }
    for (const val of Object.values(scripts) as string[]) {
      if (val.includes("bun test")) return "bun";
    }

    // Check dependencies
    if (devDeps.vitest || deps.vitest) return "vitest";
    if (devDeps.jest || deps.jest) return "jest";

    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Result file
// ---------------------------------------------------------------------------

const LAST_RESULT_FILE = ".last-test-result.json";

function saveLastResult(result: TestRunnerOutput, projectRoot: string): void {
  try {
    const filePath = path.join(projectRoot, LAST_RESULT_FILE);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8");
  } catch {
    /* swallow — saving cache is non-critical */
  }
}

function loadLastResult(projectRoot: string): TestRunnerOutput | null {
  try {
    const filePath = path.join(projectRoot, LAST_RESULT_FILE);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function runTests(
  runner: Runner,
  pattern: string | undefined,
  timeout: number,
  projectRoot: string
): TestRunnerOutput {
  const patternArg = pattern ? ` "${pattern}"` : "";
  let cmd: string;
  let jsonFlag: string;

  switch (runner) {
    case "vitest":
      jsonFlag = "--reporter=json";
      cmd = `npx vitest run ${jsonFlag}${patternArg}`;
      break;
    case "jest":
      jsonFlag = "--json";
      cmd = `npx jest ${jsonFlag}${patternArg}`;
      break;
    case "bun":
      cmd = `bun test${patternArg}`;
      jsonFlag = "";
      break;
    default:
      return {
        mode: "run",
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration_ms: 0,
        failures: [],
        summary: "No test runner detected",
        error: "no test runner found",
        suggestion:
          "Install vitest, jest, or bun. Add a test script to package.json.",
      };
  }

  const startTime = Date.now();
  let stdout: string;
  let timedOut = false;

  try {
    stdout = execSync(cmd, {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
    });
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; killed?: boolean; status?: number };
    // Tests that fail still return output — capture it
    if (execErr.killed) {
      timedOut = true;
      stdout = execErr.stdout ?? "";
    } else {
      stdout = execErr.stdout ?? "";
    }
  }

  const duration = Date.now() - startTime;

  // Try to parse JSON output
  const result = parseTestOutput(stdout!, runner, duration, timedOut);
  saveLastResult(result, projectRoot);
  return result;
}

function parseTestOutput(
  stdout: string,
  runner: Runner,
  duration: number,
  timedOut: boolean
): TestRunnerOutput {
  // Try JSON parsing for vitest/jest
  try {
    // Find JSON block in output (may be surrounded by other text)
    const jsonMatch = stdout.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
    if (jsonMatch) {
      const json = JSON.parse(jsonMatch[0]);
      const failures: TestFailure[] = [];

      if (json.testResults) {
        for (const suite of json.testResults) {
          if (suite.status === "failed") {
            for (const tc of suite.assertionResults ?? []) {
              if (tc.status === "failed") {
                failures.push({
                  test: tc.fullName ?? tc.title ?? "unknown",
                  file: path.basename(suite.name ?? ""),
                  error: (tc.failureMessages ?? []).join("\n").slice(0, 500),
                });
              }
            }
          }
        }
      }

      return {
        mode: "run",
        total: json.numTotalTests ?? 0,
        passed: json.numPassedTests ?? 0,
        failed: json.numFailedTests ?? 0,
        skipped: json.numPendingTests ?? 0,
        duration_ms: duration,
        failures,
        timed_out: timedOut || undefined,
        summary: `${json.numPassedTests ?? 0} passed, ${json.numFailedTests ?? 0} failed in ${(duration / 1000).toFixed(1)}s`,
      };
    }
  } catch {
    /* fall through to line counting */
  }

  // Fallback: count pass/fail lines from text output
  const lines = stdout.split("\n");
  let passed = 0;
  let failed = 0;
  for (const line of lines) {
    if (line.includes("✓") || line.includes("PASS") || line.includes("pass"))
      passed++;
    if (line.includes("✗") || line.includes("FAIL") || line.includes("fail"))
      failed++;
  }

  return {
    mode: "run",
    total: passed + failed,
    passed,
    failed,
    skipped: 0,
    duration_ms: duration,
    failures: [],
    timed_out: timedOut || undefined,
    summary: `${passed} passed, ${failed} failed in ${(duration / 1000).toFixed(1)}s (text parse)`,
  };
}

function listTests(
  runner: Runner,
  pattern: string | undefined,
  projectRoot: string
): TestRunnerOutput {
  if (!runner) {
    return {
      mode: "list",
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration_ms: 0,
      failures: [],
      summary: "No test runner detected",
      error: "no test runner found",
      suggestion: "Install vitest, jest, or bun.",
    };
  }

  try {
    let cmd: string;
    switch (runner) {
      case "vitest":
        cmd = `npx vitest list${pattern ? ` "${pattern}"` : ""}`;
        break;
      case "jest":
        cmd = `npx jest --listTests${pattern ? ` "${pattern}"` : ""}`;
        break;
      case "bun":
        cmd = `bun test --list${pattern ? ` "${pattern}"` : ""}`;
        break;
    }

    const stdout = execSync(cmd, {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: EXEC_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const tests = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return {
      mode: "list",
      total: tests.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration_ms: 0,
      failures: [],
      tests,
      summary: `${tests.length} test(s) found`,
    };
  } catch (err) {
    return {
      mode: "list",
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration_ms: 0,
      failures: [],
      summary: `Failed to list tests: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
      suggestion: "Check that the test runner is properly installed",
    };
  }
}

const EXEC_TIMEOUT = 5000;

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export function handleTestRunner(
  input: TestRunnerInput,
  projectRoot: string
): TestRunnerOutput {
  const { mode, pattern, timeout = 30000 } = input;
  const runner = detectRunner(projectRoot);

  try {
    switch (mode) {
      case "run": {
        if (!runner) {
          return {
            mode,
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration_ms: 0,
            failures: [],
            summary: "No test runner detected",
            error: "no test runner found",
            suggestion:
              "Install vitest, jest, or bun. Add a test script to package.json.",
          };
        }
        return runTests(runner, pattern, timeout, projectRoot);
      }

      case "list":
        return listTests(runner, pattern, projectRoot);

      case "last_result": {
        const last = loadLastResult(projectRoot);
        if (last) {
          last.mode = "last_result";
          return last;
        }
        return {
          mode,
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          duration_ms: 0,
          failures: [],
          summary: "No previous test results found",
          error: "no cached results",
          suggestion: "Run tests first with mode: 'run'",
        };
      }

      default:
        return {
          mode,
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          duration_ms: 0,
          failures: [],
          summary: `Unknown mode: ${mode}`,
          error: `Invalid mode: ${mode}`,
          suggestion: "Use: run, list, or last_result",
        };
    }
  } catch (err) {
    return {
      mode,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration_ms: 0,
      failures: [],
      summary: `Test runner error: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
      suggestion: "Check test configuration and runner installation",
    };
  }
}

// ---------------------------------------------------------------------------
// Tool description
// ---------------------------------------------------------------------------

export const TEST_RUNNER_DESCRIPTIONS = {
  verbose:
    "Run tests, list test names, or retrieve last results. Auto-detects test runner (vitest/jest/bun) from package.json. Mode 'run' executes tests and returns structured pass/fail/skip counts with failure details. Mode 'list' shows test names without running. Mode 'last_result' returns cached results from the previous run.",
  terse: "Run tests or list test names. Returns structured results.",
  structured:
    "// input: mode (run|list|last_result), pattern?, timeout? — test execution and reporting",
};
