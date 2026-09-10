package ui

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"cognitree-tui/styles"
)

// ─── Inline Markdown Renderer ─────────────────────────────────────────────────
// Renders a subset of GFM to ANSI-escaped terminal text using lipgloss.
// Full tables / footnotes are future work; the vast majority of LLM output
// uses bold, italic, inline code, headers, lists, blockquotes and hr.

var (
	reBold       = regexp.MustCompile(`\*\*(.+?)\*\*|__(.+?)__`)
	reItalic     = regexp.MustCompile(`\*([^*]+?)\*|_([^_]+?)_`)
	reInlineCode = regexp.MustCompile("`([^`]+?)`")
	reStrike     = regexp.MustCompile(`~~(.+?)~~`)
)

// RenderMarkdown converts markdown text to a terminal-ready ANSI string.
// width controls soft-wrap for code blocks and blockquotes.
func RenderMarkdown(text string, width int) string {
	if width <= 0 {
		width = 80
	}
	var out strings.Builder
	lines := strings.Split(text, "\n")
	inFence := false
	fenceLang := ""
	var fenceLines []string

	for i, line := range lines {
		// ── Fenced code block ────────────────────────────────────────────
		if strings.HasPrefix(line, "```") {
			if !inFence {
				inFence = true
				fenceLang = strings.TrimPrefix(line, "```")
				fenceLines = nil
			} else {
				// Close block
				inFence = false
				block := RenderCodeBlock(fenceLang, strings.Join(fenceLines, "\n"), width)
				out.WriteString(block)
				out.WriteByte('\n')
			}
			continue
		}
		if inFence {
			fenceLines = append(fenceLines, line)
			continue
		}

		// ── Horizontal rule ──────────────────────────────────────────────
		if line == "---" || line == "***" || line == "___" {
			out.WriteString(styles.StyleMdHR.Render(strings.Repeat("─", width-4)))
			out.WriteByte('\n')
			continue
		}

		// ── Headers ──────────────────────────────────────────────────────
		if strings.HasPrefix(line, "### ") {
			out.WriteString(styles.StyleMdH3.Render(strings.TrimPrefix(line, "### ")))
			out.WriteByte('\n')
			continue
		}
		if strings.HasPrefix(line, "## ") {
			out.WriteString(styles.StyleMdH2.Render(strings.TrimPrefix(line, "## ")))
			out.WriteByte('\n')
			continue
		}
		if strings.HasPrefix(line, "# ") {
			if i > 0 {
				out.WriteByte('\n')
			}
			out.WriteString(styles.StyleMdH1.Render(strings.TrimPrefix(line, "# ")))
			out.WriteByte('\n')
			continue
		}

		// ── Blockquote ───────────────────────────────────────────────────
		if strings.HasPrefix(line, "> ") {
			inner := renderInline(strings.TrimPrefix(line, "> "))
			out.WriteString(styles.StyleMdBlockquote.Render(inner))
			out.WriteByte('\n')
			continue
		}

		// ── Unordered list item ──────────────────────────────────────────
		if strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ") {
			body := renderInline(line[2:])
			out.WriteString("  • " + body)
			out.WriteByte('\n')
			continue
		}
		// Numbered list item (simple)
		if numMatch := regexp.MustCompile(`^(\d+)\. (.+)$`).FindStringSubmatch(line); numMatch != nil {
			body := renderInline(numMatch[2])
			out.WriteString(fmt.Sprintf("  %s. %s", numMatch[1], body))
			out.WriteByte('\n')
			continue
		}

		// ── Normal paragraph line ─────────────────────────────────────────
		out.WriteString(renderInline(line))
		out.WriteByte('\n')
	}

	// If we exited with an unclosed fence, flush it plain.
	if inFence && len(fenceLines) > 0 {
		block := RenderCodeBlock(fenceLang, strings.Join(fenceLines, "\n"), width)
		out.WriteString(block)
	}

	return strings.TrimRight(out.String(), "\n")
}

// renderInline applies bold, italic, inline-code, and strikethrough within a
// single text line. Order matters: bold before italic so **_mixed_** works.
func renderInline(text string) string {
	// Inline code (protect from further substitution)
	type span struct{ raw, rendered string }
	var spans []span

	protected := reBold.ReplaceAllStringFunc(text, func(m string) string {
		sub := reBold.FindStringSubmatch(m)
		inner := sub[1]
		if inner == "" {
			inner = sub[2]
		}
		rendered := styles.StyleMdBold.Render(inner)
		key := fmt.Sprintf("\x00bold%d\x00", len(spans))
		spans = append(spans, span{key, rendered})
		return key
	})

	protected = reItalic.ReplaceAllStringFunc(protected, func(m string) string {
		sub := reItalic.FindStringSubmatch(m)
		inner := sub[1]
		if inner == "" {
			inner = sub[2]
		}
		rendered := styles.StyleMdItalic.Render(inner)
		key := fmt.Sprintf("\x00ital%d\x00", len(spans))
		spans = append(spans, span{key, rendered})
		return key
	})

	protected = reInlineCode.ReplaceAllStringFunc(protected, func(m string) string {
		sub := reInlineCode.FindStringSubmatch(m)
		rendered := styles.StyleMdCode.Render(sub[1])
		key := fmt.Sprintf("\x00code%d\x00", len(spans))
		spans = append(spans, span{key, rendered})
		return key
	})

	protected = reStrike.ReplaceAllStringFunc(protected, func(m string) string {
		sub := reStrike.FindStringSubmatch(m)
		rendered := lipgloss.NewStyle().Strikethrough(true).Render(sub[1])
		key := fmt.Sprintf("\x00str%d\x00", len(spans))
		spans = append(spans, span{key, rendered})
		return key
	})

	// Restore placeholders in order
	result := protected
	for _, s := range spans {
		result = strings.ReplaceAll(result, s.raw, s.rendered)
	}
	return result
}
