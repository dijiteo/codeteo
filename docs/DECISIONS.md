# Project decisions

Decisions recorded from the project brief and subsequent implementation.

## Product

| Topic | Decision |
| --- | --- |
| Product name | CodeTeo |
| Supported desktop OS | Windows only |
| Initial release | Installable x64 Windows MVP |
| Phase 1 scope | Desktop shell, workspace editing, terminal, local history |
| AI providers | OpenAI, Anthropic, Gemini, OpenRouter, local Kumru-2B, and user-added OpenAI-compatible endpoints |
| Agent scope | OpenAI/OpenRouter file listing and reads; existing-file replacements require approval |

## Technology

| Area | Decision | Reason |
| --- | --- | --- |
| Desktop shell | Electron | Native Windows dialogs, packaging, and a controlled main/preload/renderer boundary |
| UI | React + TypeScript | Typed UI and IPC contracts |
| Bundling | electron-vite | Separate builds for the Electron processes and renderer |
| Editor | CodeMirror 6 | The selected editor for the coding workspace |
| Terminal display | xterm.js | Terminal rendering, keyboard input, and resize handling |
| Terminal process | node-pty + PowerShell | A real pseudo-terminal rather than a simulated command box |
| Git status | Git CLI with fixed read-only arguments | Branch and changed-file status without repository mutations |
| Local history | SQLite stored under app user data | Portable local history separate from workspace files |
| SQLite runtime | sql.js WebAssembly | SQLite persistence without requiring native database build tools |
| Installer | electron-builder NSIS, x64 | A standard Windows setup wizard with selectable install location |

## Security and behavior

- Keep context isolation and the Electron sandbox enabled; keep renderer Node integration disabled.
- Expose only typed, purpose-specific operations through preload.
- Keep workspace filesystem access in the main process and constrain it to the selected root.
- Do not execute commands from an AI model in Phase 1.
- Keep AI file changes behind main-process workspace checks and a per-write approval. Agent mode cannot use the interactive terminal; its separate PowerShell command tool requires per-command approval.
- Run the integrated terminal as the current Windows user in the selected workspace.
- Keep database history to recent workspace path and timestamp metadata.

## Native build constraint

Visual Studio C++ build tools are not available on the inspected machine. Workspace history therefore uses sql.js WebAssembly instead of a native SQLite binding. node-pty ships Windows x64 prebuilt files; Electron rebuild is disabled so packaging can use them without node-gyp. The packaged terminal still needs a runtime smoke check. The Windows release must not silently omit or replace the integrated terminal.

## Revisit triggers

- Revisit database storage only if workspace history grows beyond a small local table or concurrent access is introduced.
- Revisit terminal packaging if the pinned Electron version changes or the packaged Windows app cannot load the shipped node-pty binary.
- Consider PostgreSQL only for a later, explicit feature that connects to user databases. It is not required for local workspace history.
