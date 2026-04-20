@echo off
cd /d D:\Project\REFECTOR\CC
set QWEN_OAUTH=1
title Claude Code - Qwen Free Tier
echo === Qwen OAuth Mode ===
echo LLM will authenticate via Qwen OAuth (1000 free requests/day)
echo.
bun src/entrypoints/cli.tsx
pause
