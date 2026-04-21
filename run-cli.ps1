# Default: Local Ollama (override at runtime with /byok)
$env:LLM_BASE_URL = "http://localhost:11434/v1"
$env:LLM_MODEL = "qwen-coder-local"
$env:LLM_API_KEY = "ollama"

Write-Host "=== ENV SET ===" -ForegroundColor Green
Write-Host "LLM_BASE_URL: $env:LLM_BASE_URL"
Write-Host "LLM_MODEL: $env:LLM_MODEL"
Write-Host "Tip: Use /byok inside CLI to switch to OpenRouter" -ForegroundColor Cyan
Write-Host ""

Write-Host "=== STARTING CLI ===" -ForegroundColor Cyan
bun src/entrypoints/cli.tsx 2> "$PSScriptRoot\cli_stderr.log"
$exitCode = $LASTEXITCODE
Write-Host ""
Write-Host "=== CLI EXITED with code: $exitCode ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "=== STDERR LOG (last 30 lines) ===" -ForegroundColor Magenta
if (Test-Path "$PSScriptRoot\cli_stderr.log") {
    Get-Content "$PSScriptRoot\cli_stderr.log" | Select-Object -Last 30
}
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
