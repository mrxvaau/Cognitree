@echo off
setlocal enabledelayedexpansion

set "LLM_BASE_URL=https://api.tokenrouter.com/v1"
set "LLM_API_KEY=sk-SPoLYL5hbhOoKJOqvAwJDYR6SB99HcguW8oxm7Is7XLlxApE"
set "LLM_MODEL=z-ai/glm-5.3-free"
set "CLAUDE_CODE_SIMPLE=1"
set "CLAUDE_CODE_NO_FLICKER=1"
set "COGNITREE_DEBUG=1"

echo.
echo =======================================================
echo   Starting Cognitree TUI
echo   Model  : %LLM_MODEL%
echo   URL    : %LLM_BASE_URL%
echo =======================================================
echo.

cd /d "%~dp0"

if not exist "%~dp0cognitree-tui.exe" (
    echo Building cognitree-tui.exe...
    go build -o "%~dp0cognitree-tui.exe" .
)

"%~dp0cognitree-tui.exe" -cli "%~dp0..\dist\cli.mjs" -dir "E:\REPO\sandbox"

endlocal
