@echo off
:: claude.cmd — Fast launcher using pre-built dist/cli.mjs
:: Place this file somewhere on your PATH or invoke directly.
:: Source mode (bun src/entrypoints/cli.tsx) hangs 24-120s due to bun:bundle
:: macro resolution in dev mode. Always use the built bundle.
bun "%~dp0dist\cli.mjs" %*
