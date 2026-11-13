# CodeTeo security boundaries

## Electron configuration

- Renderer Node integration is disabled.
- Context isolation and the renderer sandbox are enabled.
- The preload exposes a typed allowlist, not raw IPC or Node APIs.
- IPC handlers accept requests only from the top-level application window.
- New windows are denied, and navigation outside the app's own renderer is blocked.

## Workspace filesystem

- The native folder picker establishes the workspace root.
- File operations accept workspace-relative paths only.
- Absolute paths, NUL bytes, and parent traversal are rejected.
- The main process resolves real paths and checks containment under the canonical root.
- Symlinks are not listed or opened.
- Only regular UTF-8 files up to 5 MiB are opened; existing regular files only are saved.
- Project dependencies and generated build folders are hidden from the explorer by default.
- New file and folder names are validated against Windows naming rules (reserved names, invalid characters, trailing dots or spaces). Create and rename never overwrite an existing entry.
- Rename and delete refuse symlinks and the workspace root itself. Delete moves items to the Windows Recycle Bin rather than removing them permanently.

The workspace is user-selected and may contain untrusted source code. Opening a file displays text; the app does not execute files automatically.

## Git status

The Git status service runs a fixed `git status` argument list with shell execution disabled. It reports branch and changed-file information and does not stage, commit, or otherwise modify repository data.

## Terminal

The integrated PowerShell runs with the same Windows permissions as CodeTeo. A user typing a command can make changes in their workspace or elsewhere that their account is allowed to make. Terminal input is user-controlled. The Agent has no access to that interactive terminal, but may propose a separate PowerShell command that runs only after explicit approval (see Reviewed Agent MVP below).

## AI providers and API keys

- API keys are entered in the renderer once and sent to the main process over the `ai:save-key` IPC channel. They are never returned to the renderer; the renderer only sees whether a provider is connected.
- The main process verifies a key with a model-list request before saving it.
- Keys are encrypted with Electron `safeStorage` (Windows DPAPI, bound to the current Windows account) and written as base64 to `ai-credentials.json` in the user-data folder. If secure storage is unavailable, keys are not saved. Keys are never stored in SQLite or logs.
- Built-in cloud-provider requests go to fixed official HTTPS endpoints from the main process. The local Kumru provider uses `http://127.0.0.1:8000/v1`. Users can add up to eight OpenAI-compatible endpoints; remote endpoints must use HTTPS, while plain HTTP is restricted to loopback addresses. Custom API keys are encrypted and sent only to the endpoint the user entered. The renderer's Content Security Policy does not allow it to contact external hosts.
- Provider error messages are shown to the user; they never include the key.
- Content sent to a provider: the chat messages and, only when "Include file" is checked, the open file's path relative to the workspace and its current editor content (up to 400,000 characters). The provider's own data policy applies to that content.
- Model prose is displayed as plain text and code blocks, never rendered as HTML. A model-proposed PowerShell command can run only after user approval and under the limits in the Reviewed Agent MVP section.
- In Chat mode the model cannot read other files, write files, or run commands.

## Reviewed Agent MVP

- Agent mode is available for OpenAI, Anthropic, Gemini, and OpenRouter, plus custom compatible endpoints where the user enables tools. The model selected on that endpoint must support tool calls; Kumru's built-in profile stays chat-only.
- Agent reads and lists only within the current workspace. Project contents are sent to the selected provider as needed. Reads are limited to 120,000 characters per task; tool results are capped at 40,000 characters.
- Known secret paths such as `.env*`, `.aws`, `.ssh`, private keys, and files with secret/credential/password/token names are blocked from reads and writes. This filename filter is a guardrail, not a complete secret scanner.
- The direct file-write tool replaces the full contents of an existing regular text file after an approval card is shown. The app rejects writes if an editor tab has unsaved changes and checks the file has not changed since the review was opened.
- The `run_command` tool shows the exact PowerShell command and waits for explicit approval. It runs with the current Windows account in the selected workspace, times out after 90 seconds, and returns bounded stdout/stderr to the model. An approved command can still change files or access resources that the account can reach; the user must review the command and its output data flow.
- The Agent cannot invoke the interactive terminal UI, and its direct file tools cannot create, delete, or rename files. The integrated terminal remains manually operated by the user.
- Workspace files are untrusted input; prompt-injection wording in them may affect model behavior, but cannot bypass the main-process workspace checks or the write approval.

## Local history and settings

The SQLite database stores recently opened workspace paths and timestamps, plus non-secret app settings such as the selected AI provider and model, in Electron's user-data folder. Renderer `localStorage` stores non-secret display and editor preferences. Both are independent of workspace contents. Uninstall preserves app data by design.

## Remaining Agent work

New capabilities such as direct file creation, delete/rename, automatic test execution, and background autonomy need their own threat review and approval design before implementation. Credentials must stay in the main process or OS credential storage and must never be sent to the renderer as reusable secrets.
