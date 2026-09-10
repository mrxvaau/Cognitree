package ui

import (
	"fmt"
	"strings"

	"cognitree-tui/model"
	"cognitree-tui/slash"
	"cognitree-tui/styles"
)

// RenderSlashOverlay renders the floating typeahead above the input bar with sliding window.
// Returns "" when there are no matches to show.
func RenderSlashOverlay(s *model.State) string {
	if s.InputMode != model.ModeSlash || len(s.SlashMatches) == 0 {
		return ""
	}

	total := len(s.SlashMatches)
	const maxVisible = 7

	// ── Calculate sliding viewport range based on SlashSelected ──────────────
	start := 0
	if s.SlashSelected >= maxVisible {
		start = s.SlashSelected - maxVisible + 1
	}
	end := start + maxVisible
	if end > total {
		end = total
	}

	var rows []string

	// Scroll indicator for items above
	if start > 0 {
		topHint := styles.StyleMuted.Render(fmt.Sprintf("  ▲ %d more above...", start))
		rows = append(rows, topHint)
	}

	for i := start; i < end; i++ {
		cmd := s.SlashMatches[i]
		name := fmt.Sprintf("/%s", cmd.Name)
		desc := cmd.Description
		row := renderSlashRow(name, desc, i == s.SlashSelected, s.Width)
		rows = append(rows, row)
	}

	// Scroll indicator for items below
	if end < total {
		bottomHint := styles.StyleMuted.Render(fmt.Sprintf("  ▼ %d more below...", total-end))
		rows = append(rows, bottomHint)
	}

	// Counter & navigation hint bar
	counterStr := fmt.Sprintf("[%d/%d]", s.SlashSelected+1, total)
	hint := styles.StyleMuted.Render(fmt.Sprintf("  %s  ↑↓ navigate · Tab accept · Esc cancel", counterStr))
	rows = append(rows, hint)

	content := strings.Join(rows, "\n")

	overlayWidth := 64
	if s.Width > 0 && s.Width < 68 {
		overlayWidth = s.Width - 4
	}

	return styles.StyleSlashOverlay.Width(overlayWidth).Render(content)
}

func renderSlashRow(name, desc string, selected bool, width int) string {
	maxDesc := 38
	if len(desc) > maxDesc {
		desc = desc[:maxDesc-1] + "…"
	}
	nameStr := slash.FormatName(name)
	descStr := slash.FormatDesc(desc)

	if selected {
		return styles.StyleSlashSelected.Render("▶ " + nameStr + "  " + descStr)
	}
	return styles.StyleSlashUnselected.Render("  " + nameStr) + "  " + styles.StyleSlashDesc.Render(descStr)
}
