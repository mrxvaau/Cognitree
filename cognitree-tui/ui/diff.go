package ui

import (
	"strings"

	"cognitree-tui/styles"
)

// RenderDiff renders a unified diff string with colour-coded lines.
// Lines starting with "+" are green, "-" are red, "@@" are cyan, others dim.
func RenderDiff(diff string, width int) string {
	if diff == "" {
		return ""
	}
	var sb strings.Builder
	lines := strings.Split(diff, "\n")
	for _, line := range lines {
		switch {
		case strings.HasPrefix(line, "+++") || strings.HasPrefix(line, "---"):
			// File path headers — show in bold.
			sb.WriteString(styles.StyleMdBold.Render(line))
		case strings.HasPrefix(line, "@@"):
			sb.WriteString(styles.StyleDiffHunk.Render(line))
		case strings.HasPrefix(line, "+"):
			sb.WriteString(styles.StyleDiffAdd.Render(line))
		case strings.HasPrefix(line, "-"):
			sb.WriteString(styles.StyleDiffDel.Render(line))
		default:
			sb.WriteString(styles.StyleDiffCtx.Render(line))
		}
		sb.WriteByte('\n')
	}
	return strings.TrimRight(sb.String(), "\n")
}
