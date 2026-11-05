#!/usr/bin/env node
// cc-exporter entry point.
//   cc-exporter [session] [options]   export a chat (see --help)
//   cc-exporter mcp                   run the MCP server on stdio

const [cmd] = process.argv.slice(2);
if (cmd === 'mcp' || cmd === 'serve') {
  process.argv.splice(2, 1);
  await import('../mcp/server.mjs');
} else if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
  const { VERSION } = await import('../lib/util.mjs');
  console.log(VERSION);
} else {
  await import('../scripts/export-chat.mjs');
}
