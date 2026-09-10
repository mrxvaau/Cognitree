package ui

import (
	"fmt"
	"strings"

	"cognitree-tui/model"
	"cognitree-tui/styles"
)

// RenderPermissionDialog renders the tool permission dialog.
// Returns an empty string when no permission is pending.
func RenderPermissionDialog(s *model.State) string {
	if s.PendingPerm == nil {
		return ""
	}
	p := s.PendingPerm

	// ── Title ─────────────────────────────────────────────────────────────────
	title := styles.StylePermTitle.Render(fmt.Sprintf("🔒 Allow tool: %s?", p.ToolName))

	// ── Input preview (first 8 lines) ─────────────────────────────────────────
	inputLines := strings.Split(p.InputJSON, "\n")
	const maxLines = 8
	suffix := ""
	if len(inputLines) > maxLines {
		inputLines = inputLines[:maxLines]
		suffix = "\n  …"
	}
	inputPreview := styles.StyleToolInput.Render(strings.Join(inputLines, "\n") + suffix)

	// ── Key hints ─────────────────────────────────────────────────────────────
	yKey := styles.StylePermKey.Render("[Y]")
	nKey := styles.StylePermKey.Render("[N]")
	aKey := styles.StylePermKey.Render("[A]")
	hints := styles.StylePermHint.Render(
		fmt.Sprintf("%ses  %so  %slways allow  [Esc] deny", yKey, nKey, aKey),
	)

	dialogWidth := 60
	if s.Width > 0 && s.Width < 64 {
		dialogWidth = s.Width - 4
	}

	content := title + "\n\n" + inputPreview + "\n\n" + hints
	return styles.StylePermDialog.Width(dialogWidth).Render(content)
}
