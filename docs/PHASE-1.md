# Phase 1 plan and acceptance criteria

## Included

- [x] Windows-only Electron shell with a React and TypeScript renderer
- [x] CodeMirror 6 editor with common language modes
- [x] Workspace explorer and multiple editor tabs
- [x] Explorer file and folder creation, rename (F2), and delete to the Recycle Bin (Del), with open tabs kept in sync
- [x] Editor search and replace (Ctrl+F / Ctrl+H), autocompletion, bracket matching and auto-closing, code folding
- [x] Unsaved-changes prompt before quitting the app or switching workspaces
- [x] Terminal session keeps running while the panel is hidden; Restart starts a new session
- [x] Workspace-relative file opening and saving, including Ctrl+S
- [x] Recent workspace history stored in local SQLite
- [x] Read-only Git branch and changed-file status
- [x] Context-isolated IPC with validated filesystem access
- [x] xterm.js terminal UI connected to a PowerShell pseudo-terminal
- [x] x64 NSIS installer configuration

## Stabilization gates

Phase 1 is complete only when all gates pass:

1. npm install completes on a supported Windows setup.
2. npm run typecheck passes for both Electron and renderer code.
3. npm test passes for workspace path and file access rules.
4. npm run build produces the packaged Electron app.
5. A Windows smoke check opens a workspace, opens and saves a UTF-8 file, restores recent workspace history after restart, and runs basic PowerShell commands in the integrated terminal.
6. npm run dist:win creates an x64 NSIS installer.

## Deferred

- OpenAI, Claude, Gemini, and OpenRouter integrations
- Autonomous agent, approvals, and model-driven terminal execution
- Database connection UI, including PostgreSQL
- Git staging, commits, branch changes, remotes, extensions, remote development, and project settings
- Project-wide search and advanced editor tooling (multi-file search, language servers)

## Current machine notes

The available machine has Node.js 25.2.1 and npm 11.6.2, but no Visual Studio C++ build tools. Workspace history uses sql.js WebAssembly to avoid a native SQLite compiler requirement. node-pty 1.1.0 loads under the Electron 45.3.0 runtime and starts PowerShell through ConPTY (verified with ELECTRON_RUN_AS_NODE). The installed app still needs a manual smoke check (gate 5). Dependency versions are pinned; update Electron and node-pty together and re-verify the terminal.
