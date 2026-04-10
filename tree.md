# Source Code Tree Structure

```
D:\Project\REFECTOR\CC\
├── src/
│   ├── assistant/
│   │   └── sessionHistory.ts
│   ├── bootstrap/
│   │   └── state.ts
│   ├── bridge/ (32 files)
│   ├── buddy/ (6 files)
│   ├── cli/
│   │   ├── handlers/
│   │   ├── transports/
│   │   └── (5 files)
│   ├── commands/
│   │   ├── (90+ subdirectories: add-dir, agents, branch, bridge, config, etc.)
│   │   └── (12 files: advisor.ts, bridge-kick.ts, commit.ts, etc.)
│   ├── components/
│   │   ├── (30+ subdirectories: agents, messages, ui, Settings, etc.)
│   │   └── (100+ files: App.tsx, Message.tsx, Markdown.tsx, etc.)
│   ├── constants/ (22 files)
│   ├── context/ (9 files)
│   ├── coordinator/
│   │   └── coordinatorMode.ts
│   ├── entrypoints/
│   │   ├── sdk/
│   │   └── (5 files: cli.tsx, mcp.ts, etc.)
│   ├── hooks/
│   │   ├── notifs/
│   │   ├── toolPermission/
│   │   └── (83 files: useSettings.ts, useTasksV2.ts, etc.)
│   ├── ink/
│   │   ├── components/
│   │   ├── events/
│   │   ├── hooks/
│   │   ├── layout/
│   │   ├── termio/
│   │   └── (40+ files: ink.tsx, renderer.ts, etc.)
│   ├── keybindings/ (14 files)
│   ├── memdir/ (8 files)
│   ├── migrations/ (11 files)
│   ├── moreright/
│   │   └── useMoreRight.tsx
│   ├── native-ts/
│   │   ├── color-diff/
│   │   ├── file-index/
│   │   └── yoga-layout/
│   ├── outputStyles/
│   │   └── loadOutputStylesDir.ts
│   ├── plugins/
│   │   ├── bundled/
│   │   └── builtinPlugins.ts
│   ├── query/ (5 files)
│   ├── remote/ (4 files)
│   ├── schemas/
│   │   └── hooks.ts
│   ├── screens/ (3 files)
│   ├── server/
│   │   ├── analytics/
│   │   ├── api/
│   │   ├── auth/
│   │   ├── db/
│   │   ├── observability/
│   │   ├── security/
│   │   ├── web/
│   │   └── (3 files)
│   ├── services/
│   │   ├── (35+ subdirectories: mcp, oauth, lsp, etc.)
│   │   └── (18 files: awaySummary.ts, notifier.ts, etc.)
│   ├── shims/ (6 files)
│   ├── skills/
│   │   ├── bundled/
│   │   └── (3 files)
│   ├── state/ (6 files)
│   ├── tasks/
│   │   ├── DreamTask/
│   │   ├── InProcessTeammateTask/
│   │   ├── LocalAgentTask/
│   │   ├── LocalShellTask/
│   │   ├── RemoteAgentTask/
│   │   └── (4 files)
│   ├── tools/
│   │   ├── (40+ subdirectories: BashTool, FileEditTool, MCPTool, etc.)
│   │   └── utils.ts
│   ├── types/
│   │   ├── generated/
│   │   └── (13 files)
│   ├── upstreamproxy/ (2 files)
│   ├── utils/
│   │   ├── (30+ subdirectories: git, github, mcp, settings, etc.)
│   │   └── (290+ files)
│   ├── vim/ (5 files)
│   ├── voice/
│   │   └── voiceModeEnabled.ts
│   └── (17 files: main.tsx, Task.ts, Tool.ts, tools.ts, etc.)
├── mcp-server/
│   ├── api/
│   ├── src/
│   └── (7 files: package.json, tsconfig.json, etc.)
├── web/
│   ├── __tests__/
│   ├── app/
│   ├── components/
│   ├── e2e/
│   ├── hooks/
│   ├── lib/
│   ├── public/
│   ├── styles/
│   └── (16 files: WebApp.tsx, app.tsx, next.config.mjs, etc.)
├── scripts/ (22 files)
├── tests/
│   ├── integration/
│   ├── shims/
│   ├── smoke/
│   └── setup.ts
├── docs/
├── docker/
├── grafana/
├── helm/
├── prompts/
├── .github/
├── .qwen/
└── .vscode/
```

## Summary

- **src/** - Main source code (~500+ files across 35+ directories)
  - Core CLI, UI components, tools, commands, services, hooks
  - Terminal rendering via Ink
  - Bridge/messaging, tasks, state management
- **mcp-server/** - MCP server implementation
- **web/** - Web app (Next.js/Vite)
- **scripts/** - Build/dev/test scripts
- **tests/** - Integration, smoke, and shims tests
