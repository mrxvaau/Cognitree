@echo off
cd /d D:\Project\REFECTOR\CC
set LLM_BASE_URL=http://localhost:11434/v1
set LLM_MODEL=qwen3:1.7b
set LLM_API_KEY=ollama
title Claude Code - Local LLM
bun src/entrypoints/cli.tsx
pause
