package model

import (
	"time"

	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
)

// ─── Input Mode ───────────────────────────────────────────────────────────────

type InputMode int

const (
	ModeNormal InputMode = iota
	ModeSlash
)

// ─── Permission Prompt ────────────────────────────────────────────────────────

type PermissionPrompt struct {
	RequestID string
	ToolName  string
	InputJSON string
}

// ─── Session Metadata ─────────────────────────────────────────────────────────

type Session struct {
	ID        string
	ModelName string
	Cwd       string
	Version   string
}

// ─── Spinner State ────────────────────────────────────────────────────────────

type Spinner struct {
	Frame int
}

// ─── Memory File & MCP Tool for Context Panel ─────────────────────────────────

type MemoryFile struct {
	Path   string
	Tokens int
}

type McpTool struct {
	Name   string
	Tokens int
}

type ContextInfo struct {
	TotalTokens   int
	MaxTokens     int
	MessageTokens int
	ToolTokens    int
	MemoryTokens  int
	SystemTokens  int
	FreeTokens    int
	MemoryFiles   []MemoryFile
	McpTools      []McpTool
}

// ─── State ────────────────────────────────────────────────────────────────────

type State struct {
	// ── Session ───────────────────────────────────────────────────────────
	Session Session

	// ── Conversation ──────────────────────────────────────────────────────
	Messages  []ChatMessage
	Streaming bool
	StreamBuf string

	// ── Scroll UX ─────────────────────────────────────────────────────────
	AutoScroll  bool
	UnseenCount int

	// ── Input ─────────────────────────────────────────────────────────────
	Input     textarea.Model
	InputMode InputMode

	// ── Slash Command Typeahead ────────────────────────────────────────────
	SlashQuery    string
	SlashMatches  []SlashEntry
	SlashSelected int

	// ── Tool Permission ───────────────────────────────────────────────────
	PendingPerm *PermissionPrompt
	AlwaysAllow map[string]bool

	// ── Context Visualization Panel ────────────────────────────────────────
	Context     *ContextInfo
	ShowContext bool

	// ── Layout ────────────────────────────────────────────────────────────
	Viewport      viewport.Model
	Width, Height int
	Ready         bool

	// ── Spinner ───────────────────────────────────────────────────────────
	Spinner Spinner

	// ── Token / Cost tracking ─────────────────────────────────────────────
	InputTokens  int
	OutputTokens int
	TotalCostUSD float64

	// ── Status / Error ────────────────────────────────────────────────────
	FatalErr  string
	StatusMsg string
}

// ─── Slash Entry ──────────────────────────────────────────────────────────────

type SlashEntry struct {
	Name        string
	Description string
	IsBuiltin   bool
}

// ─── Constructor ──────────────────────────────────────────────────────────────

func NewState() State {
	ta := textarea.New()
	ta.Placeholder = "Message Cognitree... (/ for commands)"
	ta.Focus()
	ta.Prompt = "│ "
	ta.SetHeight(2)
	ta.ShowLineNumbers = false

	return State{
		Input:       ta,
		AutoScroll:  true,
		AlwaysAllow: make(map[string]bool),
		Session: Session{
			ModelName: "...",
		},
	}
}

func (s *State) IsIdle() bool {
	return !s.Streaming && s.PendingPerm == nil
}

func (s *State) HasMessages() bool {
	return len(s.Messages) > 0
}

func (s *State) LastMessageTime() time.Time {
	if len(s.Messages) == 0 {
		return time.Time{}
	}
	return s.Messages[len(s.Messages)-1].Timestamp
}
