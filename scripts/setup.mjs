#!/usr/bin/env node
// `unabridged setup` — add unabridged to the coding agents on this computer.

import readline from 'node:readline';
import { agentTable, detectAgents, launchSpec, planSetup, applyPlan } from '../lib/setup.mjs';

const HELP = `unabridged setup — add unabridged to your coding agents

Usage
  unabridged setup                  set up every agent found on this computer (asks first)
  unabridged setup --agent codex,cursor
  unabridged setup --list           show supported agents and which ones were found
  unabridged setup --remove         undo it

Options
  -a, --agent LIST   only these agents (ids from --list), or "all"
  -y, --yes          don't ask before changing anything
      --dry-run      show what would change, change nothing
      --remove       remove what setup added
      --no-skills    only register the MCP server
      --no-plugins   write config files even where the agent has its own plugin system
      --json         print the result as JSON

Claude Code, Codex and Gemini CLI get the unabridged plugin or extension through their own CLI.
Other agents get the MCP server in their config file and the export skill in their skills
folder. Each config file is backed up to <file>.unabridged.bak before it is changed.
`;

function parse(argv) {
  const o = { agents: null, yes: false, dry: false, remove: false, skills: true, plugins: true, list: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => (a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i]);
    switch (a.includes('=') ? a.slice(0, a.indexOf('=')) : a) {
      case '-h': case '--help': o.help = true; break;
      case '-a': case '--agent': case '--agents': o.agents = String(val() ?? '').split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--all': o.agents = ['all']; break;
      case '-y': case '--yes': o.yes = true; break;
      case '--dry-run': case '-n': o.dry = true; break;
      case '--remove': case '--uninstall': o.remove = true; break;
      case '--no-skills': o.skills = false; break;
      case '--no-plugins': o.plugins = false; break;
      case '-l': case '--list': o.list = true; break;
      case '--json': o.json = true; break;
      default: throw new Error(`Unknown option ${a} (see unabridged setup --help)`);
    }
  }
  return o;
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((r) => rl.question(question, r));
  rl.close();
  return /^(y|yes|)$/i.test(answer.trim());
}

async function main() {
  let o;
  try {
    o = parse(process.argv.slice(2));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }
  if (o.help) return void process.stdout.write(HELP);

  const table = detectAgents(agentTable());
  if (o.list) {
    if (o.json) return void console.log(JSON.stringify(table, null, 2));
    console.log('Agent                         id              found   how');
    for (const a of table) {
      const how = a.plugin && a.cliPath ? `${a.cli} plugin` : a.mcp ? `MCP config${a.skills ? ' + skill' : ''}` : a.skills ? 'skill' : 'by hand';
      console.log(`${a.name.padEnd(30)}${a.id.padEnd(16)}${(a.found ? 'yes' : '-').padEnd(8)}${how}`);
    }
    return;
  }

  let chosen;
  if (!o.agents) chosen = table.filter((a) => a.found);
  else if (o.agents.includes('all')) chosen = table;
  else {
    const unknown = o.agents.filter((id) => !table.some((a) => a.id === id));
    if (unknown.length) {
      console.error(`error: unknown agent ${unknown.join(', ')}. See unabridged setup --list.`);
      process.exit(2);
    }
    chosen = table.filter((a) => o.agents.includes(a.id));
  }
  if (!chosen.length) return void console.log('No supported agents found. See unabridged setup --list, or pick one with --agent.');

  const spec = launchSpec();
  const plan = planSetup(chosen, spec, { remove: o.remove, skills: o.skills, plugins: o.plugins });
  const verb = o.remove ? 'Remove unabridged from' : 'Add unabridged to';
  if (!o.json) {
    console.log(`${verb}:`);
    for (const { agent, steps } of plan) {
      console.log(`  ${agent.name}`);
      for (const s of steps) console.log(`    · ${s.kind === 'cli' ? `run: ${s.run[0].split(/[\\/]/).pop()} ${s.label}` : s.label}`);
    }
    if (!o.remove) console.log(`\nAgents will start it with: ${spec.command} ${spec.args.join(' ')}`);
  }
  if (o.dry) return void (o.json && console.log(JSON.stringify(plan.map((p) => ({ agent: p.agent.id, steps: p.steps })), null, 2)));
  if (!o.yes) {
    if (!process.stdin.isTTY) return void console.log('\nNothing changed. Run again with --yes to apply.');
    if (!(await confirm('\nGo ahead? [Y/n] '))) return void console.log('Nothing changed.');
  }

  const results = applyPlan(plan, spec, { remove: o.remove });
  if (o.json) return void console.log(JSON.stringify(results, null, 2));
  console.log('');
  for (const r of results) {
    console.log(`${r.status.startsWith('failed') ? '✗' : '✓'} ${r.agent}: ${r.step} — ${r.status}`);
    if (r.text) console.log(r.text.replace(/^/gm, '    '));
  }
  if (!o.remove) console.log('\nRestart your agents (or reload their MCP servers) to pick it up. In any of them, ask: "export this chat".');
  if (results.some((r) => r.status.startsWith('failed'))) process.exitCode = 1;
}

main();
