---
name: export-transcripts
description: Export an AI coding agent chat — Claude Code or Codex — as Markdown, a self-contained HTML page or JSON. By default just the conversation (prompts and replies); with --full, everything (thinking, every tool call with its input and output, file reads, diffs, subagents, hooks, injected context, tokens). Use when the user asks to export, save, archive, back up, download, print or share this conversation or a past session, or to find and list past sessions.
---

# Exporting agent chats with unabridged

unabridged reads the transcripts Claude Code (`~/.claude/projects`) and Codex (`~/.codex/sessions`) keep on this computer and writes them out. It never uploads anything.

## How to run it

<!-- unabridged:run -->
Use the first of these that works:

1. `unabridged` if it is on PATH.
2. `node "<plugin root>/bin/unabridged.mjs"`, where `<plugin root>` is two folders above this SKILL.md (when this skill came with the unabridged plugin).
3. `npx -y https://github.com/saieeshb/unabridged/archive/refs/tags/v0.2.0.tar.gz` (needs Node 18+ and a network connection the first time).
<!-- /unabridged:run -->

Below, `unabridged` stands for whichever command worked.

## Which session

- **This chat**: give no session argument. In Claude Code and Codex the current session is found automatically.
- **Another agent's chat**: from Cursor, Gemini CLI or another agent, unabridged can export Claude Code and Codex sessions, but not that agent's own chat. Run `unabridged --list --from all` and pick one.
- **A past session**: `unabridged --list` (this folder), `--list --all --search "words"` (everywhere), then pass its id (a prefix works), `latest` or `previous`. Add `--from codex`, `--from claude` or `--from all` to choose the agent.

## What to export

- Default: **just the conversation**, meaning what the user typed and what the agent replied. This is what people usually want.
- `--full` when the user asks for everything: thinking, tool calls and their output, file reads, diffs, subagents, hooks, injected context, tokens and cost.
- `-f md` (default), `-f html` (searchable page), `-f json`, or `-f all`.
- `-o DIR` chooses the folder (default `./chat-exports`, which git-ignores itself).
- `--redact` masks keys, tokens, passwords, emails and the home folder. Suggest it when the user means to share the export.
- `--thinking` adds thinking to the conversation view; `--open` opens the file when done.

When it finishes, give the user each file as a link plus the one-line stats it prints. Don't paste the transcript into the chat.

If the unabridged MCP tools are loaded (`list_sessions`, `read_session`, `export_session`), they do the same work. Use `read_session` when the user wants a past session summarized or searched rather than saved.
