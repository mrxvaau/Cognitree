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

set "TUI_DIR=%~dp0cognitree-tui"
set "CLI_MJS=%~dp0dist\cli.mjs"
set "WORK_DIR=E:\REPO\sandbox"

if not exist "%TUI_DIR%\cognitree-tui.exe" (
    echo Building cognitree-tui.exe...
    cd /d "%TUI_DIR%"
    go build -o "%TUI_DIR%\cognitree-tui.exe" .
)

"%TUI_DIR%\cognitree-tui.exe" -cli "%CLI_MJS%" -dir "%WORK_DIR%"

endlocal
