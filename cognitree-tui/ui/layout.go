package ui

import (
	"strings"

	"cognitree-tui/model"
)

// RenderLayout assembles all TUI zones into a single screen string.
//
// Layout (top → bottom):
//   1. Header bar (1 row, fixed)
//   2. Message viewport (grows, scrolls)
//   3. Slash overlay (absolute, shown when in slash mode)
//   4. Permission dialog (shown when pending)
//   5. Input bar (1-3 rows)
//   6. Status bar (1 row)
func RenderLayout(s *model.State, viewportContent string) string {
	if !s.Ready {
		return "  Connecting to backend…"
	}

	w := s.Width
	if w <= 0 {
		w = 80
	}

	// ── 1. Header ─────────────────────────────────────────────────────────────
	header := RenderHeader(
		s.Session.ModelName,
		s.Session.Cwd,
		s.Streaming,
		s.InputTokens,
		s.OutputTokens,
		w,
	)

	// ── 2. Viewport (messages or welcome) ─────────────────────────────────────
	// viewportContent is pre-rendered by the BubbleTea viewport model.

	// ── 3. Slash overlay (above input) ────────────────────────────────────────
	slashOverlay := RenderSlashOverlay(s)

	// ── 4. Permission dialog ──────────────────────────────────────────────────
	permDialog := RenderPermissionDialog(s)

	// ── 5. Input bar ──────────────────────────────────────────────────────────
	inputHint := buildInputHint(s)
	inputBar := s.Input.View()

	// ── 6. Status bar ─────────────────────────────────────────────────────────
	statusBar := RenderStatusBar(s, w)

	// ── Assemble ──────────────────────────────────────────────────────────────
	var sb strings.Builder
	sb.WriteString(header)
	sb.WriteByte('\n')
	sb.WriteString(viewportContent)
	sb.WriteByte('\n')
	if slashOverlay != "" {
		sb.WriteString(slashOverlay)
		sb.WriteByte('\n')
	}
	if permDialog != "" {
		sb.WriteString(permDialog)
		sb.WriteByte('\n')
	}
	if inputHint != "" {
		sb.WriteString(inputHint)
		sb.WriteByte('\n')
	}
	sb.WriteString(inputBar)
	sb.WriteByte('\n')
	sb.WriteString(statusBar)

	return sb.String()
}

// buildInputHint returns the single-line prompt hint shown above the input.
func buildInputHint(s *model.State) string {
	if s.PendingPerm != nil {
		return ""
	}
	if s.Streaming {
		frames := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
		frame := frames[s.Spinner.Frame%len(frames)]
		return "  " + frame + " thinking…"
	}
	return ""
}

// spinnerFrames returns the spinner animation frame string (for reference).
func spinnerFrames() []string {
	return []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
}
