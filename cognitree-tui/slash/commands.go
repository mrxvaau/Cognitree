package slash

import (
	"fmt"
	"strings"
)

// builtinCommands returns the list of built-in slash commands.
// Non-builtin commands are still shown in typeahead so users can discover them;
// they will be sent verbatim to the backend when selected.
func builtinCommands() []Command {
	return []Command{
		// ── UI-side (Go handles these) ──────────────────────────────────────
		{
			Name:        "help",
			Aliases:     []string{"h", "?"},
			Description: "Show available commands",
			Builtin:     true,
			Handler: func(args string) CommandResult {
				return CommandResult{ClearInput: true, Action: "help"}
			},
		},
		{
			Name:        "clear",
			Aliases:     []string{"cls"},
			Description: "Clear the conversation transcript",
			Builtin:     true,
			Handler: func(args string) CommandResult {
				return CommandResult{ClearInput: true, Action: "clear"}
			},
		},
		{
			Name:        "exit",
			Aliases:     []string{"quit", "q"},
			Description: "Exit Cognitree",
			Builtin:     true,
			Handler: func(args string) CommandResult {
				return CommandResult{ClearInput: true, Action: "quit"}
			},
		},
		{
			Name:        "model",
			Description: "Switch LLM model   /model <name>",
			Builtin:     true,
			Handler: func(args string) CommandResult {
				if strings.TrimSpace(args) == "" {
					return CommandResult{Action: "cost"} // no arg → show current
				}
				return CommandResult{ClearInput: true, Action: "set_model", Args: strings.TrimSpace(args)}
			},
		},
		{
			Name:        "cost",
			Description: "Show session token usage and cost",
			Builtin:     true,
			Handler: func(args string) CommandResult {
				return CommandResult{ClearInput: true, Action: "cost"}
			},
		},
		// ── Backend-delegated (sent as user message) ────────────────────────
		{
			Name:        "compact",
			Description: "Compact the conversation context",
			Builtin:     false,
		},
		{
			Name:        "context",
			Description: "Show context window usage",
			Builtin:     false,
		},
		{
			Name:        "memory",
			Description: "Manage agent memory",
			Builtin:     false,
		},
		{
			Name:        "config",
			Description: "View or edit configuration",
			Builtin:     false,
		},
		{
			Name:        "init",
			Description: "Initialise project in current directory",
			Builtin:     false,
		},
		{
			Name:        "review",
			Description: "Review latest changes",
			Builtin:     false,
		},
		{
			Name:        "commit",
			Description: "Stage and commit changes",
			Builtin:     false,
		},
		{
			Name:        "diff",
			Description: "Show git diff of current changes",
			Builtin:     false,
		},
		{
			Name:        "branch",
			Description: "Create or switch git branch",
			Builtin:     false,
		},
		{
			Name:        "files",
			Description: "List files tracked in the session",
			Builtin:     false,
		},
		{
			Name:        "status",
			Description: "Show git status",
			Builtin:     false,
		},
		{
			Name:        "vim",
			Description: "Toggle vim keybindings",
			Builtin:     false,
		},
		{
			Name:        "doctor",
			Description: "Run diagnostics",
			Builtin:     false,
		},
		{
			Name:        "mcp",
			Description: "Manage MCP servers",
			Builtin:     false,
		},
		{
			Name:        "resume",
			Description: "Resume a previous session",
			Builtin:     false,
		},
		{
			Name:        "session",
			Description: "Manage sessions",
			Builtin:     false,
		},
		{
			Name:        "tasks",
			Description: "View agent task list",
			Builtin:     false,
		},
		{
			Name:        "plan",
			Description: "Toggle plan mode",
			Builtin:     false,
		},
		{
			Name:        "agents",
			Description: "View and manage agent subagents",
			Builtin:     false,
		},
		{
			Name:        "permissions",
			Description: "Manage tool permissions",
			Builtin:     false,
		},
		{
			Name:        "keybindings",
			Description: "Show keybinding reference",
			Builtin:     false,
		},
		{
			Name:        "feedback",
			Description: "Send feedback",
			Builtin:     false,
		},
		{
			Name:        "theme",
			Description: "Change colour theme",
			Builtin:     false,
		},
		{
			Name:        "export",
			Description: "Export conversation",
			Builtin:     false,
		},
		{
			Name:        "upgrade",
			Description: "Upgrade Cognitree",
			Builtin:     false,
		},
	}
}

// ─── Help text ────────────────────────────────────────────────────────────────

// HelpText returns a formatted help string for all registered commands.
func HelpText(reg *Registry) string {
	var sb strings.Builder
	sb.WriteString("Available slash commands:\n\n")
	for _, cmd := range reg.All() {
		tag := ""
		if !cmd.Builtin {
			tag = " (backend)"
		}
		aliases := ""
		if len(cmd.Aliases) > 0 {
			aliases = fmt.Sprintf(" · aliases: %s", strings.Join(cmd.Aliases, ", "))
		}
		sb.WriteString(fmt.Sprintf("  /%s%s  —  %s%s\n", cmd.Name, aliases, cmd.Description, tag))
	}
	sb.WriteString("\nKeyboard shortcuts:\n")
	sb.WriteString("  Enter        Send message\n")
	sb.WriteString("  Ctrl+J       Insert newline\n")
	sb.WriteString("  Ctrl+C       Interrupt / Quit\n")
	sb.WriteString("  PgUp / PgDn  Scroll transcript\n")
	sb.WriteString("  ↑ / ↓        Navigate slash suggestions\n")
	sb.WriteString("  Tab          Accept top slash suggestion\n")
	sb.WriteString("  Esc          Cancel slash mode\n")
	return sb.String()
}
