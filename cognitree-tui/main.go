package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"cognitree-tui/protocol"
)

func main() {
	// ── CLI flags ──────────────────────────────────────────────────────────────
	modelFlag  := flag.String("model",  "", "LLM model name (default: LLM_MODEL env or auto)")
	dirFlag    := flag.String("dir",    "", "Working directory for the backend (default: cwd)")
	cliFlag    := flag.String("cli",    "", "Path to dist/cli.mjs (default: auto-detect)")
	urlFlag    := flag.String("url",    "", "LLM base URL, e.g. http://localhost:11434/v1")
	apikeyFlag := flag.String("apikey", "", "LLM API key")
	flag.Parse()

	// ── Resolve working directory ──────────────────────────────────────────────
	workDir := *dirFlag
	if workDir == "" {
		var err error
		workDir, err = os.Getwd()
		if err != nil {
			fmt.Fprintf(os.Stderr, "getwd: %v\n", err)
			os.Exit(1)
		}
	}

	// ── Resolve cli.mjs path ───────────────────────────────────────────────────
	cliMjs := *cliFlag
	if cliMjs == "" {
		exe, _ := os.Executable()
		searchDir := filepath.Dir(exe)
		for i := 0; i < 6; i++ {
			candidate := filepath.Join(searchDir, "dist", "cli.mjs")
			if _, statErr := os.Stat(candidate); statErr == nil {
				cliMjs = candidate
				break
			}
			parent := filepath.Dir(searchDir)
			if parent == searchDir {
				break
			}
			searchDir = parent
		}
	}
	if cliMjs == "" {
		candidate := filepath.Join(workDir, "dist", "cli.mjs")
		if _, err := os.Stat(candidate); err == nil {
			cliMjs = candidate
		}
	}
	if cliMjs == "" {
		fmt.Fprintln(os.Stderr, "Cannot find dist/cli.mjs. Pass -cli <path> explicitly.")
		os.Exit(1)
	}

	// ── Build env overrides for the backend process ────────────────────────────
	envOverrides := os.Environ()
	if *urlFlag != "" {
		envOverrides = setEnv(envOverrides, "LLM_BASE_URL", *urlFlag)
	}
	if *apikeyFlag != "" {
		envOverrides = setEnv(envOverrides, "LLM_API_KEY", *apikeyFlag)
	}
	if *modelFlag != "" {
		envOverrides = setEnv(envOverrides, "LLM_MODEL", *modelFlag)
	}
	llmURL := getEnvVal(envOverrides, "LLM_BASE_URL")
	if llmURL != "" {
		envOverrides = setEnvIfAbsent(envOverrides, "CLAUDE_CODE_SIMPLE", "1")
		envOverrides = setEnvIfAbsent(envOverrides, "CLAUDE_CODE_NO_FLICKER", "1")
		envOverrides = setEnvIfAbsent(envOverrides, "CLAUDE_CODE_DISABLE_THINKING", "1")
	}

	// ── Determine initial model name for the header ────────────────────────────
	effectiveModel := *modelFlag
	if effectiveModel == "" {
		effectiveModel = getEnvVal(envOverrides, "LLM_MODEL")
	}
	// Don't pretend to know the model if nothing is configured.
	if effectiveModel == "" {
		effectiveModel = "connecting…"
	}

	// ── Spawn the TS backend ───────────────────────────────────────────────────
	backend, err := protocol.Spawn(cliMjs, workDir, envOverrides)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start backend: %v\n\n", err)
		fmt.Fprintln(os.Stderr, "  • Ensure 'bun' is installed and on PATH.")
		fmt.Fprintf(os.Stderr, "  • CLI path: %s\n", cliMjs)
		os.Exit(1)
	}
	defer backend.Kill()

	// ── Create the App ─────────────────────────────────────────────────────────
	app := newApp(backend, effectiveModel)

	// ── Create Bubble Tea program ──────────────────────────────────────────────
	p := tea.NewProgram(app,
		tea.WithAltScreen(),
		tea.WithMouseCellMotion(),
	)

	// Wire backend stdout → program messages.
	go backend.ReadLoop(p)

	// If a model was explicitly requested, send set_model after boot settles.
	if *modelFlag != "" {
		go func() {
			time.Sleep(600 * time.Millisecond)
			_ = backend.SendSetModel("set-model-boot", *modelFlag)
		}()
	}

	// ── Run the TUI (blocks until quit) ───────────────────────────────────────
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "TUI error: %v\n", err)
		os.Exit(1)
	}
}

// ─── Environment helpers ──────────────────────────────────────────────────────

func setEnv(env []string, key, value string) []string {
	prefix := key + "="
	result := make([]string, 0, len(env))
	for _, e := range env {
		if len(e) >= len(prefix) && e[:len(prefix)] == prefix {
			continue
		}
		result = append(result, e)
	}
	return append(result, key+"="+value)
}

func setEnvIfAbsent(env []string, key, value string) []string {
	prefix := key + "="
	for _, e := range env {
		if len(e) >= len(prefix) && e[:len(prefix)] == prefix {
			return env
		}
	}
	return append(env, key+"="+value)
}

func getEnvVal(env []string, key string) string {
	prefix := key + "="
	for _, e := range env {
		if len(e) >= len(prefix) && e[:len(prefix)] == prefix {
			return e[len(prefix):]
		}
	}
	return ""
}
