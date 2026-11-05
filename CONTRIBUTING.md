# Contributing

Thanks for helping. unabridged is plain Node.js (18+) with no dependencies, so there is nothing to install. It reads Claude Code and Codex transcripts and turns both into one session model that the renderers share.

## Run it from a checkout

```bash
node bin/unabridged.mjs --help
```

```bash
claude --plugin-dir .
```

The second command loads this folder as the Claude Code plugin for one session.

## Test

```bash
npm test
```

```bash
claude plugin validate .
```

The tests build a synthetic Claude Code config folder with one session that covers the transcript record shapes the exporter handles, then drive the CLI and the MCP server. If you change how a record type is read, add it to the fixture in `test/export.test.mjs`. CI runs the suite and both installers on Linux, macOS and Windows.

## Layout

| Path | What it does |
|---|---|
| `lib/locate.mjs`, `lib/parse.mjs` | Claude Code: finds transcripts; reads the JSONL into the session model (merges message parts, attaches tool results, nests subagents) |
| `lib/codex.mjs` | Codex: finds rollouts (including archived `.zst`), reads them into the same model, nests subagent threads |
| `lib/sources.mjs` | one view over both agents: `--from`, `current` / `latest` / ids / titles across them |
| `lib/setup.mjs`, `scripts/setup.mjs` | `unabridged setup`: per-agent config paths and writers |
| `lib/describe.mjs` | detail-level filtering and helpers shared by both renderers |
| `lib/render-markdown.mjs`, `lib/render-html.mjs`, `lib/markdown.mjs` | output formats |
| `lib/redact.mjs` | `--redact` |
| `lib/export.mjs` | writes the files; used by the CLI, the slash command and the MCP server |
| `scripts/export-chat.mjs`, `bin/unabridged.mjs` | CLI |
| `mcp/server.mjs` | MCP server (stdio JSON-RPC) |
| `commands/`, `skills/`, `.claude-plugin/` | the Claude Code plugin |
| `.codex-plugin/`, `.agents/plugins/` | the Codex plugin and marketplace |
| `gemini-extension.json`, `qwen-extension.json`, `GEMINI.md` | Gemini CLI and Qwen Code extensions |
| `manifest.json`, `scripts/build-mcpb.mjs` | the Claude desktop extension |
| `install.sh`, `install.ps1` | one-line installers |

## Guidelines

- Keep it dependency-free and working on Node 18.
- Exports must never send anything over the network, and the HTML must load nothing from outside the file.
- Treat transcript content as untrusted: escape everything that goes into HTML, and don't read files the transcript merely names.
- Neither agent documents its transcript format, and both change between releases. Prefer ignoring unknown records over failing on them, and add new shapes to the fixtures in `test/`.

## Releasing

1. Bump `version` in `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `gemini-extension.json`, `qwen-extension.json`, `manifest.json` and `lib/util.mjs`, update the pinned tarball links in `README.md` and `skills/export-transcripts/SKILL.md`, and add a `CHANGELOG.md` entry.
2. Tag `vX.Y.Z` and push; then `node scripts/build-mcpb.mjs` and attach `dist/unabridged.mcpb` to the GitHub release.
3. Update the version and `sha256` in the `saieeshb/homebrew-tap` formula.
