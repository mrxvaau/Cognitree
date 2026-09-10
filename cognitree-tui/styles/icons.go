package styles

// ─── Spinner Frames ───────────────────────────────────────────────────────────

// SpinnerFrames are the braille-dot frames for the "thinking" spinner.
var SpinnerFrames = []string{
	"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
}

// ─── UI Icons ─────────────────────────────────────────────────────────────────

const (
	// Streaming / status
	IconDot      = "●"
	IconDotEmpty = "○"
	IconArrowDn  = "↓"
	IconArrowUp  = "↑"
	IconPointer  = "❯"
	IconCheck    = "✓"
	IconCross    = "✗"
	IconWarning  = "⚠"
	IconInfo     = "ℹ"

	// Tool / action
	IconTool    = "⚙"
	IconFile    = "📄"
	IconSearch  = "🔍"
	IconGear    = "⚙"
	IconBolt    = "⚡"
	IconBash    = "$"
	IconEdit    = "✏"
	IconRead    = "📖"

	// Permission
	IconLock   = "🔒"
	IconUnlock = "🔓"
	IconKey    = "🔑"
	IconShield = "🛡"

	// Chat roles
	IconUser      = "you"
	IconAssistant = "cognitree"

	// Separators
	Sep    = " │ "
	SepDot = " · "

	// Thinking block
	IconThink = "💭"

	// Diff
	DiffAdd = "+"
	DiffDel = "-"
	DiffCtx = " "
)

// ─── ASCII Welcome Logo ───────────────────────────────────────────────────────

// WelcomeLogo is the COGNITREE ASCII art shown on the welcome screen.
const WelcomeLogo = `
 ██████╗ ██████╗  ██████╗ ███╗   ██╗██╗████████╗██████╗ ███████╗███████╗
██╔════╝██╔═══██╗██╔════╝ ████╗  ██║██║╚══██╔══╝██╔══██╗██╔════╝██╔════╝
██║     ██║   ██║██║  ███╗██╔██╗ ██║██║   ██║   ██████╔╝█████╗  █████╗  
██║     ██║   ██║██║   ██║██║╚██╗██║██║   ██║   ██╔══██╗██╔══╝  ██╔══╝  
╚██████╗╚██████╔╝╚██████╔╝██║ ╚████║██║   ██║   ██║  ██║███████╗███████╗
 ╚═════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝`

// ─── Key Hint Strings ─────────────────────────────────────────────────────────

const (
	HintSlash   = "Type / for commands"
	HintSend    = "Enter to send · Ctrl+J for newline"
	HintScroll  = "PgUp/PgDn to scroll"
	HintQuit    = "Ctrl+C to quit"
	HintInterrupt = "Ctrl+C to interrupt"
	HintPerm    = "[Y]es  [N]o  [A]lways allow"
)
