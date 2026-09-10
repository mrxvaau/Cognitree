package model

import (
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
)

// ─── Input Mode ───────────────────────────────────────────────────────────────

// InputMode controls how keyboard input is interpreted.
type InputMode int

const (
	// ModeNormal — regular chat; Enter sends.
	ModeNormal InputMode = iota
	// ModeSlash — user typed "/" first; show typeahead overlay.
	ModeSlash
)

// ─── Permission Prompt ────────────────────────────────────────────────────────

// PermissionPrompt holds the pending can_use_tool dialog state.
type PermissionPrompt struct {
	RequestID string
	ToolName  string
	InputJSON string // pretty-printed
}

// ─── Session Metadata ─────────────────────────────────────────────────────────

// Session holds runtime info received from the backend system:init event.
type Session struct {
	ID      string
	ModelName string
	Cwd     string
	Version string
}

// ─── Spinner State ────────────────────────────────────────────────────────────

// Spinner holds the animation frame index for the thinking indicator.
type Spinner struct {
	Frame int
}

// ─── State ────────────────────────────────────────────────────────────────────

// State is the single source of truth for the entire TUI.
// BubbleTea Update returns a new copy on every event.
type State struct {
	// ── Session ───────────────────────────────────────────────────────────
	Session Session

	// ── Conversation ──────────────────────────────────────────────────────
	Messages    []ChatMessage
	Streaming   bool   // backend is generating a response
	StreamBuf   string // accumulated partial assistant text

	// ── Input ─────────────────────────────────────────────────────────────
	Input     textinput.Model
	InputMode InputMode

	// ── Slash Command Typeahead ────────────────────────────────────────────
	// SlashQuery is the text after "/" (before space). Used to fuzzy-match.
	SlashQuery    string
	// SlashMatches is the filtered list shown in the overlay.
	SlashMatches  []SlashEntry
	// SlashSelected is the highlighted index in SlashMatches.
	SlashSelected int

	// ── Tool Permission ───────────────────────────────────────────────────
	PendingPerm *PermissionPrompt
	// AlwaysAllow maps tool_name → true for session-level "always allow".
	AlwaysAllow map[string]bool

	// ── Layout ────────────────────────────────────────────────────────────
	Viewport      viewport.Model
	Width, Height int
	Ready         bool // true once the first WindowSizeMsg has been processed

	// ── Spinner ───────────────────────────────────────────────────────────
	Spinner Spinner

	// ── Token / Cost tracking ─────────────────────────────────────────────
	InputTokens  int
	OutputTokens int
	TotalCostUSD float64

	// ── Status / Error ────────────────────────────────────────────────────
	FatalErr  string // non-empty → show fatal overlay, Ctrl+C to exit
	StatusMsg string // transient one-line status below input
}

// ─── Slash Entry ──────────────────────────────────────────────────────────────

// SlashEntry is a single item shown in the typeahead overlay.
type SlashEntry struct {
	Name        string
	Description string
	// IsBuiltin indicates the command is handled client-side (not sent to backend).
	IsBuiltin bool
}

// ─── Constructor ──────────────────────────────────────────────────────────────

// NewState creates a fresh initial State.
func NewState() State {
	ti := textinput.New()
	ti.Placeholder = "Message Cognitree... (/ for commands)"
	ti.CharLimit = 0 // unlimited
	ti.Focus()

	return State{
		Input:       ti,
		AlwaysAllow: make(map[string]bool),
		Session: Session{
			ModelName: "...",
		},
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// IsIdle returns true when no streaming or pending dialog is active.
func (s *State) IsIdle() bool {
	return !s.Streaming && s.PendingPerm == nil
}

// HasMessages returns true once any real chat message exists.
func (s *State) HasMessages() bool {
	return len(s.Messages) > 0
}

// LastMessageTime returns the timestamp of the most recent message, or zero.
func (s *State) LastMessageTime() time.Time {
	if len(s.Messages) == 0 {
		return time.Time{}
	}
	return s.Messages[len(s.Messages)-1].Timestamp
}
