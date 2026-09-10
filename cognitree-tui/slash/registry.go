package slash

import "strings"

// ─── Command Definition ───────────────────────────────────────────────────────

// Command describes a slash command that can appear in the typeahead.
type Command struct {
	Name        string
	Aliases     []string
	Description string
	// Builtin = true means the Go TUI handles it client-side.
	// Builtin = false means the raw text is sent as a user message to the backend.
	Builtin bool
	// Handler is called when the command is invoked (Builtin == true only).
	// Returns the updated input text (empty string = clear input) and an optional
	// tea.Cmd (use the function signature below to avoid import cycles; wired in app.go).
	Handler func(args string) CommandResult
}

// CommandResult is what a built-in command returns to the app layer.
type CommandResult struct {
	// ClearInput = true → wipe the input bar after dispatch.
	ClearInput bool
	// Action signals the app what to do:
	//   "clear"      → wipe the message list
	//   "quit"       → exit the TUI
	//   "help"       → show the help overlay
	//   "set_model"  → send set_model to backend; Args holds model name
	//   "compact"    → send /compact to backend as user message
	//   "cost"       → show cost info as a system message
	//   ""           → nothing (side-effect only)
	Action string
	Args   string
}

// ─── Registry ─────────────────────────────────────────────────────────────────

// Registry holds all known slash commands.
type Registry struct {
	commands []Command
}

// NewRegistry builds the default slash command registry.
func NewRegistry() *Registry {
	r := &Registry{}
	r.commands = builtinCommands()
	return r
}

// Match returns commands whose name or aliases begin with the query (case-insensitive).
// If query is empty, returns all commands.
func (r *Registry) Match(query string) []Command {
	q := strings.ToLower(strings.TrimPrefix(query, "/"))
	if q == "" {
		return r.commands
	}
	var out []Command
	for _, cmd := range r.commands {
		if strings.HasPrefix(strings.ToLower(cmd.Name), q) {
			out = append(out, cmd)
			continue
		}
		for _, alias := range cmd.Aliases {
			if strings.HasPrefix(strings.ToLower(alias), q) {
				out = append(out, cmd)
				break
			}
		}
	}
	return out
}

// Find returns the exact command by name or alias.
func (r *Registry) Find(name string) (Command, bool) {
	n := strings.ToLower(name)
	for _, cmd := range r.commands {
		if strings.ToLower(cmd.Name) == n {
			return cmd, true
		}
		for _, alias := range cmd.Aliases {
			if strings.ToLower(alias) == n {
				return cmd, true
			}
		}
	}
	return Command{}, false
}

// RegisterDynamicCommands dynamically registers all backend commands and skills.
func (r *Registry) RegisterDynamicCommands(names []string) {
	existing := make(map[string]bool)
	for _, c := range r.commands {
		existing[strings.ToLower(c.Name)] = true
		for _, a := range c.Aliases {
			existing[strings.ToLower(a)] = true
		}
	}

	for _, rawName := range names {
		name := strings.TrimSpace(strings.TrimPrefix(rawName, "/"))
		if name == "" || existing[strings.ToLower(name)] {
			continue
		}
		r.commands = append(r.commands, Command{
			Name:        name,
			Description: commandDesc(name),
			Builtin:     false,
		})
		existing[strings.ToLower(name)] = true
	}
}

func commandDesc(name string) string {
	switch name {
	case "update-config":
		return "Update configuration settings"
	case "debug":
		return "Run debug diagnostics"
	case "simplify":
		return "Simplify codebase or recent refactors"
	case "batch":
		return "Execute batch commands"
	case "cognitree-status":
		return "Show Cognitree project status"
	case "cognitree-checkpoint":
		return "Create a conversation checkpoint"
	case "cognitree-branch":
		return "Manage Git branch for Cognitree"
	case "cognitree-init":
		return "Initialize Cognitree configuration"
	case "insights":
		return "Show codebase analytics and insights"
	case "pr-comments":
		return "Fetch or post PR review comments"
	case "release-notes":
		return "Generate release notes"
	case "security-review":
		return "Run security audit & review"
	case "x402":
		return "Execute workspace action"
	default:
		return "Backend command / " + name
	}
}

// All returns all registered commands.
func (r *Registry) All() []Command {
	return r.commands
}

// ─── Parse helper ─────────────────────────────────────────────────────────────

// Parse splits "/name args..." into (name, args).
// If input doesn't start with "/" returns ("", input).
func Parse(input string) (name, args string) {
	if !strings.HasPrefix(input, "/") {
		return "", input
	}
	parts := strings.SplitN(strings.TrimPrefix(input, "/"), " ", 2)
	name = parts[0]
	if len(parts) > 1 {
		args = strings.TrimSpace(parts[1])
	}
	return
}

// ─── Overlay formatting helpers ───────────────────────────────────────────────

// FormatName returns the slash command name for display (plain string,
// styled by the caller).
func FormatName(name string) string { return name }

// FormatDesc returns the description for display.
func FormatDesc(desc string) string { return desc }

