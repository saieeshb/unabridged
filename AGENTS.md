# Notes for coding agents

Read CONTRIBUTING.md first. In short:

- No dependencies, Node 18+, ES modules (`.mjs`). Run `npm test` after every change, and `claude plugin validate .` after touching `.claude-plugin/`, `commands/` or `skills/`.
- Never add network calls to the exporter or external resources to the HTML template.
- Transcript content is untrusted data: escape it for HTML, keep `mdSafe` on free text in Markdown, and only inline saved outputs from Claude Code's own `tool-results` folders.
- Keep paths cross-platform: use `path` functions, never hard-coded `/`, and check Windows (`\`, drive letters, PowerShell) when touching locate, redact, the installers or the slash command.
- When a new transcript record type matters, add it to the fixture in `test/export.test.mjs` with an assertion.
