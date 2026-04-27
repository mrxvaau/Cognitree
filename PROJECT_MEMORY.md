# Claude Code - Project Memory & Context
**Last Updated:** 2026-04-22 (Post-Gemini BYOK Integration)

## 📌 Overall Goal
To establish a fully functional, highly extensive interactive CLI setup of Claude Code that natively supports "Bring Your Own Key" (BYOK) for a variety of alternate LLMs natively without relying solely on Anthropic, allowing advanced usage on the free tier of other providers.

## ✔️ What Has Been Done (Recent Sessions History)
1. **Qwen OAuth Authentication**
   * Implemented Qwen OAuth API Integration.
   * Fixed 401 Unauthorized errors in the token pipeline.
   * Documented the complete technical specification of the Qwen Code OAuth2 system (endpoints, PKCE, device flow, rate limits).
2. **Cognitree Memory Engine Plugin Architecture**
   * Established Cognitree memory context logic for agentic file navigation.
   * Refactored Cognitree into an MCP server (Model Context Protocol) local-first without requiring external backend networks.
   * Debugged Cognitree MCP Server accessibility over `stdio`.
3. **Claude Code Bypassing & Localizing**
   * Achieved fully functional local booting of the CLI without relying natively on Anthropic's cloud dependencies.
   * Setup interactive generic LLM support allowing arbitrary provider hooks, successfully hooking up Ollama endpoints.
4. **Google Gemini BYOK Integration & Troubleshooting (Crucial Fix)**
   * **BYOK Setup**: Configured a `byok.env` file in `~/.claude/` setting `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.
   * **Handling Missing URL Formats**: Updated `src/services/api/llmClient.ts` to cleanly format the Base URL since Google's format required explicit path handling.
   * **Fixing API Tools Quota Exceeded (HTTP 429)**: The system got rate-limited quickly due to pointing at `gemini-2.0-flash`. Updated `byok.env` to point strictly to `gemini-2.5-flash` natively to alleviate limits hitting prematurely.
   * **Fixing Invalid Function Name Error (HTTP 400)**: Bypassed a severe bug in Google Gemini integration regarding tools format. Claude Code was occasionally transmitting tool mappings without a `.name` field because tools were natively translated into an OpenAI `parameters` structure. Extended `llmClient.ts` to map `t.name ?? t.function?.name` ensuring tools always maintain their nomenclature, preventing Gemini from crashing!
   * **Gemini Selector in Menu**: Appended a proper menu flow for Google within `src/commands/byok/byok.tsx` using Google's models endpoint validation checking.

## 🚀 Architectural Context
### `llmClient.ts`
This is where the API hooks format outgoing HTTP commands inside `createMessage()`. Any modifications on what is sent in the array of parameters to OpenAI compatible endpoints go here.
- Handled fallback mappings for Google.
- Disabled `stream_options` natively for Google as their endpoints throw bad requests when parsing it.

### `claude.ts`
The center for formatting the system tools, system prompts, beta headers, and dynamically loading memory capabilities via `getTools()`. This translates complex structures onto `allTools` array to be sent through `llmClient.ts`.

### BYOK Interactive Configs
- Managed inside `src/commands/byok/byok.tsx`.
- Configuration loads from the user`s global directory via `~/.claude/byok.env`. 

## 📝 What Needs To Be Done (Future)
1. **Extend Multi-Modality**: Deepen integrations spanning to vision APIs for Google Gemini BYOK. Allow uploading screenshots to Gemini using native multi-modal format bindings.
2. **Implement Rate Limiting Catching Mechanism**: If a provider returns `429 Quota Exceeded`, cleanly handle it across the CLI rather than printing raw stack traces.
3. **Finish Qwen Integrations Settings UI**: Complete the UX pipeline allowing users to easily select or revoke Qwen endpoint device flows.
4. **Testing Provider Compatibilities**: Constantly mock `OpenRouter`, `Groq`, and `Deepseek` directly inside the CLI. Evaluate if structured outputs mismatch in their endpoints.

## 🩺 Active Tips for Next Agent
- **DO NOT** attempt to map function arrays simply utilizing `t.name` without testing against `t.function?.name`. Many providers fail instantly on bad inputs!
- Use `require('fs').appendFileSync` or native stdout parsing cleanly when tracing CLI calls instead of complex UI terminal debugging. It prevents React render lockups inside Claude Code.
- Keep updating `BYOK.env` specifically to `gemini-2.5-flash` or higher when doing stress testing on Google models to bypass strict initial free tier ceilings.
