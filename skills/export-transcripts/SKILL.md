---
name: export-transcripts
description: Export a Claude Code chat as Markdown, a self-contained HTML page or JSON — by default just the conversation (prompts and replies), or in full detail (thinking, every tool call with its input and output, file diffs, subagent transcripts, injected context, tokens and cost) with --full. Use when the user asks to export, save, archive, back up, download, print or share this conversation or a past Claude Code session, or to find and list past sessions.
---

# Exporting Claude Code chats

The exporter is a Node script (Node 18+, no dependencies) in this plugin at `scripts/export-chat.mjs`, two folders above this skill's base directory. Run it with Bash:

```bash
node "<plugin root>/scripts/export-chat.mjs" [session] [options]
```

**Which session**
- This chat: give no session argument. It uses `$CLAUDE_CODE_SESSION_ID`, which the Bash tool has.
- Another one: `--list` (this folder) or `--list --all --search "words"`, then pass its id (a prefix works), or `latest` / `previous`.

**Options**
- `-f md` (the default), `-f html` for the searchable page, `-f json`, or `-f all`
- By default only the conversation is exported: the prompts and the replies. Add `--full` when the user wants everything (thinking, tool calls and their output, file reads, diffs, subagents, hooks, injected context, tokens and cost); `-d standard` is full minus injected context.
- `-o DIR` output folder (default `./claude-exports`, which git-ignores itself)
- `--redact` masks keys, tokens, passwords, emails and the home path. Suggest it when the user means to share the export.
- `--thinking` adds thinking blocks to the conversation view; `--no-thinking` drops them from `--full`
- `--open` opens the export when done; `--no-images`, `--no-subagents`, `--max-output N`, `--raw` (also copy the raw JSONL)

When it finishes, give the user each file as a markdown link plus the one-line stats it prints. Don't paste the transcript into the chat.

If this plugin's MCP tools are loaded (`list_sessions`, `read_session`, `export_session`), they do the same work. Use `read_session` when the user wants a past session summarized or searched, not saved.
