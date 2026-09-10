package ui

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"

	"cognitree-tui/model"
	"cognitree-tui/styles"
)

// RenderWelcome returns the full CondensedLogo welcome screen for an empty conversation.
func RenderWelcome(s *model.State) string {
	if s.Width <= 0 {
		return ""
	}

	width := s.Width - 6
	if width > 75 {
		width = 75
	}
	if width < 34 {
		width = 34
	}

	// ── Clawd ASCII Mascot ────────────────────────────────────────────────────
	clawdArt := "  ▐▛███▜▌\n▝▜█████▛▘\n  ▜██▜"
	clawd := styles.StyleWelcomeLogo.Render(clawdArt)

	// ── Brand Title & Tagline ──────────────────────────────────────────────────
	brandTitle := styles.StyleWelcomeLogo.Render("✦✦✦ C O G N I T R E E ✦✦✦")
	brandSub := styles.StyleWelcomeHint.Render("✦ Welcome back! Let's build something amazing.")
	dividerLine := styles.StyleWelcomeLogo.Render("──────────────────────────────")

	// ── Memory check ─────────────────────────────────────────────────────────
	hasMemory := false
	cwd := s.Session.Cwd
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	if _, err := os.Stat(filepath.Join(cwd, "Cognitree.md")); err == nil {
		hasMemory = true
	} else if _, err := os.Stat(filepath.Join(cwd, "CLAUDE.md")); err == nil {
		hasMemory = true
	} else if _, err := os.Stat(filepath.Join(cwd, ".cognitree", "tree.json")); err == nil {
		hasMemory = true
	}

	var memStr string
	if hasMemory {
		memStr = styles.StyleSuccess.Render("✓ active")
	} else {
		memStr = styles.StyleMuted.Render("✗ none (try /cognitree-init)")
	}

	// ── Session Info ──────────────────────────────────────────────────────────
	timeStr := time.Now().Format("Jan 2, 2006 · 3:04 PM")
	modelName := s.Session.ModelName
	if modelName == "" {
		modelName = "z-ai/glm-5.3-free"
	}

	makeDivider := func(title string) string {
		rem := width - len(title) - 8
		if rem < 4 {
			rem = 4
		}
		return fmt.Sprintf("── %s %s", title, strings.Repeat("─", rem))
	}

	sessionDiv := styles.StyleWelcomeLogo.Render(makeDivider("◈ Session"))
	sessionContent := fmt.Sprintf(
		"  %s %s %s\n  %s %s %s %s\n  %s %s %s\n  %s %s %s",
		styles.StyleWelcomeLogo.Render("◷"), styles.StyleSubtext.Render("Time  "), timeStr,
		styles.StyleWelcomeLogo.Render("◈"), styles.StyleSubtext.Render("Model "), styles.StyleWelcomeLogo.Render(modelName), styles.StyleMuted.Render("· api"),
		styles.StyleWelcomeLogo.Render("▸"), styles.StyleSubtext.Render("Dir   "), cwd,
		styles.StyleWelcomeLogo.Render("⬤"), styles.StyleSubtext.Render("Memory"), memStr,
	)

	// ── System Info (if height >= 26) ─────────────────────────────────────────
	systemSec := ""
	if s.Height >= 26 {
		sysDiv := styles.StyleWelcomeLogo.Render(makeDivider("■ System"))
		sysContent := fmt.Sprintf(
			"  %s %s %s (%d cores)\n  %s %s %s\n  %s %s %s",
			styles.StyleWelcomeLogo.Render("⚡"), styles.StyleSubtext.Render("CPU   "), runtime.GOARCH, runtime.NumCPU(),
			styles.StyleWelcomeLogo.Render("⬦"), styles.StyleSubtext.Render("OS    "), runtime.GOOS,
			styles.StyleWelcomeLogo.Render("▫"), styles.StyleSubtext.Render("Engine"), "Go TUI v1.0.0",
		)
		systemSec = "\n" + sysDiv + "\n" + sysContent
	}

	// ── Combine Inner Sections ────────────────────────────────────────────────
	headerBox := lipgloss.JoinVertical(
		lipgloss.Center,
		clawd,
		"",
		brandTitle,
		dividerLine,
		brandSub,
		"",
	)
	inner := headerBox + "\n" + sessionDiv + "\n" + sessionContent + systemSec

	welcomeBox := styles.StyleWelcomeBox.
		Width(width).
		Render(inner)

	// Pad vertically to center in upper third of terminal
	lines := strings.Split(welcomeBox, "\n")
	boxHeight := len(lines)
	topPad := (s.Height - boxHeight) / 3
	if topPad < 0 {
		topPad = 0
	}

	var out strings.Builder
	for i := 0; i < topPad; i++ {
		out.WriteByte('\n')
	}
	out.WriteString(welcomeBox)
	return out.String()
}
