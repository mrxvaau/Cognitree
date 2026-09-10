package protocol

import (
	"encoding/json"
	"strings"
)

// ─── Typed TUI events (dispatched from raw BackendMsg) ───────────────────────

// These are the strongly-typed events that app.go's Update receives.
// All are values (not pointers) so BubbleTea can pattern-match them cleanly.

// EvtSessionInit — backend sent system:init (session start metadata).
type EvtSessionInit struct {
	SessionID     string
	Model         string
	Cwd           string
	Version       string
	SlashCommands []string
	Skills        []string
	Tools         []string
	Agents        []string
}

// EvtStatusMsg — backend sent system:status (transient status string).
type EvtStatusMsg struct{ Message string }

// EvtAssistantText — a full assistant text turn arrived.
type EvtAssistantText struct {
	UUID    string
	Content string
	// Thinking is non-empty when a reasoning block preceded the text.
	Thinking string
}

// EvtStreamDelta — incremental streaming token from the backend.
type EvtStreamDelta struct {
	Type string // "text_delta" | "thinking_delta"
	Text string
}

// EvtToolUse — assistant requested to invoke a tool.
type EvtToolUse struct {
	UUID      string
	ToolUseID string
	ToolName  string
	InputJSON string // pretty-printed for display
}

// EvtPermissionRequest — backend is asking for a tool call permission.
type EvtPermissionRequest struct {
	RequestID string
	ToolName  string
	InputJSON string // pretty-printed
}

// EvtTurnComplete — backend sent a result message (turn finished).
type EvtTurnComplete struct {
	Subtype      string
	Result       string
	ErrorMessage string
	InputTokens  int
	OutputTokens int
}

// EvtParseError — a line arrived that we couldn't parse (non-fatal).
type EvtParseError struct {
	Line string
	Err  error
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

// Dispatch converts a raw NDJSON line into a typed event.
// The returned value is one of the Evt* types above, or nil if the line
// is intentionally ignored (e.g. keepalive).
func Dispatch(line string) (interface{}, error) {
	msgType, subtype, raw, err := ParseEnvelope(line)
	if err != nil {
		return EvtParseError{Line: line, Err: err}, nil
	}

	switch msgType {
	// ── System messages ──────────────────────────────────────────────────
	case "system":
		switch subtype {
		case "init":
			var msg SystemInit
			if err := json.Unmarshal(raw, &msg); err != nil {
				return EvtParseError{Line: line, Err: err}, nil
			}
			return EvtSessionInit{
				SessionID:     msg.SessionID,
				Model:         msg.Model,
				Cwd:           msg.Cwd,
				Version:       msg.Version,
				SlashCommands: msg.SlashCommands,
				Skills:        msg.Skills,
				Tools:         msg.Tools,
				Agents:        msg.Agents,
			}, nil

		case "status":
			var msg SystemStatus
			if err := json.Unmarshal(raw, &msg); err != nil {
				return EvtParseError{Line: line, Err: err}, nil
			}
			return EvtStatusMsg{Message: msg.Message}, nil

		case "local_command":
			var msg SystemLocalCommand
			if err := json.Unmarshal(raw, &msg); err == nil && msg.Content != "" {
				cleaned := CleanLocalCommandOutput(msg.Content)
				if cleaned != "" {
					return EvtAssistantText{Content: cleaned}, nil
				}
			}
			return nil, nil

		default:
			return nil, nil // ignore other system subtypes
		}

	// ── User messages (Slash command outputs / replays) ───────────────────
	case "user":
		var u UserEnvelope
		if err := json.Unmarshal(raw, &u); err == nil {
			var strContent string
			if json.Unmarshal(u.Message.Content, &strContent) == nil {
				if strings.Contains(strContent, "<local-command-stdout>") || strings.Contains(strContent, "<local-command-stderr>") {
					cleaned := CleanLocalCommandOutput(strContent)
					if cleaned != "" {
						return EvtAssistantText{UUID: u.UUID, Content: cleaned}, nil
					}
				}
			}
		}
		return nil, nil

	// ── Assistant turns ──────────────────────────────────────────────────
	case "assistant":
		var msg AssistantEnvelope
		if err := json.Unmarshal(raw, &msg); err != nil {
			return EvtParseError{Line: line, Err: err}, nil
		}
		return dispatchAssistant(msg), nil

	// ── Streaming deltas ─────────────────────────────────────────────────
	case "stream_event":
		var se StreamEvent
		if err := json.Unmarshal(raw, &se); err != nil {
			return EvtParseError{Line: line, Err: err}, nil
		}
		delta := se.Event.Delta
		if delta == nil {
			return nil, nil
		}
		switch delta.Type {
		case "text_delta":
			return EvtStreamDelta{Type: "text", Text: delta.Text}, nil
		case "thinking_delta":
			return EvtStreamDelta{Type: "thinking", Text: delta.Thinking}, nil
		}
		return nil, nil

	// ── Permission request ───────────────────────────────────────────────
	case "control_request":
		var cr ControlRequestOut
		if err := json.Unmarshal(raw, &cr); err != nil {
			return EvtParseError{Line: line, Err: err}, nil
		}
		if cr.Request.Subtype != "can_use_tool" {
			return nil, nil
		}
		inputJSON := prettyJSON(cr.Request.Input)
		return EvtPermissionRequest{
			RequestID: cr.RequestID,
			ToolName:  cr.Request.ToolName,
			InputJSON: inputJSON,
		}, nil

	// ── Turn result ──────────────────────────────────────────────────────
	case "result":
		var r ResultEnvelope
		if err := json.Unmarshal(raw, &r); err != nil {
			return EvtParseError{Line: line, Err: err}, nil
		}
		evt := EvtTurnComplete{Subtype: r.Subtype}
		if len(r.Errors) > 0 {
			evt.ErrorMessage = strings.Join(r.Errors, "; ")
		} else if r.Result != "" {
			cleaned := CleanLocalCommandOutput(r.Result)
			if cleaned != "" {
				evt.Result = cleaned
			}
		}
		if r.Usage != nil {
			evt.InputTokens = r.Usage.InputTokens
			evt.OutputTokens = r.Usage.OutputTokens
		}
		return evt, nil

	default:
		return nil, nil // unknown type → silently ignore
	}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// dispatchAssistant breaks apart an assistant turn into tool-use and text events.
// We return the first meaningful event; tool use blocks are returned as EvtToolUse.
func dispatchAssistant(msg AssistantEnvelope) interface{} {
	var textParts []string
	var thinkingParts []string

	for _, block := range msg.Message.Content {
		switch block.Type {
		case "text":
			textParts = append(textParts, block.Text)
		case "thinking":
			thinkingParts = append(thinkingParts, block.Thinking)
		case "tool_use":
			inputJSON := string(block.Input)
			if inputJSON == "" || inputJSON == "null" {
				inputJSON = "{}"
			}
			// Pretty-print for display.
			var m interface{}
			if json.Unmarshal(block.Input, &m) == nil {
				if pretty, err := json.MarshalIndent(m, "", "  "); err == nil {
					inputJSON = string(pretty)
				}
			}
			return EvtToolUse{
				UUID:      msg.UUID,
				ToolUseID: block.ID,
				ToolName:  block.Name,
				InputJSON: inputJSON,
			}
		}
	}

	return EvtAssistantText{
		UUID:     msg.UUID,
		Content:  strings.Join(textParts, ""),
		Thinking: strings.Join(thinkingParts, ""),
	}
}

func prettyJSON(v interface{}) string {
	if v == nil {
		return "{}"
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return "{}"
	}
	return string(b)
}

// CleanLocalCommandOutput strips <local-command-stdout> or <local-command-stderr> XML tags.
func CleanLocalCommandOutput(raw string) string {
	s := raw
	if idx := strings.Index(s, "<local-command-stdout>"); idx != -1 {
		s = s[idx+len("<local-command-stdout>"):]
		if end := strings.Index(s, "</local-command-stdout>"); end != -1 {
			s = s[:end]
		}
	} else if idx := strings.Index(s, "<local-command-stderr>"); idx != -1 {
		s = s[idx+len("<local-command-stderr>"):]
		if end := strings.Index(s, "</local-command-stderr>"); end != -1 {
			s = s[:end]
		}
	}
	return strings.TrimSpace(s)
}
