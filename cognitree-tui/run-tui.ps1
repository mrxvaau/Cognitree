# run-tui.ps1
# Launches cognitree-tui with the TokenRouter / GLM-5.3 setup.
# Edit the vars below to match your configuration.

$env:LLM_BASE_URL  = "https://api.tokenrouter.com/v1"
$env:LLM_API_KEY   = "sk-SPoLYL5hbhOoKJOqvAwJDYR6SB99HcguW8oxm7Is7XLlxApE"
$env:LLM_MODEL     = "z-ai/glm-5.3-free"
$env:CLAUDE_CODE_SIMPLE  = "1"
$env:CLAUDE_CODE_NO_FLICKER = "1"
$env:COGNITREE_DEBUG = "1"

# Path to the compiled Go TUI binary
$tuiBin = "$PSScriptRoot\cognitree-tui.exe"

# Path to the TS backend cli.mjs
$cliMjs = "$PSScriptRoot\..\dist\cli.mjs"

# Working directory for the session
$workDir = "E:\REPO\sandbox"

if (-not (Test-Path $tuiBin)) {
    Write-Host "[run-tui] Building cognitree-tui.exe first..." -ForegroundColor Cyan
    Push-Location $PSScriptRoot
    go build -o cognitree-tui.exe .
    Pop-Location
}

Write-Host ""
Write-Host "  Starting Cognitree TUI" -ForegroundColor Magenta
Write-Host "  Model  : $env:LLM_MODEL" -ForegroundColor DarkGray
Write-Host "  URL    : $env:LLM_BASE_URL" -ForegroundColor DarkGray
Write-Host "  Dir    : $workDir" -ForegroundColor DarkGray
Write-Host ""

& $tuiBin -cli $cliMjs -dir $workDir
