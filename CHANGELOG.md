# Changelog

## 0.1.1 (2026-11-05)

- **The default export is now just the conversation**: your prompts and the replies, without tool calls, file reads, hook output, injected context, compaction summaries or token tables. On a typical long session that is about 90 times smaller.
- `--full` (also `--extended`, `-F`) exports everything, exactly as 0.1.0 did by default.
- The MCP tools `export_session` and `read_session` default to the conversation too; pass `detail: "full"` for everything.

## 0.1.0 (2026-11-05)

First release.

- Export a Claude Code session to Markdown (default), self-contained HTML or JSON at three detail levels, with thinking, tool calls and results, Edit diffs, subagent transcripts, images, saved large outputs, injected context, compactions, errors, tokens and cost.
- `--redact` masks common key and token formats, passwords, emails and the home folder, including Claude Code's encoded project-folder names.
- `--thinking` / `--no-thinking`, and a hint about Claude Code's `showThinkingSummaries` setting when thinking wasn't stored.
- Claude Code plugin: `/export-chat`, an `export-transcripts` skill and an MCP connector (`list_sessions`, `read_session`, `export_session`).
- Claude desktop extension (`.mcpb`), curl and PowerShell installers, a Homebrew formula and npx support.
- Tested on Linux, macOS and Windows with Node 18 and 22.
