#!/usr/bin/env node
// cc-exporter CLI — export a Claude Code session transcript in full detail.

import { spawn } from 'node:child_process';
import { exportSession, describeResult } from '../lib/export.mjs';
import { listSessions } from '../lib/locate.mjs';
import { VERSION, fmtBytes, fmtTime, truncate, splitArgs } from '../lib/util.mjs';

const HELP = `cc-exporter ${VERSION} — export a Claude Code chat in full detail

Usage
  export-chat [session] [options]
  export-chat --list [--all] [--limit N] [--search TEXT]

Session (default: current)
  current            the session running this command ($CLAUDE_CODE_SESSION_ID),
                     else the newest session for this folder
  latest | previous  newest / second-newest session for this folder
  <id> | <prefix>    a session id or the start of one (any project)
  <path.jsonl>       a transcript file
  <text>             the one session whose title or first prompt contains it

Options
  -f, --format LIST   md, html, json or all (default: md)
      --full          everything: thinking, every tool call with its input and output,
                      file reads, diffs, subagents, hooks, injected context, system prompt,
                      tokens and cost  (alias: --extended, -F, -d full)
  -d, --detail LEVEL  conversation (default) | standard | full
                        conversation: only what was said: your prompts and the replies
                        standard:     full, minus injected context / system prompt / bookkeeping
                        full:         same as --full
      --thinking      include thinking blocks at any detail level
      --no-thinking   leave thinking blocks out
  -o, --out DIR       output folder (default: ./claude-exports, which git-ignores itself)
      --redact        mask API keys, tokens, passwords, emails and your home path
      --no-subagents  leave out subagent transcripts
      --no-images     leave out images and attached documents
      --max-output N  cut each tool output / file body to N characters
      --raw           also copy the raw JSONL transcript and its side files
      --open          open the HTML export when done
      --json          print the result as JSON
  -l, --list          list sessions (this folder; --all for every project)
  -h, --help          show this help
`;

function parseArgs(argv) {
  const o = { formats: undefined, detail: undefined };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
      const v = argv[++i];
      if (v == null) throw new Error(`${a} needs a value`);
      return v;
    };
    const key = a.includes('=') ? a.slice(0, a.indexOf('=')) : a;
    switch (key) {
      case '-h': case '--help': o.help = true; break;
      case '-v': case '--version': o.version = true; break;
      case '-f': case '--format': case '--formats': o.formats = val(); break;
      case '-d': case '--detail': o.detail = val(); break;
      case '--full': case '-full': case '--extended': case '-extended': case '-F': o.detail = 'full'; break;
      case '--standard': o.detail = 'standard'; break;
      case '--conversation': o.detail = 'conversation'; break;
      case '-o': case '--out': case '--output': o.outDir = val(); break;
      case '--redact': o.redact = true; break;
      case '--thinking': o.thinking = true; break;
      case '--no-thinking': o.thinking = false; break;
      case '--no-subagents': o.subagents = false; break;
      case '--no-images': o.images = false; break;
      case '--max-output': o.maxOutput = parseInt(val(), 10) || 0; break;
      case '--raw': o.raw = true; break;
      case '--open': o.open = true; break;
      case '--json': o.json = true; break;
      case '-l': case '--list': o.list = true; break;
      case '--all': o.all = true; break;
      case '--limit': o.limit = parseInt(val(), 10) || 20; break;
      case '--search': case '-s': o.search = val(); break;
      case '--summary': break; // accepted for the slash command; summary is the default output
      case '--session': rest.push(val()); break;
      case '--argline': argv.splice(i + 1, 1, ...splitArgs(argv[i + 1] ?? '')); break;
      default:
        if (a.startsWith('-') && a !== '-') throw new Error(`Unknown option ${a} (see --help)`);
        rest.push(a);
    }
  }
  if (rest.length) o.session = rest.join(' ');
  return o;
}

function openFile(p) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  const args = [p];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* best effort */
  }
}

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }
  if (o.help) return void process.stdout.write(HELP);
  if (o.version) return void console.log(VERSION);

  if (o.list) {
    const rows = listSessions({ cwd: process.cwd(), all: o.all, limit: o.limit ?? 20, query: o.search });
    if (o.json) return void console.log(JSON.stringify(rows, null, 2));
    if (!rows.length) return void console.log(o.all ? 'No Claude Code sessions found.' : 'No sessions for this folder. Try --all.');
    const cur = process.env.CLAUDE_CODE_SESSION_ID;
    for (const r of rows) {
      console.log(
        `${r.id === cur ? '*' : ' '} ${r.id}  ${fmtTime(r.modified)}  ${fmtBytes(r.size).padStart(8)}  ${truncate(r.title ?? '(untitled)', 60)}${o.all && r.cwd ? `  — ${r.cwd}` : ''}`,
      );
    }
    if (cur && rows.some((r) => r.id === cur)) console.log('\n* = this session');
    return;
  }

  try {
    const r = exportSession({ ...o, cwd: process.cwd() });
    if (o.json) console.log(JSON.stringify({ ...r, stats: { ...r.stats, tools: undefined } }, null, 2));
    else console.log(describeResult(r));
    if (o.open) {
      const html = r.files.find((f) => f.format === 'html') ?? r.files[0];
      if (html) openFile(html.path);
    }
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}

main();
