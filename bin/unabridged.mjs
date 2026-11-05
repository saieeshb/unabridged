#!/usr/bin/env node
// unabridged entry point.
//   unabridged [session] [options]   export a chat (see --help)
//   unabridged mcp                   run the MCP server on stdio
//   unabridged setup [options]       add it to Claude Code, Codex, Cursor, Gemini CLI and other agents

const [cmd] = process.argv.slice(2);
if (cmd === 'setup') {
  process.argv.splice(2, 1);
  await import('../scripts/setup.mjs');
} else if (cmd === 'mcp' || cmd === 'serve') {
  process.argv.splice(2, 1);
  await import('../mcp/server.mjs');
} else if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
  const { VERSION } = await import('../lib/util.mjs');
  console.log(VERSION);
} else {
  await import('../scripts/export-chat.mjs');
}
