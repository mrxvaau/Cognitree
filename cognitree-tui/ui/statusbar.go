package ui

import (
	"fmt"
	"strings"

	"cognitree-tui/model"
	"cognitree-tui/styles"
)

// RenderStatusBar renders the 1-row bottom status line.
//   normal │ ~/path │ 1.2k↑ 438↓ │ $0.0012
func RenderStatusBar(s *model.State, width int) string {
	var parts []string

	// Mode / streaming indicator
	if s.Streaming {
		parts = append(parts, styles.StyleStreaming.Render("● thinking"))
	} else if s.PendingPerm != nil {
		parts = append(parts, styles.StyleWarning.Render("● permission"))
	} else {
		parts = append(parts, styles.StyleStatusBar.Render("ready"))
	}

	// CWD
	if s.Session.Cwd != "" {
		parts = append(parts, styles.StyleStatusModel.Render(shortCwd(s.Session.Cwd)))
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

	// Pad to width
	if width > 0 {
		lineLen := len(line) // approximate; ANSI escape codes inflate len but that's OK for padding
		if lineLen < width {
			line += strings.Repeat(" ", width-lineLen)
		}
	}

	return styles.StyleStatusBar.Render(" " + line)
}
