package ui

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"cognitree-tui/model"
	"cognitree-tui/styles"
)

// RenderWelcome renders a minimal OpenCode-style welcome screen:
//
//	[logo: "cogni" white + "tree" green, large]
//	[subtitle: YOUR CODING PARTNER THAT REMEMBERS]
//	[empty]
//	[input preview box: left green border, dark bg]
//	[empty]
//	[keybindings: right-aligned]
//	[tip: centered]
func RenderWelcome(s *model.State) string {
	if s.Width <= 0 {
		return ""
	}

	// ── Box width: ~60% of terminal, clamped ─────────────────────────────────
	boxWidth := (s.Width * 60) / 100
	if boxWidth > 72 {
		boxWidth = 72
	}
	if boxWidth < 40 {
		boxWidth = 40
	}

	// ── 1. Logo — "cogni" white bold + "tree" green bold ─────────────────────
	cogni := styles.StyleWelcomeLogoWhite.Render("cogni")
	tree := styles.StyleWelcomeLogoGreen.Render("tree")
	logo := cogni + tree

	// ── 2. Subtitle (letter-spaced simulation) ────────────────────────────────
	subtitle := styles.StyleWelcomeKeyMuted.Render("Y O U R   C O D I N G   P A R T N E R   T H A T   R E M E M B E R S")

	// ── 3. Memory check (silent — only show if active) ───────────────────────
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

	// ── 4. Model name ─────────────────────────────────────────────────────────
	modelName := s.Session.ModelName
	if modelName == "" || modelName == "..." {
		modelName = "connecting…"
	}

	// ── 5. Input preview box ──────────────────────────────────────────────────
	placeholderLine := styles.StyleWelcomeKeyMuted.Render("Ask anything…")

	buildLabel := styles.StyleWelcomeLogoGreen.Render("Build")
	dot := styles.StyleWelcomeKeyMuted.Render("·")
	modelLabel := styles.StyleWelcomeLogoWhite.Render(modelName)
	engineLabel := styles.StyleWelcomeKeyMuted.Render("Experimental Labs")
	metaLine := fmt.Sprintf("%s %s %s   %s", buildLabel, dot, modelLabel, engineLabel)

	if hasMemory {
		memBadge := styles.StyleWelcomeLogoGreen.Render("● memory active")
		metaLine = metaLine + "   " + memBadge
	}

	// inner content of box: placeholder + blank + meta
	boxInner := lipgloss.JoinVertical(
		lipgloss.Left,
		placeholderLine,
		"",
		metaLine,
	)

	// Render box: left-only thick green border, dark bg, width-constrained
	// We set inner width = boxWidth minus the left border (1) and padding (2+2)
	innerWidth := boxWidth - 5
	if innerWidth < 20 {
		innerWidth = 20
	}

	inputBox := styles.StyleWelcomeInputBox.
		Width(innerWidth).
		Render(boxInner)

	// ── 6. Keybindings row (right-aligned to boxWidth) ────────────────────────
	kb := fmt.Sprintf("%s%s   %s%s   %s%s",
		styles.StyleWelcomeKeyBold.Render("tab"),
		styles.StyleWelcomeKeyMuted.Render(" agents"),
		styles.StyleWelcomeKeyBold.Render("ctrl+p"),
		styles.StyleWelcomeKeyMuted.Render(" commands"),
		styles.StyleWelcomeKeyBold.Render("ctrl+s"),
		styles.StyleWelcomeKeyMuted.Render(" settings"),
	)
	keybindings := lipgloss.NewStyle().
		Width(boxWidth).
		Align(lipgloss.Right).
		Render(kb)

	// ── 7. Tip row (centered to boxWidth) ────────────────────────────────────
	tip := fmt.Sprintf("%s  %s  %s",
		styles.StyleWelcomeLogoGreen.Render("●"),
		styles.StyleWelcomeTipGreen.Render("Tip"),
		styles.StyleWelcomeTipMuted.Render("Use /help to see available commands"),
	)
	tipRow := lipgloss.NewStyle().
		Width(boxWidth).
		Align(lipgloss.Center).
		Render(tip)

	// ── 8. Center each element horizontally in the terminal ──────────────────
	centerStyle := lipgloss.NewStyle().Width(s.Width).Align(lipgloss.Center)
	rightStyle := lipgloss.NewStyle().Width(s.Width).Align(lipgloss.Center)

	centeredLogo := centerStyle.Render(logo)
	centeredSubtitle := centerStyle.Render(subtitle)
	centeredBox := centerStyle.Render(inputBox)
	centeredKeys := rightStyle.Render(keybindings)
	centeredTip := centerStyle.Render(tipRow)

	// ── 9. Stack elements ────────────────────────────────────────────────────
	stacked := strings.Join([]string{
		centeredLogo,
		centeredSubtitle,
		"",
		"",
		centeredBox,
		"",
		centeredKeys,
	}, "\n")

	// ── 10. Vertical centering (upper third) ─────────────────────────────────
	contentLines := strings.Split(stacked, "\n")
	contentHeight := len(contentLines)

	// reserve 3 rows at bottom for tip + breathing room
	availH := s.Height - 4
	topPad := (availH - contentHeight) / 3
	if topPad < 0 {
		topPad = 0
	}

	var out strings.Builder
	for i := 0; i < topPad; i++ {
		out.WriteByte('\n')
	}
	out.WriteString(stacked)
	// tip pinned near bottom with some gap
	out.WriteString("\n\n")
	out.WriteString(centeredTip)

	return out.String()
}
