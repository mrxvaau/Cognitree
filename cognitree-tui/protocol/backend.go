package protocol

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"

	tea "github.com/charmbracelet/bubbletea"
)

// ─── BubbleTea message types ──────────────────────────────────────────────────

// BackendMsg carries a raw NDJSON line from the backend process.
type BackendMsg struct {
	Line string
	Err  error
}

// BackendExitMsg signals the backend process has exited.
type BackendExitMsg struct{ Err error }

// ─── BackendProcess ───────────────────────────────────────────────────────────

// BackendProcess manages the child bun/TS process lifecycle.
type BackendProcess struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	mu     sync.Mutex
	closed bool
}

// Spawn starts the TS backend as a child process.
// env is the full environment for the child (use os.Environ() as base).
//
// We do NOT pass --print. When stdout is piped (not a TTY), the backend
// detects isNonInteractive = true automatically via isTTY checks and enters
// its NDJSON streaming loop. --input-format=stream-json + --output-format=stream-json
// are still needed to configure the protocol; --verbose enables all messages;
// --include-partial-messages enables streaming deltas.
//
// One subtlety: when LLM_BASE_URL is set, the TS code overrides
// process.stdin.isTTY to true (line 867 in main.tsx), which would re-enable
// interactive mode. We counter this by setting CLAUDE_CODE_FORCE_SDK_MODE=1
// which the backend checks to stay in non-interactive mode regardless.
func Spawn(cliMjs, workDir string, env []string) (*BackendProcess, error) {
	// Signal to the TS backend that stdin is a Go TUI pipe, not a terminal.
	// This overrides the LLM_BASE_URL isTTY fallback in main.tsx so the backend
	// enters stream-json input mode even when LLM_BASE_URL is set.
	env = setEnvSlice(env, "COGNITREE_TUI_MODE", "1")

	args := []string{
		cliMjs,
		"--print",
		"--output-format=stream-json",
		"--input-format=stream-json",
		"--verbose",
		"--include-partial-messages",
	}

	cmd := exec.Command("bun", args...)
	cmd.Dir = workDir
	cmd.Stderr = os.Stderr // forward backend debug logs
	if len(env) > 0 {
		cmd.Env = env
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start backend: %w", err)
	}

	bp := &BackendProcess{cmd: cmd, stdin: stdin, stdout: stdout}
	return bp, nil
}

// ReadLoop reads NDJSON lines from backend stdout and sends them as
// BackendMsg to the BubbleTea program. Must be called in a goroutine.
func (b *BackendProcess) ReadLoop(p *tea.Program) {
	scanner := bufio.NewScanner(b.stdout)
	// Allow up to 4 MB per JSON line (large tool results).
	buf := make([]byte, 4*1024*1024)
	scanner.Buffer(buf, cap(buf))

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		p.Send(BackendMsg{Line: line})
	}
	if err := scanner.Err(); err != nil {
		p.Send(BackendMsg{Err: err})
	}
	// Reap child and signal done.
	exitErr := b.cmd.Wait()
	p.Send(BackendExitMsg{Err: exitErr})
}

// Kill terminates the backend process immediately.
func (b *BackendProcess) Kill() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.closed {
		b.closed = true
		_ = b.stdin.Close()
		if b.cmd.Process != nil {
			_ = b.cmd.Process.Kill()
		}
	}
}

// ─── Write helpers ────────────────────────────────────────────────────────────

func (b *BackendProcess) write(v interface{}) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return fmt.Errorf("backend stdin closed")
	}
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(b.stdin, "%s\n", data)
	return err
}

// SendUserMessage sends a user turn to the backend.
func (b *BackendProcess) SendUserMessage(content string) error {
	return b.write(UserTurn{
		Type:      "user",
		SessionID: "",
		Message: UserTurnMessage{
			Role:    "user",
			Content: content,
		},
		ParentID: nil,
	})
}

// SendControlRequest wraps an arbitrary typed payload in a control_request.
func (b *BackendProcess) SendControlRequest(requestID string, payload interface{}) error {
	inner, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return b.write(ControlRequest{
		Type:      "control_request",
		RequestID: requestID,
		Request:   json.RawMessage(inner),
	})
}

// SendInterrupt sends a soft interrupt (abort current turn).
func (b *BackendProcess) SendInterrupt(requestID string) error {
	return b.SendControlRequest(requestID, InterruptRequest{Subtype: "interrupt"})
}

// SendSetModel requests the backend switch to a different model.
func (b *BackendProcess) SendSetModel(requestID, model string) error {
	return b.SendControlRequest(requestID, SetModelRequest{
		Subtype: "set_model",
		Model:   model,
	})
}

// SendControlResponse sends a success control_response for a request.
func (b *BackendProcess) SendControlResponse(requestID string, response map[string]interface{}) error {
	return b.write(ControlResponse{
		Type: "control_response",
		Response: ControlResponsePayload{
			Subtype:   "success",
			RequestID: requestID,
			Response:  response,
		},
	})
}

// SendControlDeny sends a deny response for a can_use_tool request.
func (b *BackendProcess) SendControlDeny(requestID, reason string) error {
	return b.write(ControlResponse{
		Type: "control_response",
		Response: ControlResponsePayload{
			Subtype:   "success",
			RequestID: requestID,
			Response: map[string]interface{}{
				"behavior":  "deny",
				"message":   reason,
				"toolUseID": "",
			},
		},
	})
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// setEnvSlice returns env with KEY=value set, replacing any existing KEY.
func setEnvSlice(env []string, key, value string) []string {
	prefix := key + "="
	out := make([]string, 0, len(env)+1)
	for _, e := range env {
		if len(e) >= len(prefix) && e[:len(prefix)] == prefix {
			continue // drop existing
		}
		out = append(out, e)
	}
	return append(out, key+"="+value)
}
