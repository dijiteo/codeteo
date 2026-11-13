# CodeTeo

A Windows-only coding workspace built with Electron, React, TypeScript, CodeMirror 6, xterm.js, node-pty, and SQLite. Bring your own API key for OpenAI, Anthropic Claude, Google Gemini, or OpenRouter, or connect the local Kumru-2B server.

## Requirements

- Windows 10 or newer
- Node.js 22.12+, 24.x, or 26+ with npm
- PowerShell (included with Windows)

## Documentation

- Architecture: docs/ARCHITECTURE.md
- Project decisions: docs/DECISIONS.md
- Security boundaries: docs/SECURITY.md
- Phase 1 acceptance criteria: docs/PHASE-1.md
- Phase 2 (AI providers): docs/PHASE-2.md
- Phase 3 (reviewed Agent MVP): docs/PHASE-3.md
- Releases and updates: docs/RELEASES.md

## Development

~~~powershell
npm.cmd install
npm.cmd run dev
~~~

## Checks and packaging

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dist:win
~~~

The Windows installer is written to `release/` as `CodeTeo-<version>-Setup.exe`. It is an x64 NSIS installer. Future versions are distributed through the public GitHub Releases page at https://github.com/dijiteo/codeteo.

Installed builds can check for updates from the top toolbar, download a new release, and restart to install it. Release builds are published from GitHub Actions when a `v*` tag is pushed; see [docs/RELEASES.md](docs/RELEASES.md).

## Phase 1 features

- Native folder selection and a workspace file explorer
- Explorer create, rename (F2), and delete to the Recycle Bin (Del) via toolbar or right-click
- Multiple editor tabs with CodeMirror 6 syntax modes
- Search and replace (Ctrl+F / Ctrl+H), autocompletion, bracket matching, code folding
- UTF-8 text file open and save, including Ctrl+S, with an unsaved-changes prompt on quit
- PowerShell terminal backed by node-pty and xterm.js; hiding the panel keeps the session running
- Recent workspace history in a local SQLite database
- Context-isolated preload bridge and validated workspace file paths

## Phase 2 features

- AI providers dialog: add, verify, replace, and remove API keys for OpenAI, Anthropic, Gemini, and OpenRouter
- Keys are encrypted with Windows secure storage (DPAPI) and stay in the main process
- AI assistant panel (Ctrl+L) with provider/model selection, streaming answers, Stop, and token usage
- Optional context: send the open file's current content with the question
- Local Kumru-2B chat through an OpenAI-compatible server at `127.0.0.1:8000`
- Add up to eight OpenAI-compatible providers with a name, base URL, and optional API key; presets cover LM Studio, Ollama, and vLLM/Kumru
- Reviewed Agent mode for tool-capable OpenAI, Anthropic, Gemini, OpenRouter, and opted-in compatible endpoints: list/read workspace files and propose edits or commands for approval
- Agent mode requires approval for each file replacement and PowerShell command. Approved commands run as the current Windows user.

Agent mode reads workspace files and sends their contents to the selected provider. File replacements and command text are shown for review before applying or running them. An approved PowerShell command can make changes available to your Windows account.
