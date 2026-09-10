package ui

import (
	"fmt"
	"strings"

	"cognitree-tui/model"
	"cognitree-tui/styles"
)

// RenderWelcome returns the full welcome screen for an empty conversation.
func RenderWelcome(s *model.State) string {
	if s.Width <= 0 {
		return ""
	}

	// ── ASCII logo ────────────────────────────────────────────────────────────
	logo := styles.StyleWelcomeLogo.Render(styles.WelcomeLogo)

	// ── Subtitle line ─────────────────────────────────────────────────────────
	subtitle := styles.StyleWelcomeTitle.Render("AI Coding Assistant")

	// ── Session info ─────────────────────────────────────────────────────────
	model := styles.StyleWelcomeSubtitle.Render(fmt.Sprintf("Model  │ %s", s.Session.ModelName))
	cwd := styles.StyleWelcomeSubtitle.Render(fmt.Sprintf("CWD    │ %s", s.Session.Cwd))

	// ── Hints ─────────────────────────────────────────────────────────────────
	hint1 := styles.StyleWelcomeHint.Render("Type a message and press Enter to start")
	hint2 := styles.StyleWelcomeHint.Render("Type / to see available commands")

	inner := logo + "\n\n" +
		subtitle + "\n\n" +
		model + "\n" +
		cwd + "\n\n" +
		hint1 + "\n" +
		hint2

	// ── Center the box ────────────────────────────────────────────────────────
	box := styles.StyleWelcomeBox.Render(inner)

	// Pad vertically so it sits roughly in the upper third.
	lines := strings.Split(box, "\n")
	boxHeight := len(lines)
	topPad := (s.Height - boxHeight) / 3
	if topPad < 0 {
		topPad = 0
	}
	var out strings.Builder
	for i := 0; i < topPad; i++ {
		out.WriteByte('\n')
	}
	out.WriteString(box)
	return out.String()
}
