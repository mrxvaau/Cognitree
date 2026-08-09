@echo off
setlocal enabledelayedexpansion
title Cognitree Builder

:: ANSI colors (Win10+)
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "G=%ESC%[92m"
set "C=%ESC%[96m"
set "Y=%ESC%[93m"
set "W=%ESC%[97m"
set "R=%ESC%[91m"
set "D=%ESC%[90m"
set "B=%ESC%[1m"
set "X=%ESC%[0m"

cls
echo.
echo %G%  +------------------------------------------+%X%
echo %G%  ^|%X%  %B%%W%   *** C O G N I T R E E  Builder ***%X%    %G%^|%X%
echo %G%  ^|%X%  %D%         Build System v1.0              %X%  %G%^|%X%
echo %G%  +------------------------------------------+%X%
echo.
echo %D%    Entry  : src\entrypoints\cli.tsx%X%
echo %D%    Output : dist\cli.mjs%X%
echo %D%    Tool   : bun scripts/build-bundle.ts%X%
echo.
echo %C%    -------------------------------------------%X%
echo %Y%    [*] Building ... please wait%X%
echo %C%    -------------------------------------------%X%
echo.

:: ── Run build synchronously, capture to log ────────────────────────
set "TMPLOG=%~dp0.build_tmp.log"
if exist "%TMPLOG%" del "%TMPLOG%"

bun scripts/build-bundle.ts > "%TMPLOG%" 2>&1
set "BUILD_EXIT=%ERRORLEVEL%"

:: ── Check result ────────────────────────────────────────────────────
findstr /c:"Build complete" "%TMPLOG%" >nul 2>&1
set "FOUND_COMPLETE=%ERRORLEVEL%"

if "%BUILD_EXIT%"=="0" if "%FOUND_COMPLETE%"=="0" goto :success

:: ── FAIL ─────────────────────────────────────────────────────────────
echo.
echo %R%  +------------------------------------------+%X%
echo %R%  ^|%X%  %B%%W%[X]  BUILD FAILED%X%                        %R%^|%X%
echo %R%  +------------------------------------------+%X%
echo.
echo %Y%    --- Build Output ---%X%
echo.
type "%TMPLOG%"
echo.
goto :end

:success
:: ── Parse stats ──────────────────────────────────────────────────────
set "SZ="
set "TM="
for /f "tokens=*" %%l in ('findstr /c:"dist/cli.mjs:" "%TMPLOG%" 2^>nul') do set "SZ=%%l"
for /f "tokens=*" %%l in ('findstr /c:"Build complete in" "%TMPLOG%" 2^>nul') do set "TM=%%l"

echo.
echo %G%  +------------------------------------------+%X%
echo %G%  ^|%X%  %B%%W%[OK] BUILD SUCCESSFUL!%X%                  %G%^|%X%
echo %G%  +------------------------------------------+%X%
echo.
if defined SZ echo %D%    %SZ%%X%
if defined TM echo %D%    %TM%%X%
echo.

echo %C%  -------------------------------------------%X%
echo %B%%W%    Run in Sandbox:%X%
echo %C%  -------------------------------------------%X%
echo.
echo %Y%    Option 1 ^|^| cd to sandbox, then run:%X%
echo %W%       cd e:\REPO\sandbox%X%
echo %W%       bun e:\REPO\Cognitree\Cognitree\dist\cli.mjs%X%
echo.
echo %Y%    Option 2 ^|^| One-liner from anywhere:%X%
echo %W%       bun --cwd e:\REPO\sandbox e:\REPO\Cognitree\Cognitree\dist\cli.mjs%X%
echo.
echo %C%  -------------------------------------------%X%
echo %D%    Tip: Double-click build.bat to rebuild anytime.%X%
echo.

:end
if exist "%TMPLOG%" del "%TMPLOG%"
echo.
pause
endlocal
