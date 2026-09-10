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

// RenderWelcome renders a minimal, clean welcome screen.
//
// Layout (top → bottom):
//
//	[vertical padding]
//	[logo: "c o g n i" white + "t r e e" green, letter-spaced, bold]
//	[subtitle: YOUR CODING PARTNER THAT REMEMBERS]
//	[empty]
//	[empty]
//	[input preview box: left green bar, dark bg — perfectly centered]
//	[keybindings: right-aligned under box]
//	[tip: centered at bottom]
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

	// ── 1. Logo — letter-spaced "c o g n i" white + "t r e e" green ─────────
	cogniPart := styles.StyleWelcomeLogoWhite.Render(letterSpace("cogni"))
	treePart := styles.StyleWelcomeLogoGreen.Render(letterSpace("tree"))
	logo := cogniPart + "  " + treePart

	// ── 2. Subtitle ───────────────────────────────────────────────────────────
	subtitle := styles.StyleWelcomeKeyMuted.Render("Y O U R   C O D I N G   P A R T N E R   T H A T   R E M E M B E R S")

	// ── 3. Memory check (silent — show only if active) ───────────────────────
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

	// ── 4. Model + Provider ───────────────────────────────────────────────────
	modelName := s.Session.ModelName
	if modelName == "" || modelName == "..." {
		modelName = "connecting…"
	}
	provider := s.Session.Provider
	if provider == "" {
		provider = "anthropic"
	}

	// ── 5. Input preview box ──────────────────────────────────────────────────
	placeholderLine := styles.StyleWelcomeKeyMuted.Render("Ask anything…")

	buildLabel := styles.StyleWelcomeLogoGreen.Render("Build")
	dot := styles.StyleWelcomeKeyMuted.Render("·")
	modelLabel := styles.StyleWelcomeLogoWhite.Render(modelName)
	providerLabel := styles.StyleWelcomeKeyMuted.Render(provider)
	metaLine := fmt.Sprintf("%s %s %s   %s", buildLabel, dot, modelLabel, providerLabel)
	if hasMemory {
		metaLine = metaLine + "   " + styles.StyleWelcomeLogoGreen.Render("● memory active")
	}

	boxInner := lipgloss.JoinVertical(lipgloss.Left,
		placeholderLine,
		"",
		metaLine,
	)

	// innerWidth = boxWidth minus: left border(1) + left pad(2) + right pad(2)
	innerWidth := boxWidth - 5
	if innerWidth < 20 {
		innerWidth = 20
	}
	inputBox := styles.StyleWelcomeInputBox.Width(innerWidth).Render(boxInner)

	// ── 6. Keybindings row (right-aligned, same width as box) ────────────────
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

	// ── 7. Tip row ────────────────────────────────────────────────────────────
	tip := fmt.Sprintf("%s  %s  %s",
		styles.StyleWelcomeLogoGreen.Render("●"),
		styles.StyleWelcomeTipGreen.Render("Tip"),
		styles.StyleWelcomeTipMuted.Render("Use /help to see available commands"),
	)
	tipRow := lipgloss.NewStyle().
		Width(boxWidth).
		Align(lipgloss.Center).
		Render(tip)

	// ── 8. Horizontal centering using PlaceHorizontal ─────────────────────────
	// PlaceHorizontal is ANSI-aware unlike Width().Align() on pre-rendered strings.
	place := func(content string) string {
		return lipgloss.PlaceHorizontal(s.Width, lipgloss.Center, content)
	}

	centeredLogo := place(logo)
	centeredSubtitle := place(subtitle)
	// Manual centering for inputBox — lipgloss.Width() reads visible cell width
	// correctly even with ANSI codes, giving pixel-perfect horizontal placement.
	var centeredBox string
	{
		bw := lipgloss.Width(inputBox)
		leftPad := (s.Width - bw) / 2
		if leftPad < 0 {
			leftPad = 0
		}
		centeredBox = strings.Repeat(" ", leftPad) + inputBox
	}
	centeredKeys := place(keybindings)
	centeredTip := place(tipRow)

	// ── 9. Stack all elements ─────────────────────────────────────────────────
	stacked := strings.Join([]string{
		"",            // breathing room above logo
		"",
		centeredLogo,
		"",            // breathing room below logo
		centeredSubtitle,
		"",
		"",
		centeredBox,
		"",
		centeredKeys,
	}, "\n")

	// ── 10. Vertical centering ────────────────────────────────────────────────
	contentLines := strings.Split(stacked, "\n")
	topPad := (s.Height - len(contentLines) - 3) / 3 // 3 = tip row + 2 gap lines
	if topPad < 0 {
		topPad = 0
	}

	var out strings.Builder
	for i := 0; i < topPad; i++ {
		out.WriteByte('\n')
	}
	out.WriteString(stacked)
	out.WriteString("\n\n")
	out.WriteString(centeredTip)

	return out.String()
}

// letterSpace inserts a space between every character: "cogni" → "c o g n i"
func letterSpace(s string) string {
	runes := []rune(s)
	parts := make([]string, len(runes))
	for i, r := range runes {
		parts[i] = string(r)
	}
	return strings.Join(parts, " ")
}
