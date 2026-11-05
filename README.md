<div align="center">

<img src="assets/icon.png" width="112" height="112" alt="unabridged icon: a chat bubble with a download arrow">

# unabridged

### Export your AI coding agent chats.

**Claude Code and Codex. Just the conversation by default, or every tool call, file read and subagent with `--full`. Markdown, HTML or JSON.**

[![test](https://img.shields.io/github/actions/workflow/status/saieeshb/unabridged/test.yml?branch=main&style=flat-square&label=tests)](https://github.com/saieeshb/unabridged/actions/workflows/test.yml)
[![release](https://img.shields.io/github/v/release/saieeshb/unabridged?style=flat-square&color=c2541f)](https://github.com/saieeshb/unabridged/releases/latest)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin-d97757?style=flat-square)](#install)
[![Codex](https://img.shields.io/badge/Codex-plugin-10a37f?style=flat-square)](#install)
[![MCP server](https://img.shields.io/badge/MCP-server-5c4ee5?style=flat-square)](#use-it-from-any-agent)
[![macOS · Linux · Windows](https://img.shields.io/badge/macOS_·_Linux_·_Windows-supported-2d81ff?style=flat-square)](#install)
[![MIT license](https://img.shields.io/badge/license-MIT-3a3a3a?style=flat-square)](LICENSE)

<a href="https://buymeacoffee.com/saieeesh"><img alt="Buy me a coffee" src="https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" height="36"></a>

[Install](#install) · [Use](#use) · [What's exported](#whats-exported) · [Any agent](#use-it-from-any-agent) · [Thinking](#getting-the-thinking-text) · [FAQ](#faq)

<code>curl -fsSL https://raw.githubusercontent.com/saieeshb/unabridged/main/install.sh | bash</code>

</div>

> [!IMPORTANT]
> The official sources are this repository, its [releases](https://github.com/saieeshb/unabridged/releases), and the [`saieeshb/tap`](https://github.com/saieeshb/homebrew-tap) Homebrew tap. unabridged only reads files on your computer and never uploads anything. It was called **cc-exporter** before 0.2.0, and the old command still works.

<div align="center">
<br>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshot-dark.png">
  <img src="assets/screenshot-light.png" alt="A full HTML export of a coding-agent session: session stats, a prompt index, the user's request, the agent's thinking, Grep and Read calls, an Edit shown as a diff, a subagent, a passing test run and the final summary table" width="100%">
</picture>
<sub>A <code>--full</code> HTML export: thinking, tool calls, a diff, a subagent and the test run, all searchable and collapsible. Without <code>--full</code> you get just the messages.</sub>
<br><br>
</div>

<table>
  <tr>
    <td width="25%" valign="top">
      <h3>💬 Conversation first</h3>
      By default you get what was said: your prompts and the replies. Clean, readable and small enough to share. A typical long session is about 90 times smaller than its full export.
    </td>
    <td width="25%" valign="top">
      <h3>🧾 Or everything</h3>
      <code>--full</code> adds thinking, every tool call with its input and output, file reads, diffs, subagents, hooks, injected context, tokens and cost.
    </td>
    <td width="25%" valign="top">
      <h3>🤝 Claude Code and Codex</h3>
      Reads both agents' local transcripts, including Codex subagent threads and archived sessions, in Markdown, a searchable HTML page, or JSON.
    </td>
    <td width="25%" valign="top">
      <h3>🔌 In any agent</h3>
      Plugins for Claude Code and Codex, extensions for Gemini CLI and Qwen Code, and an MCP server plus skill for Cursor, VS Code, Windsurf, Claude Desktop and more. <code>unabridged setup</code> wires them up.
    </td>
  </tr>
</table>

## How it works

Claude Code keeps every chat in `~/.claude/projects/`, and Codex keeps its chats in `~/.codex/sessions/`. unabridged:

1. **Finds** the session: the one you're in, the previous one, or any past one by id or title.
2. **Reads** the whole transcript, including what the agents' own exports leave out: tool calls and their results, subagent threads, large outputs saved to disk, injected context.
3. **Rebuilds** the conversation: merges streamed message parts, attaches each tool result to its call, and nests subagents where they ran.
4. **Writes** just the conversation, or everything with `--full`, as Markdown, HTML or JSON. It can mask secrets on the way out.

## Install

**One line** (macOS and Linux) installs the `unabridged` command and offers to add it to every agent it finds. It shows the changes first.

```bash
curl -fsSL https://raw.githubusercontent.com/saieeshb/unabridged/main/install.sh | bash
```

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/saieeshb/unabridged/main/install.ps1 | iex
```

Or install it the way each agent expects:

| Agent | Install |
|---|---|
| **Claude Code** | `/plugin marketplace add saieeshb/unabridged` then `/plugin install unabridged@unabridged` |
| **Codex** | `codex plugin marketplace add saieeshb/unabridged` then `codex plugin add unabridged@unabridged` |
| **Gemini CLI** | `gemini extensions install https://github.com/saieeshb/unabridged` |
| **Qwen Code** | `qwen extensions install https://github.com/saieeshb/unabridged` |
| **Claude desktop app** | Download [`unabridged.mcpb`](https://github.com/saieeshb/unabridged/releases/latest/download/unabridged.mcpb) and open it |
| **Cursor** | [![Add to Cursor](https://img.shields.io/badge/Cursor-Add_unabridged-000000?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/install-mcp?name=unabridged&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImh0dHBzOi8vZ2l0aHViLmNvbS9zYWllZXNoYi91bmFicmlkZ2VkL2FyY2hpdmUvcmVmcy90YWdzL3YwLjIuMC50YXIuZ3oiLCJtY3AiXX0%3D) |
| **VS Code (Copilot)** | [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_unabridged-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=unabridged&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22https%3A//github.com/saieeshb/unabridged/archive/refs/tags/v0.2.0.tar.gz%22%2C%22mcp%22%5D%7D) |
| **Windsurf, Copilot CLI, Antigravity, OpenCode, Kiro, Factory Droid, Cline, …** | `unabridged setup` (see [below](#use-it-from-any-agent)) |
| **Any agent with skills** | `npx skills add saieeshb/unabridged` (installs the export skill into ~70 agents) |
| **Homebrew** | `brew tap saieeshb/tap && brew trust saieeshb/tap && brew install unabridged` |
| **No install** | `npx -y https://github.com/saieeshb/unabridged/archive/refs/tags/v0.2.0.tar.gz --help` |

Everything needs [Node.js 18+](https://nodejs.org).

<details>
<summary><b>Coming from cc-exporter?</b></summary>

<br>

GitHub redirects the old repository, and `cc-exporter` still works as a command. To move the Claude Code plugin to its new name:

```bash
claude plugin uninstall cc-exporter@cc-exporter
```

```bash
claude plugin marketplace remove cc-exporter
```

```bash
claude plugin marketplace add saieeshb/unabridged && claude plugin install unabridged@unabridged
```

With Homebrew: `brew uninstall cc-exporter && brew install unabridged`.

</details>

<details>
<summary><b>Installer options</b></summary>

<br>

| Variable | Default | Meaning |
|---|---|---|
| `UNABRIDGED_REF` | latest release | tag, branch or commit to install |
| `UNABRIDGED_HOME` | `~/.unabridged`, or `%LOCALAPPDATA%\unabridged` on Windows | where the files go |
| `UNABRIDGED_BIN` | `~/.local/bin` (macOS/Linux) | where the command goes |
| `UNABRIDGED_NO_SETUP` | unset | set to `1` to skip the agent setup step |

To uninstall, run `unabridged setup --remove`, then delete that folder and the `unabridged` command.

</details>

## Use

In Claude Code, use the slash command, or just ask:

```text
/export-chat                          this chat, just the conversation → ./chat-exports/<date>_<title>_<id>.md
/export-chat --full                   everything: thinking, tool calls, file reads, diffs, subagents, hooks
/export-chat -f html --open           the searchable HTML page, opened when done
/export-chat --redact                 mask keys, tokens, passwords, emails and your home folder
/export-chat --list                   sessions for this folder
/export-chat previous                 the session before this one
/export-chat "login bug"              the session whose title or first prompt matches
```

In Codex, Gemini CLI, Cursor or any other agent with it installed, ask: *"export this chat"*, *"export everything from this session as HTML"*, or *"list my recent Codex sessions"*.

From a terminal:

```bash
unabridged --list --from all
```

```bash
unabridged latest --from codex -f html --open
```

> [!TIP]
> Exports go to `./chat-exports/`, which writes its own `.gitignore`, so they never end up in a commit. Pick another folder with `-o`.

### Options

| Option | Meaning |
|---|---|
| `--full` | everything, as in the table below (aliases `--extended`, `-F`, `-d full`) |
| `-f, --format` | `md` (default), `html`, `json`, or `all`; combine with commas: `-f md,html` |
| `--from` | `claude`, `codex` or `all` (default: the agent you run it in, else Claude Code); `--codex` for short |
| `-d, --detail` | `conversation` (default) · `standard` · `full` |
| `--thinking` / `--no-thinking` | add thinking to the conversation view, or drop it from `--full` |
| `-o, --out DIR` | output folder (default `./chat-exports`; `~/chat-exports` outside a project) |
| `--redact` | mask API keys and tokens (Anthropic, OpenAI, GitHub, GitLab, AWS, Slack, Google, Stripe, Supabase, npm, JWTs, bearer tokens, private keys), `password=…` values, emails and your home folder |
| `--no-subagents` · `--no-images` | leave subagent transcripts or images out |
| `--max-output N` | cut each tool output or file body to N characters |
| `--raw` | also copy the raw transcript files |
| `--open` · `--json` | open the export when done · print the result as JSON |
| `--list [--all] [--search TEXT] [--limit N]` | list sessions |

## What's exported

By default an export is **just the conversation**: what you typed and what the agent replied, the way you read it in the chat. Add `--full` for everything else.

| | conversation (default) | standard | full (`--full`) |
|---|:-:|:-:|:-:|
| Your prompts, slash commands, `!` shell commands, and the replies | ✓ | ✓ | ✓ |
| Thinking blocks / reasoning summaries | with `--thinking` | ✓ | ✓ |
| Tool calls with inputs and outputs, file reads, diffs, images | | ✓ | ✓ |
| Subagent transcripts and Codex review threads | | ✓ | ✓ |
| Compactions and their summaries, API errors, hook runs | | ✓ | ✓ |
| Injected context (CLAUDE.md, AGENTS.md, environment, reminders, skill listings) | | | ✓ |
| System prompt snapshot, per-message ids, tokens and stop reasons | | | ✓ |

The **HTML** page needs no network connection. It has search (press `/`), a prompt index, filters, light and dark themes, and a print layout for saving as PDF. The **Markdown** file uses `<details>` for collapsible parts, and its images go in a `_files` folder beside it. The **JSON** holds the merged, nested session model.

## Use it from any agent

`unabridged setup` finds the coding agents on your computer, shows what it will change, and asks before doing it.
- **Agents with their own plugin system** (Claude Code, Codex, Gemini CLI) get the plugin or extension through their CLI.
- **The others** get the MCP server in their config file and the export skill in their skills folder. Each file is backed up first, and `unabridged setup --remove` undoes everything.

```bash
unabridged setup
```

```bash
unabridged setup --list
```

```bash
unabridged setup --agent cursor,windsurf --yes
```

| Agent | What setup adds |
|---|---|
| Claude Code | the plugin: `/export-chat`, the skill and the MCP server |
| Codex | the plugin: the skill and the MCP server |
| Gemini CLI | the extension (MCP server + context) |
| Cursor, Windsurf, Kiro, Qwen Code, Factory Droid | MCP server + skill |
| VS Code (Copilot), GitHub Copilot CLI | MCP server + skill (`~/.copilot/skills`) |
| OpenCode, Antigravity | MCP server + skill |
| Claude Desktop, Cline | MCP server |
| Goose, Zed | prints the snippet to add by hand |
| Amp, Warp, Pi and others that read `~/.agents/skills` | skill |

The connector has three tools: `list_sessions`, `read_session` (returns a transcript as Markdown, page by page, so the agent can summarize or search it) and `export_session`. Other agents can read and export your Claude Code and Codex sessions, but not their own chats.

<details>
<summary><b>Add the MCP server by hand</b></summary>

<br>

Claude Code (without the plugin):

```bash
claude mcp add unabridged -- npx -y https://github.com/saieeshb/unabridged/archive/refs/tags/v0.2.0.tar.gz mcp
```

Codex (without the plugin):

```bash
codex mcp add unabridged -- npx -y https://github.com/saieeshb/unabridged/archive/refs/tags/v0.2.0.tar.gz mcp
```

Any client with an `mcpServers` config (Claude Desktop, Cursor, Windsurf, …):

```json
{
  "mcpServers": {
    "unabridged": {
      "command": "npx",
      "args": ["-y", "https://github.com/saieeshb/unabridged/archive/refs/tags/v0.2.0.tar.gz", "mcp"]
    }
  }
}
```

If unabridged is installed, use `"command": "unabridged", "args": ["mcp"]` instead.

</details>

## Getting the thinking text

Both agents keep most thinking **encrypted**, so no tool can show it. unabridged marks those blocks as "not stored". To keep readable summaries in new sessions:

- **Claude Code**: add `"showThinkingSummaries": true` to `~/.claude/settings.json`.
- **Codex**: add `model_reasoning_summary = "detailed"` to `~/.codex/config.toml`.

This applies to sessions started afterwards; older thinking stays encrypted. The exporter reminds you when it finds thinking without text.

## FAQ

<details>
<summary><b>How is this different from the agents' own export?</b></summary>

<br>

Claude Code's `/export` copies the visible conversation as plain text, and Codex has no export at all. unabridged gives you that same clean conversation as Markdown or HTML by default. With `--full` it adds thinking, every tool call with its complete input and output, Edit diffs, subagent threads, images, saved large outputs, injected context, compactions, errors, tokens and cost. It also works for past sessions.

</details>

<details>
<summary><b>Is anything uploaded?</b></summary>

<br>

No. It only reads the agents' local transcripts and writes files where you tell it. The HTML export makes no network requests.

</details>

<details>
<summary><b>Is an export safe to share?</b></summary>

<br>

A conversation export has only what was said. A `--full` export also contains file contents the agent read, command output, and any secret that appeared in either. Use `--redact`, then still skim the result, since redaction only knows common formats.

</details>

<details>
<summary><b>Some messages look like they were undone. Why are they there?</b></summary>

<br>

The transcripts are append-only, so messages from a rewound or edited branch stay in the file. The export shows the full history in the order it happened.

</details>

<details>
<summary><b>Where are my sessions, and how long are they kept?</b></summary>

<br>

- **Claude Code** keeps them in `~/.claude/projects/` (or under `CLAUDE_CONFIG_DIR`) and deletes them after 30 days unless you raise `cleanupPeriodDays`.
- **Codex** keeps them in `~/.codex/sessions/` and moves older ones to `archived_sessions/` (or under `CODEX_HOME`). Reading archived sessions needs Node 22.15+.

Export what you want to keep.

</details>

<details>
<summary><b>Does it work on Windows?</b></summary>

<br>

Yes. CI runs the tests and both installers on Windows, macOS and Linux. The slash command works under Git Bash and PowerShell.

</details>

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout and how to run the tests. Report security problems as described in [SECURITY.md](SECURITY.md).

## Support

If unabridged saved you some time, you can [buy me a coffee](https://buymeacoffee.com/saieeesh) ☕. Thank you!

<a href="https://buymeacoffee.com/saieeesh"><img alt="Buy me a coffee" src="https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" height="36"></a>

## License

[MIT](LICENSE) © Saieesh Bairam. Not affiliated with Anthropic or OpenAI. Claude and Claude Code are trademarks of Anthropic; Codex is a trademark of OpenAI.
