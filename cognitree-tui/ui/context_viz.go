package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"cognitree-tui/model"
	"cognitree-tui/styles"
)

// RenderContextVisualization renders the full context panel matching ContextVisualization.tsx.
func RenderContextVisualization(s *model.State, width int) string {
	info := s.Context
	if info == nil {
		// Default estimate if context events haven't arrived yet
		info = &model.ContextInfo{
			TotalTokens:   s.InputTokens + s.OutputTokens,
			MaxTokens:     200000, // 200k default
			MessageTokens: s.InputTokens,
			ToolTokens:    s.OutputTokens / 2,
			MemoryTokens:  1200,
			SystemTokens:  4000,
			FreeTokens:    200000 - (s.InputTokens + s.OutputTokens + 5200),
		}
		if info.FreeTokens < 0 {
			info.FreeTokens = 0
		}
	}

	total := info.MaxTokens
	if total <= 0 {
		total = 200000
	}

	pct := float64(info.TotalTokens) / float64(total) * 100

	// ── 1. Grid Visualization (10x5 = 50 blocks) ─────────────────────────────
	gridCols := 10
	gridRows := 5
	totalBlocks := gridCols * gridRows

	msgBlocks := int(float64(info.MessageTokens) / float64(total) * float64(totalBlocks))
	toolBlocks := int(float64(info.ToolTokens) / float64(total) * float64(totalBlocks))
	memBlocks := int(float64(info.MemoryTokens) / float64(total) * float64(totalBlocks))
	sysBlocks := int(float64(info.SystemTokens) / float64(total) * float64(totalBlocks))
	freeBlocks := totalBlocks - (msgBlocks + toolBlocks + memBlocks + sysBlocks)
	if freeBlocks < 0 {
		freeBlocks = 0
	}

	var gridLines []string
	currBlock := 0
	for r := 0; r < gridRows; r++ {
		var rowSb strings.Builder
		for c := 0; c < gridCols; c++ {
			if currBlock < msgBlocks {
				rowSb.WriteString(styles.StyleStreaming.Render("⛁ "))
			} else if currBlock < msgBlocks+toolBlocks {
				rowSb.WriteString(styles.StyleWarning.Render("⛁ "))
			} else if currBlock < msgBlocks+toolBlocks+memBlocks {
				rowSb.WriteString(styles.StyleSlashName.Render("⛁ "))
			} else if currBlock < msgBlocks+toolBlocks+memBlocks+sysBlocks {
				rowSb.WriteString(styles.StyleSuccess.Render("⛁ "))
			} else {
				rowSb.WriteString(styles.StyleContextFree.Render("⛶ "))
			}
			currBlock++
		}
		gridLines = append(gridLines, rowSb.String())
	}
	gridStr := strings.Join(gridLines, "\n")

	// ── 2. Legend & Details ───────────────────────────────────────────────────
	modelTitle := styles.StyleMdBold.Render(fmt.Sprintf("%s · %s / %s (%.1f%%)",
		s.Session.ModelName,
		humanTokens(info.TotalTokens),
		humanTokens(info.MaxTokens),
		pct,
	))

	catMsg := fmt.Sprintf("%s Messages: %s", styles.StyleStreaming.Render("■"), humanTokens(info.MessageTokens))
	catTool := fmt.Sprintf("%s Tools: %s", styles.StyleWarning.Render("■"), humanTokens(info.ToolTokens))
	catMem := fmt.Sprintf("%s Memory: %s", styles.StyleSlashName.Render("■"), humanTokens(info.MemoryTokens))
	catSys := fmt.Sprintf("%s System: %s", styles.StyleSuccess.Render("■"), humanTokens(info.SystemTokens))
	catFree := fmt.Sprintf("%s Free: %s", styles.StyleContextFree.Render("□"), humanTokens(info.FreeTokens))

	legendStr := fmt.Sprintf("%s\n\n%s   %s   %s\n%s   %s",
		modelTitle,
		catMsg, catTool, catMem,
		catSys, catFree,
	)

	// ── 3. Memory Files Section ──────────────────────────────────────────────
	memFilesStr := ""
	if len(info.MemoryFiles) > 0 {
		var fLines []string
		fLines = append(fLines, styles.StyleSubtext.Render("Memory Files:"))
		for _, f := range info.MemoryFiles {
			fLines = append(fLines, fmt.Sprintf("  📄 %s (%s tokens)", f.Path, humanTokens(f.Tokens)))
		}
		memFilesStr = "\n\n" + strings.Join(fLines, "\n")
	}

	// Combine Grid (Left) + Legend (Right)
	panelWidth := max(width-4, 50)
	gridBox := lipgloss.NewStyle().PaddingRight(3).Render(gridStr)
	legendBox := legendStr + memFilesStr

	content := lipgloss.JoinHorizontal(lipgloss.Top, gridBox, legendBox)

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(styles.ColBrand)).
		Padding(1, 2).
		Width(panelWidth).
		Render("  Context Usage Panel\n\n" + content)

	return box
}
