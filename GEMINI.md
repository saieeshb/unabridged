# unabridged

The `unabridged` MCP tools read the Claude Code and Codex chat transcripts stored on this computer:

- `list_sessions`: recent sessions, newest first. Pass `source: "all"` for both agents and `all_projects: true` for every folder.
- `read_session`: a session as Markdown, page by page, for summarizing or searching.
- `export_session`: write a session to Markdown (default), HTML or JSON.

By default these return **just the conversation**: the prompts and the replies. Pass `detail: "full"` when the user wants everything: tool calls and their output, file reads, diffs, subagents, hooks and token usage.

They can't export this agent's own chats, only Claude Code and Codex sessions. Suggest `redact: true` when the user means to share an export.
