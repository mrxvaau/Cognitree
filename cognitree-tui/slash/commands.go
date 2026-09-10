package slash

import (
	"fmt"
	"strings"
)

// builtinCommands returns the complete set of slash commands from the TypeScript backend.
// Builtin = true means handled by Go client-side (help, clear, exit, model, cost, context).
// Builtin = false means sent to the TypeScript backend process via SendUserMessage.
func builtinCommands() []Command {
	return []Command{
		// ── Client-side UI Handlers ──────────────────────────────────────────
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
					return CommandResult{Action: "cost"}
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
		{
			Name:        "context",
			Description: "Show context window usage panel",
			Builtin:     true,
			Handler: func(args string) CommandResult {
				return CommandResult{ClearInput: true, Action: "context"}
			},
		},

		// ── Backend-Delegated Commands (Full TS parity: 72 commands) ─────────
		{Name: "add-dir", Description: "Add directory to workspace context"},
		{Name: "advisor", Description: "Run architectural advisor check"},
		{Name: "agents", Description: "View and manage agent subagents"},
		{Name: "ant-trace", Description: "Trace system execution logs"},
		{Name: "autofix-pr", Description: "Automatically fix PR review issues"},
		{Name: "backfill-sessions", Description: "Backfill historical session logs"},
		{Name: "batch", Description: "Execute batch operations"},
		{Name: "branch", Description: "Create or switch Git branch"},
		{Name: "btw", Description: "Add quick context note"},
		{Name: "bughunter", Description: "Run automated bug hunter"},
		{Name: "byok", Description: "Configure Bring-Your-Own-Key LLM settings"},
		{Name: "chrome", Description: "Launch or manage Chrome DevTools browser"},
		{Name: "cognitree-branch", Description: "Manage Git branch for Cognitree"},
		{Name: "cognitree-checkpoint", Description: "Create a conversation checkpoint"},
		{Name: "cognitree-init", Description: "Initialize Cognitree workspace configuration"},
		{Name: "cognitree-status", Description: "Show Cognitree project status"},
		{Name: "color", Description: "Change terminal color settings"},
		{Name: "commit", Description: "Stage and commit changes"},
		{Name: "commit-push-pr", Description: "Commit, push, and open PR"},
		{Name: "compact", Description: "Compact conversation context"},
		{Name: "config", Description: "View or edit configuration"},
		{Name: "copy", Description: "Copy code snippet to clipboard"},
		{Name: "debug", Description: "Run system debug diagnostics"},
		{Name: "desktop", Description: "Desktop app integration status"},
		{Name: "diff", Description: "Show git diff of current changes"},
		{Name: "doctor", Description: "Run system health check and diagnostics"},
		{Name: "effort", Description: "Set reasoning / thinking effort level"},
		{Name: "env", Description: "View environment variables"},
		{Name: "export", Description: "Export conversation transcript"},
		{Name: "extra-usage", Description: "Show detailed API quota breakdown"},
		{Name: "fast", Description: "Toggle fast inference mode"},
		{Name: "feedback", Description: "Send product feedback"},
		{Name: "files", Description: "List files tracked in current session"},
		{Name: "good-claude", Description: "Submit positive response feedback"},
		{Name: "heapdump", Description: "Take memory heap snapshot"},
		{Name: "hooks", Description: "Manage lifecycle hooks"},
		{Name: "ide", Description: "Manage IDE extension integration"},
		{Name: "init", Description: "Initialize project in current directory"},
		{Name: "init-verifiers", Description: "Initialize test verifiers"},
		{Name: "insights", Description: "Generate session insights report"},
		{Name: "install-github-app", Description: "Install GitHub App integration"},
		{Name: "install-slack-app", Description: "Install Slack App integration"},
		{Name: "issue", Description: "Create GitHub issue"},
		{Name: "keybindings", Description: "Show keybinding reference"},
		{Name: "login", Description: "Log in to account"},
		{Name: "logout", Description: "Log out of account"},
		{Name: "mcp", Description: "Manage MCP (Model Context Protocol) servers"},
		{Name: "memory", Description: "Manage agent memory and project rules"},
		{Name: "mobile", Description: "Mobile layout settings"},
		{Name: "onboarding", Description: "Run onboarding walkthrough"},
		{Name: "output-style", Description: "Change output formatting style"},
		{Name: "permissions", Description: "Manage tool approval permissions"},
		{Name: "plan", Description: "Toggle plan mode"},
		{Name: "plugin", Description: "Manage installed plugins"},
		{Name: "pr-comments", Description: "Review PR comments"},
		{Name: "privacy-settings", Description: "View privacy settings"},
		{Name: "release-notes", Description: "Generate release notes"},
		{Name: "reload-plugins", Description: "Reload active plugins"},
		{Name: "rename", Description: "Rename session"},
		{Name: "resume", Description: "Resume previous conversation session"},
		{Name: "review", Description: "Review latest code changes"},
		{Name: "rewind", Description: "Rewind conversation to prior state"},
		{Name: "sandbox-toggle", Description: "Toggle sandbox execution mode"},
		{Name: "security-review", Description: "Run security audit & review"},
		{Name: "session", Description: "Manage active sessions"},
		{Name: "share", Description: "Share conversation transcript"},
		{Name: "simplify", Description: "Simplify codebase and refactorings"},
		{Name: "skills", Description: "List available skills"},
		{Name: "stats", Description: "Show session statistics"},
		{Name: "status", Description: "Show git status"},
		{Name: "statusline", Description: "Configure status line display"},
		{Name: "stickers", Description: "Manage UI stickers"},
		{Name: "tag", Description: "Tag current session"},
		{Name: "tasks", Description: "View agent task list"},
		{Name: "teleport", Description: "Teleport session to remote host"},
		{Name: "theme", Description: "Change color theme"},
		{Name: "thinkback", Description: "Replay reasoning steps"},
		{Name: "upgrade", Description: "Upgrade Cognitree to latest version"},
		{Name: "usage", Description: "Show API usage quota"},
		{Name: "vim", Description: "Toggle vim keybindings"},
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
