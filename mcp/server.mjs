#!/usr/bin/env node
// cc-exporter MCP server (stdio, newline-delimited JSON-RPC, no dependencies).
// Tools: list_sessions, read_session, export_session.

import readline from 'node:readline';
import { exportSession, describeResult } from '../lib/export.mjs';
import { listSessions, resolveSession, findProjectDir } from '../lib/locate.mjs';
import { loadSession } from '../lib/parse.mjs';
import { renderMarkdown } from '../lib/render-markdown.mjs';
import { redactDeep } from '../lib/redact.mjs';
import { VERSION, fmtTime, fmtBytes, truncate } from '../lib/util.mjs';

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const SESSION_PROP = {
  type: 'string',
  description:
    'Which session: "current" (default — this Claude Code session, else the newest one for project_path), "latest", "previous", a session id or id prefix, a path to a .jsonl transcript, or words from its title.',
};
const PROJECT_PROP = { type: 'string', description: "Project folder whose sessions to use (defaults to the server's working directory)." };
const DETAIL_PROP = {
  type: 'string',
  enum: ['full', 'standard', 'conversation'],
  description: 'conversation (default): only the prompts and replies. full: everything, including thinking, every tool call with its input and output, subagents, hooks and injected context. standard: full minus injected context.',
};

const TOOLS = [
  {
    name: 'list_sessions',
    title: 'List Claude Code sessions',
    description: 'List Claude Code chat sessions stored on this computer, newest first, with id, title, last activity, size and project folder.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: PROJECT_PROP,
        all_projects: { type: 'boolean', description: 'List sessions from every project, not just project_path.', default: false },
        search: { type: 'string', description: 'Only sessions whose id, title, first or last prompt, or folder contains this text.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: { title: 'List Claude Code sessions', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'read_session',
    title: 'Read a Claude Code session',
    description:
      'Return a Claude Code session transcript as Markdown (prompts, replies, tool calls with inputs and outputs, thinking, subagents) so it can be read, summarized or searched. Long transcripts are paged: pass the returned next_offset to continue.',
    inputSchema: {
      type: 'object',
      properties: {
        session: SESSION_PROP,
        project_path: PROJECT_PROP,
        detail: { ...DETAIL_PROP, default: 'conversation' },
        max_chars: { type: 'integer', minimum: 1000, maximum: 400000, default: 60000, description: 'Characters to return in this page.' },
        offset: { type: 'integer', minimum: 0, default: 0, description: 'Character offset to start from (from a previous page).' },
        max_output: { type: 'integer', minimum: 0, default: 4000, description: 'Cut each tool output to this many characters (0 = no limit).' },
        thinking: { type: 'boolean', description: 'Include thinking blocks. Default: on for full and standard detail, off for conversation.' },
        redact: { type: 'boolean', default: false, description: 'Mask keys, tokens, passwords, emails and the home path.' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Read a Claude Code session', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'export_session',
    title: 'Export a Claude Code session',
    description:
      'Write a Claude Code session to files in full detail: a self-contained HTML page (searchable, collapsible tool calls, light/dark), Markdown (with images saved beside it) and/or structured JSON. Returns the file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        session: SESSION_PROP,
        project_path: PROJECT_PROP,
        formats: { type: 'array', items: { type: 'string', enum: ['md', 'html', 'json', 'all'] }, default: ['md'], description: 'Markdown by default; add "html" for the searchable page, "json" for data, or "all".' },
        thinking: { type: 'boolean', description: 'Include thinking blocks. Default: on for full and standard detail, off for conversation.' },
        detail: { ...DETAIL_PROP, default: 'conversation' },
        output_dir: { type: 'string', description: 'Folder to write into (default: <project>/claude-exports, which git-ignores itself, or ~/claude-exports).' },
        redact: { type: 'boolean', default: false, description: 'Mask keys, tokens, passwords, emails and the home path — use before sharing.' },
        include_subagents: { type: 'boolean', default: true },
        include_images: { type: 'boolean', default: true },
        max_output: { type: 'integer', minimum: 0, default: 0, description: 'Cut each tool output to this many characters (0 = no limit).' },
        raw: { type: 'boolean', default: false, description: 'Also copy the raw JSONL transcript and its side files.' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Export a Claude Code session', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

// The last rendered transcript, so paging through it with offset doesn't re-render each time.
let readCache = null;

const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

function callTool(name, a = {}) {
  const cwd = a.project_path || process.cwd();
  switch (name) {
    case 'list_sessions': {
      // Outside a project (e.g. Claude Desktop), list every project's sessions.
      const all = !!a.all_projects || (!a.project_path && !findProjectDir(cwd));
      const rows = listSessions({ cwd, all, limit: a.limit ?? 20, query: a.search });
      if (!rows.length) return text(a.all_projects ? 'No Claude Code sessions found on this computer.' : `No sessions for ${cwd}. Try all_projects: true.`);
      const cur = process.env.CLAUDE_CODE_SESSION_ID;
      const lines = rows.map(
        (r) => `- ${r.id}${r.id === cur ? ' (this session)' : ''} — ${truncate(r.title ?? '(untitled)', 80)} · ${fmtTime(r.modified)} · ${fmtBytes(r.size)}${r.cwd ? ` · ${r.cwd}` : ''}`,
      );
      return text(`${rows.length} session${rows.length === 1 ? '' : 's'}, newest first:\n${lines.join('\n')}`);
    }
    case 'read_session': {
      const info = resolveSession(a.session, { cwd });
      const opts = { detail: a.detail ?? 'conversation', thinking: a.thinking, maxOutput: a.max_output ?? 4000, redact: !!a.redact };
      const key = JSON.stringify([info.file, info.size, info.mtimeMs, opts]);
      if (readCache?.key !== key) {
        let model = loadSession(info.file, { subagents: true });
        if (opts.redact) model = redactDeep(model);
        readCache = { key, md: renderMarkdown(model, { ...opts, assets: null }) };
      }
      const md = readCache.md;
      const offset = Math.max(0, a.offset ?? 0);
      const max = a.max_chars ?? 60000;
      const page = md.slice(offset, offset + max);
      const end = offset + page.length;
      const footer = end < md.length ? `\n\n[cc-exporter: characters ${offset}–${end} of ${md.length}. Call read_session again with offset=${end} for more.]` : `\n\n[cc-exporter: end of transcript, ${md.length} characters.]`;
      return text(page + footer);
    }
    case 'export_session': {
      const r = exportSession({
        session: a.session,
        cwd,
        formats: a.formats,
        detail: a.detail ?? 'conversation',
        thinking: a.thinking,
        outDir: a.output_dir,
        redact: !!a.redact,
        subagents: a.include_subagents !== false,
        images: a.include_images !== false,
        maxOutput: a.max_output ?? 0,
        raw: !!a.raw,
      });
      return text(describeResult(r));
    }
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function handle(msg) {
  if (Array.isArray(msg)) return msg.forEach(handle);
  if (!msg || typeof msg !== 'object') return;
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notification or response
  try {
    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        return reply(id, {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'cc-exporter', title: 'Claude Code chat exporter', version: VERSION },
          instructions:
            'Reads Claude Code session transcripts stored on this computer (~/.claude/projects). Use list_sessions to find one, read_session to read it as Markdown, export_session to write HTML/Markdown/JSON files. "current" means the newest session for the project folder.',
        });
      }
      case 'ping':
        return reply(id, {});
      case 'tools/list':
        return reply(id, { tools: TOOLS });
      case 'tools/call':
        try {
          return reply(id, callTool(params?.name, params?.arguments ?? {}));
        } catch (e) {
          if (e.code === -32602) return fail(id, -32602, e.message);
          return reply(id, text(`Error: ${e.message}`, true));
        }
      case 'resources/list':
        return reply(id, { resources: [] });
      case 'resources/templates/list':
        return reply(id, { resourceTemplates: [] });
      case 'prompts/list':
        return reply(id, { prompts: [] });
      default:
        return fail(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    return fail(id, -32603, e.message);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  handle(msg);
});
// When stdin closes the event loop empties and the process exits after stdout drains.
