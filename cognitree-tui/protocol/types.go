package protocol

import "encoding/json"

// ============================================================
// Stdin messages (TUI → backend)
// ============================================================

// UserTurn is sent when the user submits text.
type UserTurn struct {
	Type      string          `json:"type"`               // "user"
	SessionID string          `json:"session_id"`         // "" ok
	Message   UserTurnMessage `json:"message"`
	ParentID  interface{}     `json:"parent_tool_use_id"` // null
}

// UserTurnMessage is the inner content.
type UserTurnMessage struct {
	Role    string `json:"role"`    // "user"
	Content string `json:"content"` // plain text
}

// ControlRequest wraps a typed subtype payload.
type ControlRequest struct {
	Type      string          `json:"type"`       // "control_request"
	RequestID string          `json:"request_id"` // UUID
	Request   json.RawMessage `json:"request"`    // subtype-specific
}

// InterruptRequest aborts the current turn.
type InterruptRequest struct {
	Subtype string `json:"subtype"` // "interrupt"
}

// SetModelRequest changes the inference model.
type SetModelRequest struct {
	Subtype string `json:"subtype"` // "set_model"
	Model   string `json:"model"`
}

// ControlResponse replies to a control_request.
type ControlResponse struct {
	Type     string                 `json:"type"`     // "control_response"
	Response ControlResponsePayload `json:"response"`
}

// ControlResponsePayload carries the allow/deny decision.
type ControlResponsePayload struct {
	Subtype   string                 `json:"subtype"`              // "success" | "error"
	RequestID string                 `json:"request_id"`
	Response  map[string]interface{} `json:"response,omitempty"`
	Error     string                 `json:"error,omitempty"`
}

// ============================================================
// Stdout messages (backend → TUI)
// ============================================================

// --- Envelope helpers ---

// Envelope carries the top-level type/subtype for routing.
type Envelope struct {
	Type    string `json:"type"`
	Subtype string `json:"subtype"`
}

// --- System messages ---

// SystemInit is received on startup with session metadata.
type SystemInit struct {
	Type      string `json:"type"`    // "system"
	Subtype   string `json:"subtype"` // "init"
	SessionID string `json:"session_id"`
	Model     string `json:"model"`
	Cwd       string `json:"cwd"`
	Version   string `json:"version"`
}

// SystemStatus carries ephemeral status updates.
type SystemStatus struct {
	Type    string `json:"type"`
	Subtype string `json:"subtype"` // "status"
	Message string `json:"message"`
}

// --- Assistant messages ---

// AssistantEnvelope — type: "assistant" (full turn, not streaming).
type AssistantEnvelope struct {
	Type    string       `json:"type"`
	Message AssistantMsg `json:"message"`
	UUID    string       `json:"uuid"`
}

// AssistantMsg mirrors the Anthropic API message.
type AssistantMsg struct {
	Role    string         `json:"role"`
	Content []ContentBlock `json:"content"`
}

// ContentBlock is one element in assistant content.
type ContentBlock struct {
	Type     string          `json:"type"`             // "text" | "tool_use" | "thinking"
	Text     string          `json:"text,omitempty"`
	Thinking string          `json:"thinking,omitempty"`
	ID       string          `json:"id,omitempty"`
	Name     string          `json:"name,omitempty"`
	Input    json.RawMessage `json:"input,omitempty"`
}

// --- Streaming ---

// StreamEvent carries incremental deltas with --include-partial-messages.
type StreamEvent struct {
	Type  string           `json:"type"` // "stream_event"
	Event StreamEventInner `json:"event"`
}

// StreamEventInner mirrors Anthropic's RawMessageStreamEvent.
type StreamEventInner struct {
	Type  string      `json:"type"`
	Delta *StreamDelta `json:"delta,omitempty"`
}

// StreamDelta carries the incremental token.
type StreamDelta struct {
	Type     string `json:"type"`              // "text_delta" | "thinking_delta"
	Text     string `json:"text,omitempty"`
	Thinking string `json:"thinking,omitempty"`
}

// --- Control request from backend ---

// ControlRequestOut — backend asking TUI permission.
type ControlRequestOut struct {
	Type      string               `json:"type"`
	RequestID string               `json:"request_id"`
	Request   PermissionRequestBody `json:"request"`
}

// PermissionRequestBody is the inner payload for can_use_tool.
type PermissionRequestBody struct {
	Subtype   string                 `json:"subtype"`
	ToolName  string                 `json:"tool_name,omitempty"`
	Input     map[string]interface{} `json:"input,omitempty"`
	ToolUseID string                 `json:"tool_use_id,omitempty"`
}

// --- Result ---

// ResultEnvelope — type: "result", final turn summary.
type ResultEnvelope struct {
	Type    string   `json:"type"`
	Subtype string   `json:"subtype"` // "success" | "error_during_execution" | ...
	Result  string   `json:"result,omitempty"`
	Errors  []string `json:"errors,omitempty"`
	// Usage is present on success results from some backends.
	Usage *UsageInfo `json:"usage,omitempty"`
}

// UsageInfo carries token counts from a result message.
type UsageInfo struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// --- Tool result (embedded in user turn content) ---

// ToolResultBlock appears inside a user turn's content array
// when the assistant requested a tool call.
type ToolResultBlock struct {
	Type      string `json:"type"`       // "tool_result"
	ToolUseID string `json:"tool_use_id"`
	Content   string `json:"content"`
	IsError   bool   `json:"is_error,omitempty"`
}

// ============================================================
// ParseEnvelope — fast top-level router
// ============================================================

// ParseEnvelope returns type/subtype without full deserialization.
func ParseEnvelope(line string) (msgType, subtype string, raw json.RawMessage, err error) {
	var env Envelope
	if err = json.Unmarshal([]byte(line), &env); err != nil {
		return
	}
	return env.Type, env.Subtype, json.RawMessage(line), nil
}
