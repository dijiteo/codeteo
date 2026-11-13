# Phase 3: reviewed Agent MVP

## Scope in this build

- OpenAI, Anthropic, Gemini, and OpenRouter use their native function/tool-call APIs for `list_files`, `read_file`, `write_file`, and `run_command`. Custom OpenAI-compatible endpoints can opt into Agent tools.
- Directory listing and file reads stay inside the selected workspace. `.git`, `node_modules`, and known credential/secret files are not exposed to the agent.
- The agent may propose replacing an existing UTF-8 text file. The app shows the current and proposed contents and waits for an explicit approval.
- The agent may propose one PowerShell command at a time. The exact command is shown and requires approval; it runs in the workspace under the current Windows account, with a 90-second limit and bounded output.
- Writes are rejected while any editor tab has unsaved changes. The target file is reread before saving so a stale proposal is not applied.
- Direct file tools cannot create, delete, or rename files. PowerShell commands are a separate, explicitly approved action.
- An eight-step cap and a 120,000-character per-task read cap bound the agent loop.
- Kumru is available for chat through a local OpenAI-compatible vLLM server. Its built-in profile keeps Agent tools off; custom endpoints can enable them when the selected model supports tool calls.
- Up to eight additional OpenAI-compatible endpoints can be added from the provider dialog. Presets cover LM Studio, Ollama, and vLLM/Kumru; optional keys are encrypted and only saved after `/v1/models` succeeds.

## Local Kumru setup

The app expects a local server on `http://127.0.0.1:8000/v1`:

~~~powershell
pip install vllm
vllm serve vngrs-ai/Kumru-2B
~~~

Use **AI providers → Model setup** for the upstream model card and **Check server** after starting the server. The local server does not need an API key. Model download and inference run separately from CodeTeo.

To connect another local runtime, use **Add an OpenAI-compatible provider**. The presets use LM Studio at `http://127.0.0.1:1234/v1`, Ollama at `http://127.0.0.1:11434/v1`, and vLLM at `http://127.0.0.1:8000/v1`. A hosted endpoint must use HTTPS.

## Security boundary

The chat request still runs in Electron's main process. Provider credentials stay in the encrypted credential file. The Agent's path arguments are validated by the workspace service; file content goes to the selected provider as part of the task. The agent prompt treats project text as untrusted input, but prompt instructions are not a security boundary: filesystem confinement, secret-path filtering, size limits, and per-write approval enforce the actions.

The app's interactive terminal stays user-operated. An approved Agent command runs as the current Windows account, so a command may change files or access other resources that account can reach. Command output is sent back to the selected AI provider; review both the command and that data flow before approving. The agent's direct file-write tool only replaces existing files. Review both content panes before approving a replacement.

## Verification status

Not yet verified against live OpenAI/OpenRouter tool-call responses or an installed Windows build. The local Kumru path also needs a running vLLM server for a live check. The agent UI's approval flow and app-start smoke test remain to be exercised manually.
