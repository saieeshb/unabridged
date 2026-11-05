# Contributing

Thanks for helping. cc-exporter is plain Node.js (18+) with no dependencies, so there is nothing to install.

## Run it from a checkout

```bash
node bin/cc-exporter.mjs --help
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
| `lib/locate.mjs` | finds transcripts and resolves `current`, `latest`, ids and titles |
| `lib/parse.mjs` | reads the JSONL and builds the session model (merges message parts, attaches tool results, nests subagents) |
| `lib/describe.mjs` | detail-level filtering and helpers shared by both renderers |
| `lib/render-markdown.mjs`, `lib/render-html.mjs`, `lib/markdown.mjs` | output formats |
| `lib/redact.mjs` | `--redact` |
| `lib/export.mjs` | writes the files; used by the CLI, the slash command and the MCP server |
| `scripts/export-chat.mjs`, `bin/cc-exporter.mjs` | CLI |
| `mcp/server.mjs` | MCP server (stdio JSON-RPC) |
| `commands/`, `skills/`, `.claude-plugin/` | the Claude Code plugin |
| `manifest.json`, `scripts/build-mcpb.mjs` | the Claude desktop extension |
| `install.sh`, `install.ps1` | one-line installers |

## Guidelines

- Keep it dependency-free and working on Node 18.
- Exports must never send anything over the network, and the HTML must load nothing from outside the file.
- Treat transcript content as untrusted: escape everything that goes into HTML, and don't read files the transcript merely names.
- Claude Code's transcript format isn't documented and changes between releases. Prefer ignoring unknown records over failing on them.

## Releasing

1. Bump `version` in `package.json`, `.claude-plugin/plugin.json`, `manifest.json` and `lib/util.mjs`, and add a `CHANGELOG.md` entry.
2. Tag `vX.Y.Z` and push; then `node scripts/build-mcpb.mjs` and attach `dist/cc-exporter.mcpb` to the GitHub release.
3. Update the version and `sha256` in the `saieeshb/homebrew-tap` formula.
