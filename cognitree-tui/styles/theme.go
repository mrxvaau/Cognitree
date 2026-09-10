package styles

import "github.com/charmbracelet/lipgloss"

// ─── Color Palette ────────────────────────────────────────────────────────────

const (
	// Primary violet brand colour
	ColViolet    = "#7C3AED"
	ColVioletDim = "#4C1D95"
	ColVioletBrt = "#A78BFA"

	// Backgrounds
	ColBg        = "#0F0F11"
	ColBgElevate = "#1A1A1F"
	ColBgUser    = "#1E1B4B"
	ColBgUserHov = "#2D2A5E"
	ColBgTool    = "#1A1A1F"

	// Text
	ColFg      = "#E2E8F0"
	ColSubtext = "#94A3B8"
	ColMuted   = "#475569"

	// Semantic
	ColGreen  = "#34D399"
	ColRed    = "#F87171"
	ColYellow = "#FBBF24"
	ColCyan   = "#67E8F9"
	ColBlue   = "#60A5FA"
	ColOrange = "#FB923C"

	// Permission dialog
	ColPermBg     = "#1E1B4B"
	ColPermBorder = "#7C3AED"
)

// ─── Semantic Style Tokens ────────────────────────────────────────────────────

var (
	// ── Text helpers (standalone, not role-specific) ──────────────────────
	StyleMuted = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColMuted)).
			Faint(true)

	StyleSubtext = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColSubtext))

	StyleWarning = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColYellow)).
			Bold(true)

	// ── Header ──────────────────────────────────────────────────────────────
	StyleHeader = lipgloss.NewStyle().
			Bold(true).
			Background(lipgloss.Color(ColViolet)).
			Foreground(lipgloss.Color("#FFFFFF")).
			PaddingLeft(1).
			PaddingRight(1)

	StyleHeaderRight = lipgloss.NewStyle().
				Background(lipgloss.Color(ColVioletDim)).
				Foreground(lipgloss.Color(ColSubtext))

	StyleHeaderCwd = lipgloss.NewStyle().
			Background(lipgloss.Color(ColVioletDim)).
			Foreground(lipgloss.Color(ColVioletBrt))

	StyleStreaming = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColViolet)).
			Bold(true)

	// ── Messages ─────────────────────────────────────────────────────────────
	StyleUserLabel = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColVioletBrt)).
			Bold(true)

	StyleUserBubble = lipgloss.NewStyle().
			Background(lipgloss.Color(ColBgUser)).
			Foreground(lipgloss.Color(ColFg)).
			PaddingLeft(2).
			PaddingRight(2).
			PaddingTop(1).
			PaddingBottom(1)

	StyleAssistantLabel = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColSubtext)).
				Bold(false)

	StyleAssistantBubble = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColFg)).
				PaddingLeft(2)

	StyleThinkingBubble = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColMuted)).
				Italic(true).
				PaddingLeft(2)

	StyleSystemMsg = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColSubtext)).
			Italic(true)

	StyleError = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColRed)).
			Bold(true)

	StyleSuccess = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColGreen))

	// ── Tool Cards ───────────────────────────────────────────────────────────
	StyleToolCard = lipgloss.NewStyle().
			Background(lipgloss.Color(ColBgTool)).
			Foreground(lipgloss.Color(ColSubtext)).
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color(ColMuted)).
			PaddingLeft(1).
			PaddingRight(1)

	StyleToolName = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColCyan)).
			Bold(true)

	StyleToolInput = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColSubtext))

	StyleToolResult = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColFg)).
			PaddingLeft(3)

	// ── Input Bar ────────────────────────────────────────────────────────────
	StyleInputBorder = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color(ColViolet)).
				PaddingLeft(1).
				PaddingRight(1)

	StyleInputBorderActive = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color(ColVioletBrt)).
				PaddingLeft(1).
				PaddingRight(1)

	StyleInputPrompt = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColViolet)).
				Bold(true)

	// ── Slash Overlay ────────────────────────────────────────────────────────
	StyleSlashOverlay = lipgloss.NewStyle().
				Background(lipgloss.Color(ColBgElevate)).
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color(ColViolet)).
				PaddingLeft(1).
				PaddingRight(1)

	StyleSlashSelected = lipgloss.NewStyle().
				Background(lipgloss.Color(ColViolet)).
				Foreground(lipgloss.Color("#FFFFFF")).
				PaddingLeft(1).
				PaddingRight(1)

	StyleSlashUnselected = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColFg)).
				PaddingLeft(1).
				PaddingRight(1)

	StyleSlashDesc = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColSubtext))

	StyleSlashName = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColVioletBrt)).
			Bold(true)

	// ── Permission Dialog ────────────────────────────────────────────────────
	StylePermDialog = lipgloss.NewStyle().
			Background(lipgloss.Color(ColPermBg)).
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color(ColPermBorder)).
			PaddingLeft(2).
			PaddingRight(2).
			PaddingTop(1).
			PaddingBottom(1)

	StylePermTitle = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColYellow)).
			Bold(true)

	StylePermHint = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColSubtext))

	StylePermKey = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColVioletBrt)).
			Bold(true)

	// ── Status Bar ───────────────────────────────────────────────────────────
	StyleStatusBar = lipgloss.NewStyle().
			Background(lipgloss.Color(ColBg)).
			Foreground(lipgloss.Color(ColMuted))

	StyleStatusSep = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColMuted))

	StyleStatusModel = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColVioletBrt))

	StyleStatusTokens = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColSubtext))

	StyleStatusCost = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColGreen))

	// ── Markdown ─────────────────────────────────────────────────────────────
	StyleMdBold = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color(ColFg))

	StyleMdItalic = lipgloss.NewStyle().
			Italic(true).
			Foreground(lipgloss.Color(ColFg))

	StyleMdCode = lipgloss.NewStyle().
			Background(lipgloss.Color(ColBgElevate)).
			Foreground(lipgloss.Color(ColCyan)).
			PaddingLeft(1).
			PaddingRight(1)

	StyleMdH1 = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color(ColVioletBrt)).
			MarginTop(1).
			MarginBottom(1)

	StyleMdH2 = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color(ColVioletBrt))

	StyleMdH3 = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color(ColSubtext))

	StyleMdBlockquote = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColSubtext)).
				Italic(true).
				BorderLeft(true).
				BorderStyle(lipgloss.ThickBorder()).
				BorderForeground(lipgloss.Color(ColMuted)).
				PaddingLeft(1)

	StyleMdHR = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColMuted))

	StyleCodeBlock = lipgloss.NewStyle().
			Background(lipgloss.Color(ColBgElevate)).
			PaddingLeft(2).
			PaddingRight(2).
			PaddingTop(1).
			PaddingBottom(1)

	StyleCodeLang = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColMuted)).
			Italic(true)

	// ── Diff ─────────────────────────────────────────────────────────────────
	StyleDiffAdd = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColGreen))

	StyleDiffDel = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColRed))

	StyleDiffHunk = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColCyan)).
			Faint(true)

	StyleDiffCtx = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColMuted))

	// ── Welcome Screen ───────────────────────────────────────────────────────
	StyleWelcomeBox = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color(ColViolet)).
			Padding(1, 3)

	StyleWelcomeLogo = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColViolet)).
				Bold(true)

	StyleWelcomeTitle = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColFg)).
				Bold(true)

	StyleWelcomeSubtitle = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColSubtext))

	StyleWelcomeHint = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColMuted)).
				Italic(true)

	// ── Divider ──────────────────────────────────────────────────────────────
	StyleDivider = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColMuted)).
			Faint(true)
)
