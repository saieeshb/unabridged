<div align="center">

<img src="assets/icon.png" width="112" height="112" alt="cc-exporter icon: a chat bubble with a download arrow">

# cc-exporter

### Export any Claude Code chat in full detail.

**The conversation by default; with `--full`, every thinking block, tool call, diff and subagent too. Markdown, HTML or JSON.**

[![test](https://img.shields.io/github/actions/workflow/status/saieeshb/cc-exporter/test.yml?branch=main&style=flat-square&label=tests)](https://github.com/saieeshb/cc-exporter/actions/workflows/test.yml)
[![release](https://img.shields.io/github/v/release/saieeshb/cc-exporter?style=flat-square&color=c2541f)](https://github.com/saieeshb/cc-exporter/releases/latest)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-d97757?style=flat-square)](#install)
[![MCP server](https://img.shields.io/badge/MCP-server-5c4ee5?style=flat-square)](#use-it-as-an-mcp-connector)
[![macOS · Linux · Windows](https://img.shields.io/badge/macOS_·_Linux_·_Windows-supported-2d81ff?style=flat-square)](#install)
[![Node 18+](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![MIT license](https://img.shields.io/badge/license-MIT-3a3a3a?style=flat-square)](LICENSE)

<a href="https://buymeacoffee.com/saieeesh"><img alt="Buy me a coffee" src="https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" height="36"></a>

[Install](#install) · [Use](#use) · [What's exported](#whats-exported) · [Thinking](#getting-the-thinking-text) · [MCP](#use-it-as-an-mcp-connector) · [FAQ](#faq)

<code>/plugin marketplace add saieeshb/cc-exporter</code>

</div>

> [!IMPORTANT]
> The official sources are this repository, its [releases](https://github.com/saieeshb/cc-exporter/releases), and the [`saieeshb/tap`](https://github.com/saieeshb/homebrew-tap) Homebrew tap. cc-exporter only reads files on your computer and never uploads anything.

<div align="center">
<br>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshot-dark.png">
  <img src="assets/screenshot-light.png" alt="An HTML export of a Claude Code session: session stats, a prompt index, the user's request, Claude's thinking, a Grep and Read call, an Edit shown as a diff, a subagent, a passing test run and the final summary table" width="100%">
</picture>
<sub>An HTML export of a short session: thinking, tool calls, a diff, a subagent and the test run, all searchable and collapsible.</sub>
<br><br>
</div>

<table>
  <tr>
    <td width="25%" valign="top">
      <h3>🧾 Nothing left out</h3>
      Prompts and replies, plus thinking, every tool input and output, diffs, images, subagents, hooks, compactions, errors, tokens and cost.
    </td>
    <td width="25%" valign="top">
      <h3>📄 Three formats</h3>
      Markdown by default. A searchable, offline HTML page, or structured JSON for scripts.
    </td>
    <td width="25%" valign="top">
      <h3>🔒 Safe to share</h3>
      <code>--redact</code> masks API keys, tokens, passwords, emails and your home folder before you send an export to anyone.
    </td>
    <td width="25%" valign="top">
      <h3>🤖 Agent-ready</h3>
      A slash command, a skill Claude uses when you ask in plain words, and an MCP connector for Claude Desktop, Cursor and VS Code.
    </td>
  </tr>
</table>

## How it works

Claude Code already keeps every session on your computer, as one transcript file per chat in `~/.claude/projects/`. cc-exporter:

1. **Finds** the session: this one, the previous one, or any past one by id or title.
2. **Reads** the whole transcript, including the parts Claude Code's own `/export` leaves out. That covers tool calls and their results, subagent transcripts, saved large outputs and injected context.
3. **Rebuilds** the conversation: merges streamed message parts, attaches each tool result to its call, and nests subagents where they ran.
4. **Writes** Markdown, HTML or JSON, and can mask secrets on the way out.

It works for any past session still on your computer, not only the one you're in.

## Install

Pick whichever fits. Each one needs [Node.js 18+](https://nodejs.org).

| Where | Command |
|---|---|
| **Claude Code**: plugin, recommended | `/plugin marketplace add saieeshb/cc-exporter` then `/plugin install cc-exporter@cc-exporter` |
| **macOS / Linux**: one line | `curl -fsSL https://raw.githubusercontent.com/saieeshb/cc-exporter/main/install.sh \| bash` |
| **Windows**: PowerShell | `irm https://raw.githubusercontent.com/saieeshb/cc-exporter/main/install.ps1 \| iex` |
| **Homebrew** | `brew tap saieeshb/tap && brew trust saieeshb/tap && brew install cc-exporter` |
| **No install**: npx | `npx -y https://github.com/saieeshb/cc-exporter/archive/refs/tags/v0.1.1.tar.gz --help` |
| **Claude desktop app**: chat | Download [`cc-exporter.mcpb`](https://github.com/saieeshb/cc-exporter/releases/latest/download/cc-exporter.mcpb) and open it |

The curl and PowerShell installers add a `cc-exporter` command. If they find the `claude` command, they also install the Claude Code plugin.

<details>
<summary><b>Claude Code: more ways to install the plugin</b></summary>

<br>

From a shell instead of the Claude Code prompt:

```bash
claude plugin marketplace add saieeshb/cc-exporter
```

```bash
claude plugin install cc-exporter@cc-exporter
```

In the **Claude desktop app's Code tab**: click **+** next to the prompt box, then **Plugins**. Choose **Add marketplace**, enter `saieeshb/cc-exporter`, then **Add plugin**.

Start a new session (or run `/reload-plugins`) and `/export-chat` is ready. To update later, run `/plugin marketplace update cc-exporter`.

</details>

<details>
<summary><b>Installer options</b></summary>

<br>

Both installers read these environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `CC_EXPORTER_REF` | latest release | tag, branch or commit to install |
| `CC_EXPORTER_HOME` | `~/.cc-exporter`, or `%LOCALAPPDATA%\cc-exporter` on Windows | where the files go |
| `CC_EXPORTER_BIN` | `~/.local/bin` (macOS/Linux) | where the `cc-exporter` command goes |
| `CC_EXPORTER_NO_PLUGIN` | unset | set to `1` to skip the Claude Code plugin |

To uninstall, delete that folder and the `cc-exporter` command. For the plugin, run `/plugin uninstall cc-exporter@cc-exporter`. With Homebrew, run `brew uninstall cc-exporter`. Recent Homebrew versions ask you to `brew trust` a third-party tap once before installing from it.

</details>

## Use

In Claude Code:

```text
/export-chat                          this chat, just the conversation → ./claude-exports/<date>_<title>_<id>.md
/export-chat --full                   everything: thinking, tool calls, file reads, diffs, subagents, hooks
/export-chat -f all --open            Markdown + HTML + JSON, then open the result
/export-chat -f html                  just the searchable HTML page
/export-chat --redact                 mask keys, tokens, passwords, emails and your home folder
/export-chat --list                   sessions for this folder (--all for every project)
/export-chat previous                 the session before this one
/export-chat 6774823e                 a session by id (a prefix works)
/export-chat "login bug"              the session whose title or first prompt matches
```

Or just ask: *"export this chat"*, *"export everything from this session"*, or *"export my last session as HTML, redacted"*.

From a terminal, run the same options from the project folder:

```bash
cc-exporter --list
```

```bash
cc-exporter latest -f html --open
```

> [!TIP]
> Exports go to `./claude-exports/`, which writes its own `.gitignore`, so they never end up in a commit. Pick another folder with `-o`.

### Options

| Option | Meaning |
|---|---|
| `-f, --format` | `md` (default), `html`, `json`, or `all`; combine with commas: `-f md,html` |
| `--full` | everything, as in the table below (aliases `--extended`, `-F`, `-d full`) |
| `-d, --detail` | `conversation` (default) · `standard` · `full` (see below) |
| `--thinking` / `--no-thinking` | add thinking to the conversation view, or drop it from `--full` |
| `-o, --out DIR` | output folder (default `./claude-exports`; `~/claude-exports` outside a project) |
| `--redact` | mask API keys and tokens (Anthropic, OpenAI, GitHub, GitLab, AWS, Slack, Google, Stripe, Supabase, npm, JWTs, bearer tokens, private keys), `password=…` values, emails and your home folder |
| `--no-subagents` · `--no-images` | leave subagent transcripts or images out |
| `--max-output N` | cut each tool output or file body to N characters |
| `--raw` | also copy the raw JSONL transcript and its side files |
| `--open` · `--json` | open the export when done · print the result as JSON |
| `--list [--all] [--search TEXT] [--limit N]` | list sessions |

## What's exported

By default an export is **just the conversation**: what you typed and what the agent replied, the way you read it in the chat. Add `--full` for everything else.

| | conversation (default) | standard | full (`--full`) |
|---|:-:|:-:|:-:|
| Your prompts, slash commands, `!` shell commands, and the replies | ✓ | ✓ | ✓ |
| Thinking blocks | with `--thinking` | ✓ | ✓ |
| Tool calls with inputs and outputs, file reads, diffs, images | | ✓ | ✓ |
| Subagent transcripts | | ✓ | ✓ |
| Compactions and their summaries, API errors, hook runs | | ✓ | ✓ |
| Injected context (CLAUDE.md, environment, reminders, skill listings) | | | ✓ |
| System prompt snapshot, per-message ids, tokens and stop reasons | | | ✓ |

The **HTML** page needs no network connection. It has search (press `/`), a prompt index, filters for thinking, tools, context, system and metadata, expand/collapse all, light and dark themes, and a print layout for saving as PDF. The **Markdown** file uses `<details>` for collapsible parts, and its images go in a `_files` folder beside it. The **JSON** has the merged, nested session model.

## Getting the thinking text

By default Claude Code saves thinking **encrypted**: the transcript keeps only a signature, so no tool can show what Claude thought. Exports mark those blocks "not stored in the transcript". To keep readable thinking summaries in new sessions, add this to `~/.claude/settings.json`:

```json
{ "showThinkingSummaries": true }
```

Claude Code then requests thinking summaries, shows them in the conversation (and in the transcript view, `ctrl+o`) and stores them, so cc-exporter can export them. It applies to sessions started afterwards; older thinking stays encrypted. The exporter reminds you whenever it finds thinking without text.

## Use it as an MCP connector

The connector has three tools: `list_sessions`, `read_session` (returns a transcript as Markdown, page by page, so Claude can summarize or search it) and `export_session`. The Claude Code plugin already includes it. For other clients:

[![Add to Cursor](https://img.shields.io/badge/Cursor-Add_cc--exporter-000000?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/install-mcp?name=cc-exporter&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImh0dHBzOi8vZ2l0aHViLmNvbS9zYWllZXNoYi9jYy1leHBvcnRlci9hcmNoaXZlL3JlZnMvdGFncy92MC4xLjEudGFyLmd6IiwibWNwIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_cc--exporter-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=cc-exporter&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22https%3A//github.com/saieeshb/cc-exporter/archive/refs/tags/v0.1.1.tar.gz%22%2C%22mcp%22%5D%7D)

<details>
<summary><b>Claude Code (without the plugin)</b></summary>

<br>

```bash
claude mcp add cc-exporter -- npx -y https://github.com/saieeshb/cc-exporter/archive/refs/tags/v0.1.1.tar.gz mcp
```

If you installed with curl, PowerShell or Homebrew: `claude mcp add cc-exporter -- cc-exporter mcp`

</details>

<details>
<summary><b>Claude desktop app</b></summary>

<br>

Easiest: download [`cc-exporter.mcpb`](https://github.com/saieeshb/cc-exporter/releases/latest/download/cc-exporter.mcpb) and open it. You can also go to Settings → Extensions → Install extension.

Or add this to `claude_desktop_config.json` (Settings → Developer → Edit Config) and restart the app:

```json
{
  "mcpServers": {
    "cc-exporter": {
      "command": "npx",
      "args": ["-y", "https://github.com/saieeshb/cc-exporter/archive/refs/tags/v0.1.1.tar.gz", "mcp"]
    }
  }
}
```

</details>

<details>
<summary><b>Any other MCP client</b></summary>

<br>

It's a stdio server. Run `npx -y https://github.com/saieeshb/cc-exporter/archive/refs/tags/v0.1.1.tar.gz mcp`, or `cc-exporter mcp` once installed. The JSON block above works in most clients' `mcpServers` config.

</details>

Then ask: *"list my recent Claude Code sessions"*, *"summarize yesterday's session in the api repo"*, or *"export my last session as HTML"*.

## FAQ

<details>
<summary><b>How is this different from Claude Code's built-in <code>/export</code>?</b></summary>

<br>

`/export` copies the visible conversation as plain text. cc-exporter reads the full transcript. That adds thinking, every tool call with its complete input and output, Edit diffs, subagent transcripts, images, large outputs Claude Code saved to disk, context the harness injected, compactions, errors, tokens and cost. It also works for past sessions.

</details>

<details>
<summary><b>Is anything uploaded?</b></summary>

<br>

No. It only reads Claude Code's local transcripts and writes files where you tell it. The HTML export makes no network requests.

</details>

<details>
<summary><b>Is an export safe to share?</b></summary>

<br>

An export contains everything from the chat, including file contents Claude read, command output, and any secret that appeared in either. Use `--redact`, then still skim the result, since redaction only knows common formats.

</details>

<details>
<summary><b>Some messages look like they were undone. Why are they there?</b></summary>

<br>

Claude Code's transcript is append-only, so messages from a rewound or edited branch stay in the file. The export shows the full history in the order it happened.

</details>

<details>
<summary><b>Where are my sessions, and how long are they kept?</b></summary>

<br>

In `~/.claude/projects/` (`%USERPROFILE%\.claude\projects\` on Windows), or under `CLAUDE_CONFIG_DIR` if you set it. Claude Code deletes transcripts after 30 days unless you raise `cleanupPeriodDays` in its settings, so export what you want to keep.

</details>

<details>
<summary><b>Does it work on Windows?</b></summary>

<br>

Yes. CI runs the tests and both installers on Windows, macOS and Linux. The slash command works under Git Bash and PowerShell.

</details>

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout and how to run the tests. Report security problems as described in [SECURITY.md](SECURITY.md).

## Support

If cc-exporter saved you some time, you can [buy me a coffee](https://buymeacoffee.com/saieeesh) ☕. Thank you!

<a href="https://buymeacoffee.com/saieeesh"><img alt="Buy me a coffee" src="https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" height="36"></a>

## License

[MIT](LICENSE) © Saieesh Bairam. Not affiliated with Anthropic. Claude and Claude Code are trademarks of Anthropic.
