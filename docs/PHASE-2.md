# Phase 2: AI providers

## Scope

- Connect OpenAI, Anthropic Claude, Google Gemini, and OpenRouter with the user's own API keys.
- Call the providers' official HTTPS APIs directly from the main process (no vendor SDKs), with streamed responses.
- Store API keys encrypted with Electron `safeStorage` (Windows DPAPI). Keys never reach the renderer.
- AI providers dialog: paste a key, verify it, replace it, remove it, open the provider's key page.
- AI assistant panel (Ctrl+L): provider and model selection, streaming chat, Stop, new chat, per-chat token usage, optional "include the open file" context.

Out of scope: the Agent Engine. The model cannot read other files, edit files, or run commands. That is Phase 3.

## Implementation

| Area | File |
| --- | --- |
| Shared types | `src/shared/ai.ts` |
| SSE parser | `electron/main/ai/sse.ts` |
| Providers | `electron/main/ai/providers.ts` |
| Encrypted key store | `electron/main/ai/credentials.ts` |
| Service (validation, chat lifecycle, cancellation) | `electron/main/ai/service.ts` |
| IPC handlers | `electron/main/index.ts` (`ai:*` channels) |
| UI | `src/renderer/src/components/AiPanel.tsx`, `AiSettingsDialog.tsx` |

Provider endpoints:

- OpenAI: `GET /v1/models`, `POST /v1/chat/completions` (stream, usage included)
- OpenRouter: `GET /api/v1/models`, `POST /api/v1/chat/completions`
- Anthropic: `GET /v1/models`, `POST /v1/messages` (stream, `anthropic-version: 2023-06-01`, 8192 max output tokens)
- Gemini: `GET /v1beta/models`, `POST /v1beta/models/{model}:streamGenerateContent?alt=sse`

A key is saved only after the provider accepts it for a model-list request. The selected provider and model are stored in the `app_settings` table of the local SQLite database; keys are not.

## Acceptance criteria

1. A valid key for each provider can be saved; an invalid key shows the provider's error and is not saved.
2. After restart, connected providers stay connected and the last provider/model selection is restored.
3. Chat answers stream in; Stop ends the request; token usage is shown when the provider reports it.
4. With "Include file" checked, the open file's current editor content is sent as context.
5. Removing a key disconnects the provider and clears its selection.

## Verification status

Automated: SSE parsing, all four provider stream formats, model filtering, HTTP error messages, encrypted key storage, key verification, chat event flow, request validation, and app settings persistence (`npm test`).

Not yet verified: real calls with live API keys and a manual run of the installed app.
