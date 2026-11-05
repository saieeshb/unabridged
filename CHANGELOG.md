# Changelog

## 0.2.0 (2026-11-05)

**cc-exporter is now unabridged**, because it no longer exports only Claude Code. GitHub redirects the old repository, and `cc-exporter` still works as a command.

- **Codex sessions**: export Codex threads (`--from codex`, or automatically inside Codex), with reasoning summaries, tool calls and their output, subagent threads nested under the call that spawned them, approval reviews, compactions, token usage, and archived `.jsonl.zst` sessions.
- **`unabridged setup`** adds it to the agents on your computer: the Claude Code and Codex plugins, the Gemini CLI extension, and the MCP server plus export skill for Cursor, VS Code, GitHub Copilot CLI, Windsurf, Claude Desktop, Antigravity, OpenCode, Kiro, Qwen Code, Factory Droid, Cline and agents that read `~/.agents/skills`. It backs up every file first, and `--remove` undoes it.
- New packaging: a Codex plugin and marketplace (`codex plugin marketplace add saieeshb/unabridged`), Gemini CLI and Qwen Code extensions, and skills.sh support (`npx skills add saieeshb/unabridged`).
- The MCP server lists and exports both agents' sessions, recognizes which agent started it, and uses the client's project roots.
- The conversation view no longer includes other agents' transcripts.
- The default export folder is now `chat-exports`, and the curl and PowerShell installers offer to run `unabridged setup`.

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
