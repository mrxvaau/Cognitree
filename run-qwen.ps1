$env:QWEN_OAUTH = "1"

Write-Host "=== Qwen OAuth Mode ===" -ForegroundColor Green
Write-Host "LLM will authenticate via Qwen OAuth (1000 free requests/day)"
Write-Host ""

Write-Host "=== STARTING CLI ===" -ForegroundColor Cyan
bun src/entrypoints/cli.tsx 2>"$PSScriptRoot\cli_stderr.log"
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
