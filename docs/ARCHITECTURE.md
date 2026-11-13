# Architecture

## Product boundary

CodeTeo is a Windows desktop coding workspace. It provides a local editor, a workspace explorer, tabs, file open/save, a PowerShell terminal, recent workspace history, read-only Git status, streaming AI chat, and a reviewed Agent MVP.

## Runtime layout

~~~mermaid
flowchart LR
  subgraph UI[Renderer · React]
    App[Workbench and workspace state]
    Explorer[Workspace explorer]
    Editor[CodeMirror 6]
    TerminalUI[xterm.js]
  end

  subgraph Bridge[Preload · context isolated]
    API[Typed allowlisted desktop API]
  end

  subgraph Main[Electron main process]
    IPC[Validated IPC handlers]
    FS[Workspace file service]
    PTY[PowerShell process · node-pty]
    AI[AI provider and Agent services]
    History[Workspace history service]
  end

  subgraph Local[Windows machine]
    Files[Selected workspace files]
    Database[SQLite in app user-data]
    Shell[Windows PowerShell]
    LocalModel[Optional Kumru inference server · loopback]
  end

  App --> API
  Explorer --> API
  Editor --> API
  TerminalUI --> API
  API <--> IPC
  IPC --> FS
  IPC --> PTY
  IPC --> History
  FS <--> Files
  PTY <--> Shell
  AI -->|HTTPS| Providers[Built-in and user-added providers]
  AI -->|HTTP loopback| LocalModel
  History <--> Database
~~~

### Renderer

The renderer owns presentation and transient UI state: the active workspace view, open tabs, unsaved editor buffers, and terminal display. It uses React and TypeScript, CodeMirror 6 for text editing, and xterm.js for terminal display. It has no Node.js integration and does not access the filesystem or spawn processes directly.

### Preload bridge

The preload is the only renderer-to-main bridge. It exposes named operations for workspace selection, directory listing, text file reads and writes, recent-workspace history, terminal I/O, AI requests, and Agent write approvals. It does not expose generic IPC, require, filesystem methods, or arbitrary process execution.

### Main process

The main process owns native capabilities and validates every renderer request. Its services are separated by responsibility:

- Workspace service: canonicalizes the selected root; confines reads and writes to it; lists files; rejects symlinks, binary content, and oversized files.
- Git service: runs a fixed, read-only `git status` command without a shell and reports the current branch and changed-file count.
- Terminal service: starts one PowerShell session at the selected workspace root and forwards input, output, resizing, and exit state.
- History service: stores recently opened workspace paths and timestamps in a local SQLite database under Electron's user-data directory.
- AI service: keeps provider credentials in the main process, streams chat responses, and runs the bounded Agent loop. Users can connect up to eight OpenAI-compatible endpoints behind the same adapter. The Agent can list/read workspace files, propose whole-file replacements, and propose PowerShell commands; the renderer must approve each write and command.

## File access

The user selects a workspace through a native folder picker. The main process stores its canonical path for the current session. Renderer requests use workspace-relative paths. Before accessing a path, the main process checks for traversal, resolves the real path, and confirms it remains under the canonical workspace root. Directory symlinks are omitted. The editor opens regular UTF-8 text files up to 5 MiB and saves existing regular files only.

## Persistence

Workspace history is app data, not project data. Its database lives under CodeTeo's Windows application data directory. The database contains workspace paths and last-opened timestamps. It must not contain source file contents, credentials, or AI prompts. Non-secret UI preferences are stored separately in the renderer's local storage. Phase 1 uses SQLite in WebAssembly (sql.js) and exports the database to disk after each update, so the app does not need a database service or native SQLite compiler toolchain.

## Terminal

The terminal UI lives in the renderer; the PowerShell process lives in the main process. The typed bridge carries terminal input, output, dimensions, and exit notifications. The terminal inherits the user's Windows permissions and starts in the selected workspace. Phase 1 does not add command approval or autonomous execution.

## Build and release

- Electron bundles the main process, preload, and renderer through electron-vite.
- Electron Builder creates a 64-bit Windows NSIS installer.
- The installer keeps local workspace history when uninstalled.
- Native terminal binaries are unpacked from ASAR and must be verified against the Electron runtime used for packaging.

## Agent boundary

The Agent uses native tool calls with OpenAI, Anthropic, Gemini, and OpenRouter; opted-in compatible endpoints can use the OpenAI tool format. Kumru chat is local and chat-only by default. Filesystem access uses the same workspace confinement as the editor. The app blocks known secret paths, limits reads, refuses writes while editor buffers are unsaved, and rereads the reviewed target before saving. A proposed PowerShell command runs only after explicit approval, in the selected workspace as the current Windows user, and has a 90-second timeout. Direct file creation/deletion/rename and background autonomy remain out of scope for this MVP.
