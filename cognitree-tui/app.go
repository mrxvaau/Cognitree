package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/google/uuid"

	"cognitree-tui/model"
	"cognitree-tui/protocol"
	"cognitree-tui/slash"
	"cognitree-tui/styles"
	"cognitree-tui/ui"
)

// ─── Spinner tick ─────────────────────────────────────────────────────────────

type spinnerTickMsg struct{}

func spinnerTick() tea.Cmd {
	return tea.Tick(80*time.Millisecond, func(t time.Time) tea.Msg {
		return spinnerTickMsg{}
	})
}

var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

// ─── App ──────────────────────────────────────────────────────────────────────

type App struct {
	state    model.State
	back     *protocol.BackendProcess
	slashReg *slash.Registry
}

func newApp(back *protocol.BackendProcess, initialModel string) App {
	s := model.NewState()
	s.Session.ModelName = initialModel

	return App{
		state:    s,
		back:     back,
		slashReg: slash.NewRegistry(),
	}
}

func (a App) Init() tea.Cmd {
	return tea.Batch(
		textarea.Blink,
		spinnerTick(),
	)
}

func (a App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {

	// ── Window resize ────────────────────────────────────────────────────────
	case tea.WindowSizeMsg:
		a.state.Width = msg.Width
		a.state.Height = msg.Height
		a.state.Input.SetWidth(max(msg.Width-4, 20))
		if !a.state.Ready {
			a.state.Ready = true
			a.state.Viewport = viewport.New(msg.Width, viewportHeight(msg.Height))
			a.state.Viewport.SetContent(a.viewportContent())
		} else {
			a.state.Viewport.Width = msg.Width
			a.state.Viewport.Height = viewportHeight(msg.Height)
		}
		return a, nil

	// ── Spinner tick ─────────────────────────────────────────────────────────
	case spinnerTickMsg:
		if a.state.Streaming {
			a.state.Spinner.Frame = (a.state.Spinner.Frame + 1) % len(spinnerFrames)
		}
		return a, spinnerTick()

	// ── Backend line ─────────────────────────────────────────────────────────
	case protocol.BackendMsg:
		if msg.Err != nil {
			a.state.Messages = append(a.state.Messages, model.NewErrorMsg("Backend read error: "+msg.Err.Error()))
			a.refreshViewport()
			return a, nil
		}
		cmd := a.handleBackendLine(msg.Line)
		if cmd != nil {
			cmds = append(cmds, cmd)
		}
		return a, tea.Batch(cmds...)

	// ── Backend exit ─────────────────────────────────────────────────────────
	case protocol.BackendExitMsg:
		if msg.Err != nil {
			a.state.FatalErr = fmt.Sprintf("Backend exited: %v", msg.Err)
		} else {
			a.state.FatalErr = "Backend exited."
		}
		return a, nil

	// ── Typed events ─────────────────────────────────────────────────────────
	case protocol.EvtSessionInit:
		a.state.Session.ID = msg.SessionID
		if msg.Model != "" {
			a.state.Session.ModelName = msg.Model
		}
		a.state.Session.Cwd = msg.Cwd
		a.state.Session.Version = msg.Version
		return a, nil

	case protocol.EvtStatusMsg:
		a.state.StatusMsg = msg.Message
		return a, nil

	case protocol.EvtStreamDelta:
		if !a.state.Streaming {
			a.state.Streaming = true
		}
		if msg.Type == "text" {
			a.state.StreamBuf += msg.Text
		}
		a.refreshViewport()
		if a.state.AutoScroll {
			a.state.Viewport.GotoBottom()
		}
		return a, nil

	case protocol.EvtAssistantText:
		a.state.Streaming = false
		a.state.StreamBuf = ""
		a.state.Messages = append(a.state.Messages, model.ChatMessage{
			Role:         model.RoleAssistant,
			Content:      msg.Content,
			ThinkingText: msg.Thinking,
			UUID:         msg.UUID,
			Timestamp:    time.Now(),
		})
		if !a.state.AutoScroll {
			a.state.UnseenCount++
		}
		a.refreshViewport()
		if a.state.AutoScroll {
			a.state.Viewport.GotoBottom()
		}
		return a, nil

	case protocol.EvtToolUse:
		a.state.Streaming = false
		a.state.StreamBuf = ""
		a.state.Messages = append(a.state.Messages, model.NewToolUseMsg(
			msg.ToolUseID, msg.ToolName, msg.InputJSON,
		))
		a.refreshViewport()
		if a.state.AutoScroll {
			a.state.Viewport.GotoBottom()
		}
		return a, nil

	case protocol.EvtPermissionRequest:
		a.state.Streaming = false
		a.state.StreamBuf = ""
		if a.state.AlwaysAllow[msg.ToolName] {
			_ = a.back.SendControlResponse(msg.RequestID, map[string]interface{}{
				"behavior": "allow",
			})
			return a, nil
		}
		a.state.PendingPerm = &model.PermissionPrompt{
			RequestID: msg.RequestID,
			ToolName:  msg.ToolName,
			InputJSON: msg.InputJSON,
		}
		return a, nil

	case protocol.EvtTurnComplete:
		a.state.Streaming = false
		a.state.StreamBuf = ""
		a.state.InputTokens += msg.InputTokens
		a.state.OutputTokens += msg.OutputTokens
		if msg.ErrorMessage != "" {
			a.state.Messages = append(a.state.Messages, model.NewErrorMsg(msg.ErrorMessage))
			a.refreshViewport()
		}
		a.state.StatusMsg = ""
		return a, nil

	case protocol.EvtParseError:
		return a, nil

	// ── Key events ────────────────────────────────────────────────────────────
	case tea.KeyMsg:
		return a.handleKey(msg, &cmds)
	}

	var vpCmd tea.Cmd
	a.state.Viewport, vpCmd = a.state.Viewport.Update(msg)
	if vpCmd != nil {
		cmds = append(cmds, vpCmd)
	}

	return a, tea.Batch(cmds...)
}

// ─── Key handler ─────────────────────────────────────────────────────────────

func (a App) handleKey(msg tea.KeyMsg, cmds *[]tea.Cmd) (tea.Model, tea.Cmd) {
	if a.state.PendingPerm != nil {
		return a.handlePermKey(msg)
	}

	// Slash overlay navigation
	if a.state.InputMode == model.ModeSlash && len(a.state.SlashMatches) > 0 {
		switch msg.String() {
		case "up":
			if a.state.SlashSelected > 0 {
				a.state.SlashSelected--
			}
			return a, nil
		case "down":
			if a.state.SlashSelected < len(a.state.SlashMatches)-1 {
				a.state.SlashSelected++
			}
			return a, nil
		case "tab", "enter":
			return a.acceptSlash()
		case "esc":
			a.state.InputMode = model.ModeNormal
			a.state.SlashMatches = nil
			a.state.SlashSelected = 0
			return a, nil
		}
	}

	switch msg.String() {
	case "ctrl+c":
		if a.state.Streaming {
			_ = a.back.SendInterrupt(uuid.New().String())
			a.state.Streaming = false
			a.state.StreamBuf = ""
			a.state.StatusMsg = "Interrupted"
			return a, nil
		}
		return a, tea.Quit

	case "enter":
		if a.state.Input.Value() == "" {
			return a, nil
		}
		return a.submitInput()

	case "pgup", "ctrl+u":
		a.state.AutoScroll = false
		a.state.Viewport.HalfViewUp()
		return a, nil

	case "pgdown", "ctrl+d":
		a.state.Viewport.HalfViewDown()
		if a.state.Viewport.AtBottom() {
			a.state.AutoScroll = true
			a.state.UnseenCount = 0
		}
		return a, nil

	case "ctrl+l":
		a.state.Messages = nil
		a.state.StreamBuf = ""
		a.state.Streaming = false
		a.state.ShowContext = false
		a.refreshViewport()
		return a, nil

	default:
		var taCmd tea.Cmd
		a.state.Input, taCmd = a.state.Input.Update(msg)
		*cmds = append(*cmds, taCmd)

		val := a.state.Input.Value()
		if strings.HasPrefix(val, "/") {
			a.state.InputMode = model.ModeSlash
			query := val
			matches := a.slashReg.Match(query)
			a.state.SlashMatches = slashEntries(matches)
			if a.state.SlashSelected >= len(a.state.SlashMatches) {
				a.state.SlashSelected = 0
			}
		} else {
			a.state.InputMode = model.ModeNormal
			a.state.SlashMatches = nil
			a.state.SlashSelected = 0
		}
		return a, tea.Batch(*cmds...)
	}
}

// ─── Permission key handler ───────────────────────────────────────────────────

func (a App) handlePermKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	p := a.state.PendingPerm
	switch strings.ToLower(msg.String()) {
	case "y", "enter":
		_ = a.back.SendControlResponse(p.RequestID, map[string]interface{}{"behavior": "allow"})
		a.state.PendingPerm = nil
		a.state.Streaming = true
	case "a":
		a.state.AlwaysAllow[p.ToolName] = true
		_ = a.back.SendControlResponse(p.RequestID, map[string]interface{}{"behavior": "allow"})
		a.state.PendingPerm = nil
		a.state.Streaming = true
	case "n", "esc":
		_ = a.back.SendControlDeny(p.RequestID, "denied by user")
		a.state.PendingPerm = nil
		a.state.Messages = append(a.state.Messages,
			model.NewSystemMsg(fmt.Sprintf("Denied tool: %s", p.ToolName), ""),
		)
		a.refreshViewport()
	}
	return a, nil
}

// ─── Submit message ───────────────────────────────────────────────────────────

func (a App) submitInput() (tea.Model, tea.Cmd) {
	text := strings.TrimRight(a.state.Input.Value(), "\n ")
	if text == "" {
		return a, nil
	}
	a.state.Input.Reset()
	a.state.InputMode = model.ModeNormal
	a.state.SlashMatches = nil
	a.state.SlashSelected = 0
	a.state.AutoScroll = true
	a.state.UnseenCount = 0

	if strings.HasPrefix(text, "/") {
		name, args := slash.Parse(text)
		if cmd, ok := a.slashReg.Find(name); ok && cmd.Builtin {
			result := cmd.Handler(args)
			return a.applySlashResult(result, text)
		}
	}

	a.state.Messages = append(a.state.Messages, model.NewUserMsg(text))
	a.refreshViewport()
	a.state.Viewport.GotoBottom()
	a.state.Streaming = true
	_ = a.back.SendUserMessage(text)
	return a, nil
}

// applySlashResult executes the outcome of a built-in slash command.
func (a App) applySlashResult(r slash.CommandResult, originalText string) (tea.Model, tea.Cmd) {
	if r.ClearInput {
		a.state.Input.Reset()
	}
	switch r.Action {
	case "quit":
		return a, tea.Quit
	case "clear":
		a.state.Messages = nil
		a.state.StreamBuf = ""
		a.state.Streaming = false
		a.state.ShowContext = false
		a.refreshViewport()
	case "help":
		helpText := slash.HelpText(a.slashReg)
		a.state.Messages = append(a.state.Messages,
			model.NewSystemMsg(helpText, "help"),
		)
		a.refreshViewport()
		a.state.Viewport.GotoBottom()
	case "set_model":
		newModel := r.Args
		_ = a.back.SendSetModel(uuid.New().String(), newModel)
		a.state.Session.ModelName = newModel
		a.state.Messages = append(a.state.Messages,
			model.NewSystemMsg(fmt.Sprintf("Model switched to: %s", newModel), ""),
		)
		a.refreshViewport()
	case "cost":
		info := fmt.Sprintf("Tokens: %s in · %s out  |  Cost: $%.4f",
			humanTokens(a.state.InputTokens),
			humanTokens(a.state.OutputTokens),
			a.state.TotalCostUSD,
		)
		a.state.Messages = append(a.state.Messages, model.NewSystemMsg(info, ""))
		a.refreshViewport()
		a.state.Viewport.GotoBottom()
	case "context":
		a.state.ShowContext = !a.state.ShowContext
		a.refreshViewport()
		a.state.Viewport.GotoBottom()
	default:
		a.state.Messages = append(a.state.Messages, model.NewUserMsg(originalText))
		a.refreshViewport()
		a.state.Viewport.GotoBottom()
		a.state.Streaming = true
		_ = a.back.SendUserMessage(originalText)
	}
	return a, nil
}

func (a App) acceptSlash() (tea.Model, tea.Cmd) {
	if len(a.state.SlashMatches) == 0 {
		return a, nil
	}
	sel := a.state.SlashMatches[a.state.SlashSelected]
	a.state.Input.SetValue("/" + sel.Name + " ")
	a.state.InputMode = model.ModeNormal
	a.state.SlashMatches = nil
	a.state.SlashSelected = 0
	return a, nil
}

func (a *App) handleBackendLine(line string) tea.Cmd {
	evt, _ := protocol.Dispatch(line)
	if evt == nil {
		return nil
	}
	return func() tea.Msg { return evt }
}

func (a *App) refreshViewport() {
	if !a.state.Ready {
		return
	}
	a.state.Viewport.SetContent(a.viewportContent())
}

func (a *App) viewportContent() string {
	if a.state.ShowContext {
		return ui.RenderContextVisualization(&a.state, a.state.Width)
	}
	if !a.state.HasMessages() && !a.state.Streaming {
		return ui.RenderWelcome(&a.state)
	}
	return ui.RenderMessages(
		a.state.Messages,
		a.state.StreamBuf,
		a.state.Streaming,
		a.state.Width,
	)
}

func viewportHeight(totalH int) int {
	const headerRows = 1
	const inputRows = 3
	const statusRows = 1
	h := totalH - headerRows - inputRows - statusRows
	if h < 5 {
		h = 5
	}
	return h
}

func (a App) View() string {
	if a.state.FatalErr != "" {
		return styles.StyleError.Render("\n  Fatal: " + a.state.FatalErr +
			"\n  Press Ctrl+C to exit.\n")
	}
	return ui.RenderLayout(&a.state, a.state.Viewport.View())
}

func slashEntries(cmds []slash.Command) []model.SlashEntry {
	out := make([]model.SlashEntry, len(cmds))
	for i, c := range cmds {
		out[i] = model.SlashEntry{
			Name:        c.Name,
			Description: c.Description,
			IsBuiltin:   c.Builtin,
		}
	}
	return out
}

func humanTokens(n int) string {
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}
	if n < 10000 {
		return fmt.Sprintf("%.1fk", float64(n)/1000)
	}
	return fmt.Sprintf("%dk", n/1000)
}

var _ = json.Marshal
var _ = lipgloss.NewStyle
