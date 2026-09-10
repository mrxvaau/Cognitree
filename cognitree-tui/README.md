# cognitree-tui

Go TUI for Cognitree — wraps the TS backend over stdio NDJSON.

## Build

```powershell
cd cognitree-tui
go mod tidy
go build -o cognitree-tui.exe .
```

## Run

```powershell
# With Ollama (local LLM — no Anthropic login needed):
.\cognitree-tui\cognitree-tui.exe `
  -url    http://localhost:11434/v1 `
  -apikey ollama `
  -model  qwen2.5-coder:latest `
  -dir    E:\REPO\YourProject

# Or set env vars and omit flags — they are inherited automatically:
$env:LLM_BASE_URL = "http://localhost:11434/v1"
$env:LLM_API_KEY  = "ollama"
$env:LLM_MODEL    = "qwen2.5-coder:latest"
.\cognitree-tui\cognitree-tui.exe -dir E:\REPO\YourProject

# With Anthropic (requires ANTHROPIC_API_KEY in env):
.\cognitree-tui\cognitree-tui.exe -model claude-opus-4-5 -dir E:\REPO\sandbox

# Point at a custom cli.mjs:
.\cognitree-tui\cognitree-tui.exe -cli .\dist\cli.mjs -dir E:\REPO\sandbox
```

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-dir` | cwd | Working directory passed to the backend |
| `-cli` | auto-detect | Path to `dist/cli.mjs` |
| `-url` | `$LLM_BASE_URL` | LLM base URL (e.g. Ollama: `http://localhost:11434/v1`) |
| `-apikey` | `$LLM_API_KEY` | LLM API key (`ollama` for Ollama) |
| `-model` | `$LLM_MODEL` | LLM model name |

> **Note:** If `LLM_BASE_URL` is set (via flag or env), the TUI automatically sets
> `CLAUDE_CODE_SIMPLE=1` and `CLAUDE_CODE_NO_FLICKER=1` on the backend to prevent
> the Ink renderer from conflicting with the pipe.

## Keybindings

| Key | Action |
|-----|--------|
| Enter | Send message |
| Ctrl+C | Interrupt + exit |
| PgUp / PgDn | Scroll viewport |
| Y / Enter | Allow tool (when permission dialog shown) |
| N | Deny tool |
| A | Allow tool (same as Y for now) |

## Architecture

```
cognitree-tui.exe
  ├── main.go       — entry point, flag parsing, env wiring, process management
  ├── model.go      — Bubble Tea state struct
  ├── update.go     — event handler + message renderer
  ├── view.go       — TUI layout (header, viewport, input bar)
  ├── protocol.go   — child process, NDJSON read/write
  ├── messages.go   — Go structs mirroring SDK types
  └── styles.go     — lipgloss colour palette
```

The TUI spawns `bun dist/cli.mjs --print --input-format=stream-json --output-format=stream-json --verbose --include-partial-messages` and communicates over stdio NDJSON.
The spawned process inherits a full copy of the parent environment, with any `-url`/`-apikey`/`-model` flags merged in on top.
