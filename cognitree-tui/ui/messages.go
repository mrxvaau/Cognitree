package ui

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"cognitree-tui/model"
	"cognitree-tui/styles"
)

// ─── Message List Renderer ────────────────────────────────────────────────────

// RenderMessages returns the full transcript as a single ANSI string.
// width is the usable column count (terminal width minus any chrome).
func RenderMessages(msgs []model.ChatMessage, streamBuf string, streaming bool, width int) string {
	if len(msgs) == 0 && !streaming {
		return ""
	}
	var sb strings.Builder
	for i := range msgs {
		m := &msgs[i]
		if !m.IsVisible() {
			continue
		}
		sb.WriteString(renderMessage(m, width))
		if i < len(msgs)-1 {
			sb.WriteByte('\n')
		}
	}

	// Live streaming partial text
	if streaming && streamBuf != "" {
		if sb.Len() > 0 {
			sb.WriteByte('\n')
		}
		sb.WriteString(renderStreamingMsg(streamBuf, width))
	}

	return sb.String()
}

// ─── Per-message Dispatch ─────────────────────────────────────────────────────

func renderMessage(m *model.ChatMessage, width int) string {
	switch m.Role {
	case model.RoleUser:
		return renderUser(m, width)
	case model.RoleAssistant:
		return renderAssistant(m, width)
	case model.RoleThinking:
		return renderThinking(m, width)
	case model.RoleToolUse:
		return renderToolUse(m, width)
	case model.RoleToolResult:
		return renderToolResult(m, width)
	case model.RoleSystem:
		return renderSystem(m)
	case model.RoleError:
		return renderError(m)
	case model.RoleDivider:
		return renderDivider(m, width)
	default:
		return ""
	}
}

// ─── User message ─────────────────────────────────────────────────────────────

func renderUser(m *model.ChatMessage, width int) string {
	label := styles.StyleUserLabel.Render("▶ you")
	ts := styles.StyleMuted.Render(formatTime(m.Timestamp))
	header := fmt.Sprintf("%s  %s", label, ts)

	// Wrap content inside user bubble background
	bubbleWidth := min(width-2, 80)
	content := wrapText(m.Content, bubbleWidth-4)
	bubble := styles.StyleUserBubble.Width(bubbleWidth).Render(content)

	return header + "\n" + bubble
}

// ─── Assistant message ────────────────────────────────────────────────────────

func renderAssistant(m *model.ChatMessage, width int) string {
	label := styles.StyleAssistantLabel.Render("◆ cognitree")
	ts := styles.StyleMuted.Render(formatTime(m.Timestamp))
	header := fmt.Sprintf("%s  %s", label, ts)

	// Render thinking block if present (collapsed, dim)
	var parts []string
	if m.ThinkingText != "" {
		parts = append(parts, renderThinkingInline(m.ThinkingText, width))
	}

	// Main content through markdown renderer
	if m.Content != "" {
		parts = append(parts, styles.StyleAssistantBubble.Render(
			RenderMarkdown(m.Content, width-4),
		))
	}

	body := strings.Join(parts, "\n")
	return header + "\n" + body
}

// ─── Streaming partial ────────────────────────────────────────────────────────

func renderStreamingMsg(text string, width int) string {
	label := styles.StyleAssistantLabel.Render("◆ cognitree")
	header := label + "  " + styles.StyleStreaming.Render("●")
	content := styles.StyleAssistantBubble.Render(
		RenderMarkdown(text, width-4) + styles.StyleStreaming.Render("▋"),
	)
	return header + "\n" + content
}

// ─── Thinking block ───────────────────────────────────────────────────────────

func renderThinking(m *model.ChatMessage, width int) string {
	return renderThinkingInline(m.ThinkingText, width)
}

func renderThinkingInline(text string, width int) string {
	label := styles.StyleMuted.Render("  💭 thinking")
	// Collapse to first 2 lines.
	lines := strings.Split(text, "\n")
	snippet := ""
	if len(lines) > 2 {
		snippet = strings.Join(lines[:2], "\n") + "\n  …"
	} else {
		snippet = text
	}
	content := styles.StyleThinkingBubble.Render(snippet)
	return label + "\n" + content
}

// ─── Tool use ─────────────────────────────────────────────────────────────────

func renderToolUse(m *model.ChatMessage, width int) string {
	icon := toolIcon(m.ToolName)
	nameStr := styles.StyleToolName.Render(icon + " " + m.ToolName)

	// Truncate input JSON for readability — show first 5 lines.
	inputLines := strings.Split(m.ToolInput, "\n")
	maxLines := 5
	suffix := ""
	if len(inputLines) > maxLines {
		inputLines = inputLines[:maxLines]
		suffix = "\n  …"
	}
	inputStr := styles.StyleToolInput.Render(strings.Join(inputLines, "\n") + suffix)

	cardWidth := min(width-4, 72)
	card := styles.StyleToolCard.Width(cardWidth).Render(nameStr + "\n" + inputStr)
	return "  " + card
}

// ─── Tool result ──────────────────────────────────────────────────────────────

func renderToolResult(m *model.ChatMessage, width int) string {
	var icon string
	if m.ToolSuccess {
		icon = styles.StyleSuccess.Render("  ✓")
	} else {
		icon = styles.StyleError.Render("  ✗")
	}

	// Detect diff output
	if looksLikeDiff(m.ToolResult) {
		return icon + "\n" + RenderDiff(m.ToolResult, width-4)
	}

	// Plain result — truncate to first 20 lines.
	lines := strings.Split(m.ToolResult, "\n")
	const maxResultLines = 20
	suffix := ""
	if len(lines) > maxResultLines {
		lines = lines[:maxResultLines]
		suffix = "\n  … (truncated)"
	}
	result := styles.StyleToolResult.Render(strings.Join(lines, "\n") + suffix)
	return icon + "\n" + result
}

func looksLikeDiff(text string) bool {
	for _, line := range strings.SplitN(text, "\n", 5) {
		if strings.HasPrefix(line, "@@") || strings.HasPrefix(line, "--- ") || strings.HasPrefix(line, "+++ ") {
			return true
		}
	}
	return false
}

// ─── System message ───────────────────────────────────────────────────────────

func renderSystem(m *model.ChatMessage) string {
	return styles.StyleSystemMsg.Render("  ℹ " + m.Content)
}

// ─── Error message ────────────────────────────────────────────────────────────

func renderError(m *model.ChatMessage) string {
	return styles.StyleError.Render("  ✗ " + m.Content)
}

// ─── Divider ──────────────────────────────────────────────────────────────────

func renderDivider(m *model.ChatMessage, width int) string {
	label := fmt.Sprintf(" %d new message", m.DividerCount)
	if m.DividerCount != 1 {
		label += "s"
	}
	line := strings.Repeat("─", max(0, width-len(label)-4))
	return styles.StyleDivider.Render(line + label + " ↓")
}

// ─── Tool icons ───────────────────────────────────────────────────────────────

func toolIcon(name string) string {
	switch {
	case strings.Contains(name, "bash") || strings.Contains(name, "exec"):
		return "⚡"
	case strings.Contains(name, "read") || strings.Contains(name, "file"):
		return "📄"
	case strings.Contains(name, "write") || strings.Contains(name, "edit") || strings.Contains(name, "str_replace"):
		return "✏"
	case strings.Contains(name, "search") || strings.Contains(name, "grep") || strings.Contains(name, "find"):
		return "🔍"
	case strings.Contains(name, "web") || strings.Contains(name, "browser") || strings.Contains(name, "fetch"):
		return "🌐"
	default:
		return "⚙"
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format("15:04")
}

// wrapText soft-wraps text at width rune columns, preserving existing newlines.
func wrapText(text string, width int) string {
	if width <= 0 {
		return text
	}
	var out strings.Builder
	for _, para := range strings.Split(text, "\n") {
		if utf8.RuneCountInString(para) <= width {
			out.WriteString(para)
			out.WriteByte('\n')
			continue
		}
		words := strings.Fields(para)
		line := ""
		for _, w := range words {
			if utf8.RuneCountInString(line)+utf8.RuneCountInString(w)+1 > width {
				out.WriteString(strings.TrimRight(line, " "))
				out.WriteByte('\n')
				line = w + " "
			} else {
				line += w + " "
			}
		}
		if line != "" {
			out.WriteString(strings.TrimRight(line, " "))
			out.WriteByte('\n')
		}
	}
	return strings.TrimRight(out.String(), "\n")
}

// Inline style for muted text (used in several renderers without a package-level var).
var (
	styleMuted = styles.StyleMuted
)

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
