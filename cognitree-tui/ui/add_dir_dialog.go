package ui

import (
	"fmt"

	"cognitree-tui/model"
	"cognitree-tui/styles"
)

// RenderAddDirDialog renders the interactive /add-dir popup dialog.
// Returns an empty string when no add-dir modal is active.
func RenderAddDirDialog(s *model.State) string {
	if s.PendingAddDir == nil {
		return ""
	}
	m := s.PendingAddDir

	// ── Title ─────────────────────────────────────────────────────────────────
	title := styles.StylePermTitle.Render("📁 Add Working Directory")

	// ── Input box ─────────────────────────────────────────────────────────────
	pathStr := m.Path
	if pathStr == "" {
		pathStr = styles.StyleMuted.Render("Type or paste directory path...")
	} else {
		pathStr = styles.StyleSlashName.Render(m.Path) + styles.StyleStreaming.Render("█")
	}

	boxWidth := 54
	if s.Width > 0 && s.Width < 62 {
		boxWidth = s.Width - 8
	}
	inputBox := styles.StyleInputBorderActive.Width(boxWidth).Render("Path: " + pathStr)

	// ── Option Selector ──────────────────────────────────────────────────────
	sessionOpt := "  [▶] Add for this session only"
	persistOpt := "  [ ] Save to local settings (.claude.json)"
	if m.Remember {
		sessionOpt = "  [ ] Add for this session only"
		persistOpt = "  [▶] Save to local settings (.claude.json)"
	}

	var sessionRendered, persistRendered string
	if !m.Remember {
		sessionRendered = styles.StyleSlashSelected.Render(sessionOpt)
		persistRendered = styles.StyleSlashUnselected.Render(persistOpt)
	} else {
		sessionRendered = styles.StyleSlashUnselected.Render(sessionOpt)
		persistRendered = styles.StyleSlashSelected.Render(persistOpt)
	}

	optionsView := sessionRendered + "\n" + persistRendered

	// ── Key hints ─────────────────────────────────────────────────────────────
	hints := styles.StylePermHint.Render(
		fmt.Sprintf("%s  %s  %s",
			styles.StylePermKey.Render("[Enter] Confirm"),
			styles.StylePermKey.Render("[Tab/↑↓] Toggle Option"),
			styles.StylePermKey.Render("[Esc] Cancel"),
		),
	)

	dialogWidth := 60
	if s.Width > 0 && s.Width < 64 {
		dialogWidth = s.Width - 4
	}

	content := title + "\n\n" + inputBox + "\n\n" + optionsView + "\n\n" + hints
	return styles.StylePermDialog.Width(dialogWidth).Render(content)
}
