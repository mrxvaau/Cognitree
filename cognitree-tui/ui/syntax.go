package ui

import (
	"strings"

	"github.com/alecthomas/chroma/v2"
	"github.com/alecthomas/chroma/v2/formatters"
	chromaHTML "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/alecthomas/chroma/v2/lexers"
	"github.com/alecthomas/chroma/v2/styles"

	appStyles "cognitree-tui/styles"
)

func init() {
	// Register the ANSI 256-colour formatter if not already present.
	// chroma ships with "terminal256" and "terminal16m" built-in.
	_ = chromaHTML.New() // ensure html formatter is registered (avoids init order issues)
}

// RenderCodeBlock renders a fenced code block with syntax highlighting.
// Falls back to a plain dim box if the language is not recognised.
func RenderCodeBlock(lang, code string, width int) string {
	if width <= 4 {
		width = 80
	}
	innerWidth := width - 4 // account for padding

	// ── Header line (language tag) ────────────────────────────────────────
	var header string
	if lang != "" {
		header = appStyles.StyleCodeLang.Render(" "+lang) + "\n"
	}

	// ── Syntax highlighting ───────────────────────────────────────────────
	highlighted := highlightCode(lang, code)

	// ── Wrap in code block style ──────────────────────────────────────────
	// Pad each line to innerWidth so the background fills the box.
	var sb strings.Builder
	for _, line := range strings.Split(highlighted, "\n") {
		// Strip any trailing newline artefact from chroma output.
		line = strings.TrimRight(line, "\r")
		sb.WriteString(line)
		sb.WriteByte('\n')
	}

	content := strings.TrimRight(sb.String(), "\n")
	_ = innerWidth

	return appStyles.StyleCodeBlock.Render(header + content)
}

// highlightCode returns ANSI-coloured source code using chroma.
// Falls back to the plain code if no lexer is found.
func highlightCode(lang, code string) string {
	var lexer chroma.Lexer
	if lang != "" {
		lexer = lexers.Get(lang)
	}
	if lexer == nil {
		lexer = lexers.Analyse(code)
	}
	if lexer == nil {
		lexer = lexers.Fallback
	}
	lexer = chroma.Coalesce(lexer)

	// Use terminal256 for broad compatibility.
	formatter := formatters.Get("terminal256")
	if formatter == nil {
		formatter = formatters.Fallback
	}

	// Use a dark style that fits our dark TUI.
	style := styles.Get("monokai")
	if style == nil {
		style = styles.Fallback
	}

	iterator, err := lexer.Tokenise(nil, code)
	if err != nil {
		return code
	}

	var buf strings.Builder
	if err := formatter.Format(&buf, style, iterator); err != nil {
		return code
	}
	return buf.String()
}
