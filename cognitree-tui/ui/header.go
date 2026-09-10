package ui

import (
	"fmt"
	"path/filepath"
	"strings"

	"cognitree-tui/styles"
)

// RenderHeader renders the top-most 1-row bar:
//   COGNITREE ● │ model: <name> │ ~/<cwd> │ streaming…
func RenderHeader(modelName, cwd string, streaming bool, inputTokens, outputTokens int, width int) string {
	// ── Brand ────────────────────────────────────────────────────────────────
	brand := " COGNITREE "

	// ── Streaming dot ────────────────────────────────────────────────────────
	dot := ""
	if streaming {
		dot = styles.StyleStreaming.Render(styles.IconDot) + " "
	}

	// ── Model ────────────────────────────────────────────────────────────────
	shortModel := shortModelName(modelName)
	modelSeg := " " + shortModel + " "

	// ── CWD (last 2 path components) ─────────────────────────────────────────
	cwdSeg := " " + shortCwd(cwd) + " "

	// ── Token counts ─────────────────────────────────────────────────────────
	tokenSeg := ""
	if inputTokens > 0 || outputTokens > 0 {
		tokenSeg = fmt.Sprintf(" %s↑ %s↓ ", humanTokens(inputTokens), humanTokens(outputTokens))
	}

	// ── Assemble ─────────────────────────────────────────────────────────────
	left := styles.StyleHeader.Render(brand)
	middle := styles.StyleHeaderRight.Render(dot+modelSeg+"│"+cwdSeg)
	right := ""
	if tokenSeg != "" {
		right = styles.StyleHeaderRight.Render(tokenSeg)
	}

	// Pad the middle to fill available space.
	leftLen := len(brand) // visual width approximation
	rightLen := len(tokenSeg)
	pad := width - leftLen - rightLen - len(dot+modelSeg+"│"+cwdSeg)
	if pad > 0 {
		middle += strings.Repeat(" ", pad)
	}

	return left + middle + right
}

// ─── Header component helpers ─────────────────────────────────────────────────

// shortCwd keeps the last 2 path components.
func shortCwd(cwd string) string {
	if cwd == "" {
		return "~"
	}
	cwd = filepath.ToSlash(cwd)
	parts := strings.Split(strings.TrimRight(cwd, "/"), "/")
	if len(parts) <= 2 {
		return "~/" + strings.Join(parts, "/")
	}
	return "~/" + strings.Join(parts[len(parts)-2:], "/")
}

// shortModelName removes common provider prefixes that add noise.
// Non-standard providers (z-ai/, deepseek/, etc.) are kept as-is.
func shortModelName(name string) string {
	for _, prefix := range []string{"anthropic/", "openai/", "ollama/"} {
		name = strings.TrimPrefix(name, prefix)
	}
	// Truncate to 36 chars max (generous — model names like z-ai/glm-5.3-free need space)
	if len(name) > 36 {
		name = name[:33] + "…"
	}
	return name
}

// humanTokens formats token count as "1.2k" or "12k".
func humanTokens(n int) string {
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}
	if n < 10000 {
		return fmt.Sprintf("%.1fk", float64(n)/1000)
	}
	return fmt.Sprintf("%dk", n/1000)
}
