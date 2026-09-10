package styles

import "github.com/charmbracelet/lipgloss"

// ─── Color Palette (matching Cognitree darkTheme in theme.ts) ──────────────────

const (
	// Brand Emerald Green (claude / clawd_body in theme.ts)
	ColBrand     = "#10B981" // rgb(16,185,129)
	ColBrandDim  = "#047857" // darker emerald
	ColBrandBrt  = "#34D399" // rgb(52,211,153) - claudeShimmer

	// Violet / AutoAccept / Merged
	ColViolet    = "#AF87FF" // rgb(175,135,255)
	ColPermission= "#B1B9F9" // rgb(177,185,249)

	// Backgrounds
	ColBg        = "#000000" // clawd_background: rgb(0,0,0)
	ColBgElevate = "#1C1C1E" // elevated background
	ColBgUser    = "#373737" // userMessageBackground: rgb(55,55,55)
	ColBgUserHov = "#464646" // userMessageBackgroundHover: rgb(70,70,70)
	ColBgTool    = "#413C41" // bashMessageBackgroundColor: rgb(65,60,65)
	ColBgMemory  = "#374146" // memoryBackgroundColor: rgb(55,65,70)
	ColSelection = "#264F78" // selectionBg: rgb(38,79,120)

	// Text
	ColFg        = "#FFFFFF" // text: rgb(255,255,255)
	ColSubtext   = "#999999" // inactive: rgb(153,153,153)
	ColMuted     = "#505050" // subtle: rgb(80,80,80)

	// Semantic Status
	ColGreen     = "#4EBA65" // success: rgb(78,186,101)
	ColRed       = "#FF6B80" // error: rgb(255,107,128)
	ColYellow    = "#FFC107" // warning: rgb(255,193,7)
	ColCyan      = "#00CCCC" // background / cyan: rgb(0,204,204)
	ColBlue      = "#93A5FF" // claudeBlue_FOR_SYSTEM_SPINNER: rgb(147,165,255)
	ColOrange    = "#EA580C" // orange_FOR_SUBAGENTS_ONLY: rgb(234,88,12)
	ColPink      = "#FD5DB1" // bashBorder: rgb(253,93,177)

	// Diff Colors
	ColDiffAdd     = "#225C2B" // diffAdded: rgb(34,92,43)
	ColDiffDel     = "#7A2936" // diffRemoved: rgb(122,41,54)
	ColDiffAddWord = "#38A660" // diffAddedWord: rgb(56,166,96)
	ColDiffDelWord = "#B3596B" // diffRemovedWord: rgb(179,89,107)

	// Rate Limit Bar
	ColRateFill  = "#B1B9F9" // rate_limit_fill: rgb(177,185,249)
	ColRateEmpty = "#505370" // rate_limit_empty: rgb(80,83,112)

	// Permission dialog
	ColPermBg     = "#373737"
	ColPermBorder = "#B1B9F9"
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
			Background(lipgloss.Color(ColBrand)).
			Foreground(lipgloss.Color("#000000")).
			PaddingLeft(1).
			PaddingRight(1)

	StyleHeaderRight = lipgloss.NewStyle().
				Background(lipgloss.Color(ColBgElevate)).
				Foreground(lipgloss.Color(ColSubtext))

	StyleHeaderCwd = lipgloss.NewStyle().
			Background(lipgloss.Color(ColBgElevate)).
			Foreground(lipgloss.Color(ColBrandBrt))

	StyleStreaming = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColBrand)).
			Bold(true)

	// ── Messages ─────────────────────────────────────────────────────────────
	StyleUserLabel = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#7AB4E8")). // briefLabelYou: rgb(122,180,232)
			Bold(true)

	StyleUserBubble = lipgloss.NewStyle().
			Background(lipgloss.Color(ColBgUser)).
			Foreground(lipgloss.Color(ColFg)).
			PaddingLeft(2).
			PaddingRight(2).
			PaddingTop(1).
			PaddingBottom(1)

	StyleAssistantLabel = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColBrand)). // briefLabelClaude: rgb(16,185,129)
				Bold(true)

	StyleAssistantBubble = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColFg)).
				PaddingLeft(2)

	StyleThinkingBubble = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColSubtext)).
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
			BorderForeground(lipgloss.Color(ColPink)).
			PaddingLeft(1).
			PaddingRight(1)

	StyleToolName = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColPink)).
			Bold(true)

	StyleToolInput = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColSubtext))

	StyleToolResult = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColFg)).
			PaddingLeft(3)

	// ── Input Bar ────────────────────────────────────────────────────────────
	StyleInputBorder = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color(ColBrand)).
				PaddingLeft(1).
				PaddingRight(1)

	StyleInputBorderActive = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color(ColBrandBrt)).
				PaddingLeft(1).
				PaddingRight(1)

	StyleInputPrompt = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColBrand)).
				Bold(true)

	// ── Slash Overlay ────────────────────────────────────────────────────────
	StyleSlashOverlay = lipgloss.NewStyle().
				Background(lipgloss.Color(ColBgElevate)).
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color(ColBrand)).
				PaddingLeft(1).
				PaddingRight(1)

	StyleSlashSelected = lipgloss.NewStyle().
				Background(lipgloss.Color(ColBrand)).
				Foreground(lipgloss.Color("#000000")).
				Bold(true).
				PaddingLeft(1).
				PaddingRight(1)

	StyleSlashUnselected = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColFg)).
				PaddingLeft(1).
				PaddingRight(1)

	StyleSlashDesc = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColSubtext))

	StyleSlashName = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColBrandBrt)).
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
			Foreground(lipgloss.Color(ColBrandBrt)).
			Bold(true)

	// ── Status Bar ───────────────────────────────────────────────────────────
	StyleStatusBar = lipgloss.NewStyle().
			Background(lipgloss.Color(ColBg)).
			Foreground(lipgloss.Color(ColSubtext))

	StyleStatusSep = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColMuted))

	StyleStatusModel = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColBrandBrt))

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
			Foreground(lipgloss.Color(ColBrandBrt)).
			PaddingLeft(1).
			PaddingRight(1)

	StyleMdH1 = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color(ColBrandBrt)).
			MarginTop(1).
			MarginBottom(1)

	StyleMdH2 = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color(ColBrandBrt))

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
			BorderForeground(lipgloss.Color(ColBrand)).
			Padding(1, 3)

	StyleWelcomeLogo = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColBrand)).
				Bold(true)

	StyleWelcomeTitle = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColFg)).
				Bold(true)

	StyleWelcomeSubtitle = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColSubtext))

	StyleWelcomeHint = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColMuted)).
				Italic(true)

	// ── Welcome Screen v2 (OpenCode-style minimal) ───────────────────────────
	StyleWelcomeLogoWhite = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColFg)).
			Bold(true)

	StyleWelcomeLogoGreen = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColBrand)).
			Bold(true)

	StyleWelcomeInputBox = lipgloss.NewStyle().
			Background(lipgloss.Color(ColBgElevate)).
			BorderLeft(true).
			BorderStyle(lipgloss.ThickBorder()).
			BorderForeground(lipgloss.Color(ColBrand)).
			PaddingLeft(2).
			PaddingRight(2).
			PaddingTop(1).
			PaddingBottom(1)

	StyleWelcomeKeyBold = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColFg)).
			Bold(true)

	StyleWelcomeKeyMuted = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColMuted))

	StyleWelcomeTipGreen = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColBrand)).
			Bold(true)

	StyleWelcomeTipMuted = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColSubtext))

	// ── Context Visualization Grid / Legend ──────────────────────────────────
	StyleContextFilled = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColBrand))

	StyleContextFree = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColMuted))

	StyleContextLegend = lipgloss.NewStyle().
				Foreground(lipgloss.Color(ColSubtext))

	// ── Divider ──────────────────────────────────────────────────────────────
	StyleDivider = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColMuted)).
			Faint(true)
)
