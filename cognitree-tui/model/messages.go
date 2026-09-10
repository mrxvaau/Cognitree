package model

import "time"

// ─── Message Types ────────────────────────────────────────────────────────────

// MsgRole identifies who authored or what kind a message is.
type MsgRole int

const (
	RoleUser      MsgRole = iota // Human input
	RoleAssistant                // AI text response
	RoleSystem                   // Info from CLI (not LLM)
	RoleError                    // Error from backend or TUI
	RoleToolUse                  // Assistant asked to use a tool
	RoleToolResult               // Result of a tool call
	RoleThinking                 // Extended reasoning block
	RoleDivider                  // Visual "N new messages" divider
)

// ─── ChatMessage ─────────────────────────────────────────────────────────────

// ChatMessage is a single entry in the conversation transcript.
type ChatMessage struct {
	Role      MsgRole
	Content   string    // Main text. For tool cards, this is the tool description.
	Timestamp time.Time
	UUID      string    // Backend-assigned unique ID (used to avoid duplicate renders)

	// ── Tool use fields (Role == RoleToolUse) ─────────────────────────────
	ToolName   string // e.g. "bash", "read_file", "str_replace"
	ToolInput  string // JSON input (pretty-printed for display)
	ToolUseID  string // Correlates with ToolResult

	// ── Tool result fields (Role == RoleToolResult) ───────────────────────
	ToolResult  string // The stdout / return value
	ToolSuccess bool   // false = tool errored

	// ── Thinking block (Role == RoleThinking) ─────────────────────────────
	// Collapsed by default; user can expand in future.
	ThinkingText string

	// ── Streaming state (Role == RoleAssistant while streaming) ───────────
	IsStreaming bool // true while this is the live partial message

	// ── Divider (Role == RoleDivider) ─────────────────────────────────────
	DividerCount int // "N new messages" count

	// ── Source ────────────────────────────────────────────────────────────
	// SubRole is an optional finer-grained label, e.g. "compact_boundary",
	// "init", "status" for system messages.
	SubRole string
}

// ─── Constructors ─────────────────────────────────────────────────────────────

func NewUserMsg(content string) ChatMessage {
	return ChatMessage{
		Role:      RoleUser,
		Content:   content,
		Timestamp: time.Now(),
	}
}

func NewAssistantMsg(content string) ChatMessage {
	return ChatMessage{
		Role:      RoleAssistant,
		Content:   content,
		Timestamp: time.Now(),
	}
}

func NewSystemMsg(content, subRole string) ChatMessage {
	return ChatMessage{
		Role:      RoleSystem,
		Content:   content,
		SubRole:   subRole,
		Timestamp: time.Now(),
	}
}

func NewErrorMsg(content string) ChatMessage {
	return ChatMessage{
		Role:      RoleError,
		Content:   content,
		Timestamp: time.Now(),
	}
}

func NewToolUseMsg(id, name, input string) ChatMessage {
	return ChatMessage{
		Role:      RoleToolUse,
		ToolUseID: id,
		ToolName:  name,
		ToolInput: input,
		Timestamp: time.Now(),
	}
}

func NewToolResultMsg(id, result string, success bool) ChatMessage {
	return ChatMessage{
		Role:        RoleToolResult,
		ToolUseID:   id,
		ToolResult:  result,
		ToolSuccess: success,
		Timestamp:   time.Now(),
	}
}

func NewThinkingMsg(text string) ChatMessage {
	return ChatMessage{
		Role:         RoleThinking,
		ThinkingText: text,
		Timestamp:    time.Now(),
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// IsVisible returns false for message types that should be hidden in the
// transcript (e.g. empty system notices).
func (m *ChatMessage) IsVisible() bool {
	switch m.Role {
	case RoleSystem:
		// Hide init/compact_boundary system markers; they're metadata not chat.
		return m.SubRole == "" || (m.SubRole != "init" && m.SubRole != "compact_boundary")
	case RoleThinking:
		return m.ThinkingText != ""
	case RoleToolResult:
		return m.ToolResult != ""
	default:
		return m.Content != "" || m.ToolName != ""
	}
}

// Label returns a short human-readable label for the message role.
func (m *ChatMessage) Label() string {
	switch m.Role {
	case RoleUser:
		return "you"
	case RoleAssistant:
		return "cognitree"
	case RoleSystem:
		return "system"
	case RoleError:
		return "error"
	case RoleToolUse:
		return "tool"
	case RoleToolResult:
		return "result"
	case RoleThinking:
		return "thinking"
	default:
		return ""
	}
}
