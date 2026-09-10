package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"cognitree-tui/model"
	"cognitree-tui/styles"
)

// RenderStatusBar renders the 1-row bottom status line matching TS StatusLine.tsx.
//   ready │ ~/path │ 1.2k↑ 438↓ │ $0.0012
func RenderStatusBar(s *model.State, width int) string {
	var parts []string

	// Mode / status indicator
	if s.Streaming {
		parts = append(parts, styles.StyleStreaming.Render("● thinking..."))
	} else if s.PendingPerm != nil {
		parts = append(parts, styles.StyleWarning.Render("● permission required"))
	} else {
		parts = append(parts, styles.StyleSuccess.Render("● ready"))
	}

	// CWD
	if s.Session.Cwd != "" {
		parts = append(parts, styles.StyleStatusModel.Render(shortCwd(s.Session.Cwd)))
	}

	// Model
	if s.Session.ModelName != "" {
		parts = append(parts, styles.StyleStatusModel.Render(shortModelName(s.Session.ModelName)))
	}

	// Token counts
	if s.InputTokens > 0 || s.OutputTokens > 0 {
		parts = append(parts,
			styles.StyleStatusTokens.Render(
				fmt.Sprintf("%s↑ %s↓",
					humanTokens(s.InputTokens),
					humanTokens(s.OutputTokens),
				),
			),
		)
	}

	// Cost
	if s.TotalCostUSD > 0 {
		parts = append(parts, styles.StyleStatusCost.Render(fmt.Sprintf("$%.4f", s.TotalCostUSD)))
	}

	// Status message (transient)
	if s.StatusMsg != "" {
		parts = append(parts, styles.StyleSubtext.Render(s.StatusMsg))
	}

	sep := styles.StyleStatusSep.Render(styles.Sep)
	line := strings.Join(parts, sep)
	content := " " + line

	visWidth := lipgloss.Width(content)
	if width > visWidth {
		content += strings.Repeat(" ", width-visWidth)
	}

	return styles.StyleStatusBar.Render(content)
}
