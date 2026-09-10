package ui

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"cognitree-tui/styles"
)

// RenderHeader renders the top-most 1-row bar:
//   COGNITREE ● │ model: <name> │ ~/<cwd> │ streaming…
func RenderHeader(modelName, cwd string, streaming bool, inputTokens, outputTokens int, width int) string {
	brand := " COGNITREE "

	dot := ""
	if streaming {
		dot = styles.StyleStreaming.Render(styles.IconDot) + " "
	}

	shortModel := shortModelName(modelName)
	modelSeg := " " + shortModel + " "
	cwdSeg := " " + shortCwd(cwd) + " "

	tokenSeg := ""
	if inputTokens > 0 || outputTokens > 0 {
		tokenSeg = fmt.Sprintf(" %s↑ %s↓ ", humanTokens(inputTokens), humanTokens(outputTokens))
	}

	left := styles.StyleHeader.Render(brand)
	middleContent := dot + modelSeg + "│" + cwdSeg
	middle := styles.StyleHeaderRight.Render(middleContent)
	right := ""
	if tokenSeg != "" {
		right = styles.StyleHeaderRight.Render(tokenSeg)
	}

	// Exact printed column widths using lipgloss.Width()
	leftWidth := lipgloss.Width(left)
	middleWidth := lipgloss.Width(middle)
	rightWidth := lipgloss.Width(right)

	pad := width - leftWidth - middleWidth - rightWidth
	if pad > 0 {
		middle += styles.StyleHeaderRight.Render(strings.Repeat(" ", pad))
	}

	return left + middle + right
}

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
func shortModelName(name string) string {
	for _, prefix := range []string{"anthropic/", "openai/", "ollama/"} {
		name = strings.TrimPrefix(name, prefix)
	}
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
