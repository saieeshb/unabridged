---
description: Export this chat (or another Claude Code session): just the conversation by default, or everything with --full
argument-hint: "[current|latest|previous|<session-id>|<title words>] [--full] [-f md|html|json|all] [--thinking] [-o DIR] [--redact] [--open] [--list]"
allowed-tools: Bash(node:*), PowerShell(node:*)
---

## Exporter output

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/export-chat.mjs" --argline '$ARGUMENTS'`

## What to do

The exporter above has already run; don't run it again unless the user asks.

- If it exported files: reply in two or three short lines. Give each written file as a markdown link to its path, then the one-line stats. If `--redact` wasn't used, add one short note that the export contains everything from the chat (file contents, command output, any secrets that appeared), so `--redact` is the option for sharing.
- If it printed a session list: show it as a compact table (id prefix, last activity, title) and say how to export one, for example `/export-chat <id>`.
- If it printed an error: say what went wrong in one line and the fix (for example `/export-chat --list` to find a session id).
- If the shell refused the line (an apostrophe in the arguments ends the quoting), run the exporter yourself with Bash, quoting the arguments properly: `node "${CLAUDE_PLUGIN_ROOT}/scripts/export-chat.mjs" <args>`.
