package ui

import (
	"fmt"
	"strings"

	"cognitree-tui/model"
	"cognitree-tui/slash"
	"cognitree-tui/styles"
)

// RenderSlashOverlay renders the floating typeahead above the input bar.
// Returns "" when there are no matches to show.
func RenderSlashOverlay(s *model.State) string {
	if s.InputMode != model.ModeSlash || len(s.SlashMatches) == 0 {
		return ""
	}

	const maxVisible = 8
	items := s.SlashMatches
	if len(items) > maxVisible {
		items = items[:maxVisible]
	}

	var rows []string
	for i, cmd := range items {
		name := fmt.Sprintf("/%s", cmd.Name)
		desc := cmd.Description
		row := renderSlashRow(name, desc, i == s.SlashSelected, s.Width)
		rows = append(rows, row)
	}

	hint := styles.StyleMuted.Render("  ↑↓ navigate · Tab accept · Esc cancel")
	content := strings.Join(rows, "\n") + "\n" + hint

	overlayWidth := 60
	if s.Width > 0 && s.Width < 64 {
		overlayWidth = s.Width - 4
	}

	return styles.StyleSlashOverlay.Width(overlayWidth).Render(content)
}

func renderSlashRow(name, desc string, selected bool, width int) string {
	maxDesc := 40
	if len(desc) > maxDesc {
		desc = desc[:maxDesc-1] + "…"
	}
	nameStr := slash.FormatName(name)
	descStr := slash.FormatDesc(desc)

	if selected {
		return styles.StyleSlashSelected.Render(nameStr + "  " + descStr)
	}
	return styles.StyleSlashUnselected.Render(nameStr) + "  " + styles.StyleSlashDesc.Render(descStr)
}
