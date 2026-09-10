package ui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"

	"cognitree-tui/model"
)

func RenderWelcome(s *model.State) string {
	header := RenderHeader(
		s.Session.ModelName,
		s.Session.Cwd,
		s.Streaming,
		s.InputTokens,
		s.OutputTokens,
		s.Width,
	)

	// Fixed box, manually centered
	box := lipgloss.NewStyle().
		Background(lipgloss.Color("#1a1a1a")).
		BorderLeft(true).
		BorderStyle(lipgloss.ThickBorder()).
		BorderForeground(lipgloss.Color("#10B981")).
		Padding(1, 2).
		Width(50).
		Render("Ask anything...\n\n" + s.Session.ModelName)

	bw := lipgloss.Width(box)
	pad := (s.Width - bw) / 2
	if pad < 0 {
		pad = 0
	}
	centeredBox := strings.Repeat(" ", pad) + box

	// Vertical centering
	lines := strings.Count(centeredBox, "\n") + 1
	topPad := (s.Height - 1 - lines) / 2
	if topPad < 2 {
		topPad = 2
	}

	var out strings.Builder
	out.WriteString(header)
	for i := 0; i < topPad; i++ {
		out.WriteByte('\n')
	}
	out.WriteString(centeredBox)

	return out.String()
}
