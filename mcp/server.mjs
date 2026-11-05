#!/usr/bin/env node
// unabridged MCP server (stdio, newline-delimited JSON-RPC, no dependencies).
// Tools: list_sessions, read_session, export_session — over Claude Code and Codex sessions.

import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { exportSession, describeResult } from '../lib/export.mjs';
import { listAll, resolveAny, loadAny, normalizeFrom, HARNESS } from '../lib/sources.mjs';
import { findProjectDir } from '../lib/locate.mjs';
import { renderMarkdown } from '../lib/render-markdown.mjs';
import { redactDeep } from '../lib/redact.mjs';
import { VERSION, fmtTime, fmtBytes, truncate } from '../lib/util.mjs';

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SESSION_PROP = {
  type: 'string',
  description:
    'Which session: "current" (default: the session you are in when the host says so, else the newest one for project_path), "latest", "previous", a session id or id prefix, a path to a transcript, or words from its title.',
};
const SOURCE_PROP = {
  type: 'string',
  enum: ['auto', 'claude', 'codex', 'all'],
  description: "Which agent's sessions: claude (Claude Code), codex (OpenAI Codex), all, or auto (the agent this connector runs in; both when unknown).",
};
const PROJECT_PROP = { type: 'string', description: 'Project folder whose sessions to use (defaults to the folder your agent has open).' };
const DETAIL_PROP = {
  type: 'string',
  enum: ['conversation', 'standard', 'full'],
  description: 'conversation (default): only the prompts and replies. full: everything, including thinking, every tool call with its input and output, subagents, hooks and injected context. standard: full minus injected context.',
};

const TOOLS = [
  {
    name: 'list_sessions',
    title: 'List agent sessions',
    description: 'List Claude Code and Codex chat sessions stored on this computer, newest first, with id, agent, title, last activity, size and project folder.',
    inputSchema: {
      type: 'object',
      properties: {
        source: SOURCE_PROP,
        project_path: PROJECT_PROP,
        all_projects: { type: 'boolean', description: 'List sessions from every project folder.', default: false },
        search: { type: 'string', description: 'Only sessions whose id, title, first prompt or folder contains this text.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: { title: 'List agent sessions', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'read_session',
    title: 'Read an agent session',
    description:
      'Return a Claude Code or Codex session as Markdown so it can be read, summarized or searched: by default just the conversation, or everything with detail "full". Long transcripts are paged: pass the returned offset to continue.',
    inputSchema: {
      type: 'object',
      properties: {
        session: SESSION_PROP,
        source: SOURCE_PROP,
        project_path: PROJECT_PROP,
        detail: { ...DETAIL_PROP, default: 'conversation' },
        max_chars: { type: 'integer', minimum: 1000, maximum: 400000, default: 60000, description: 'Characters to return in this page.' },
        offset: { type: 'integer', minimum: 0, default: 0, description: 'Character offset to start from (from a previous page).' },
        max_output: { type: 'integer', minimum: 0, default: 4000, description: 'Cut each tool output to this many characters (0 = no limit).' },
        thinking: { type: 'boolean', description: 'Include thinking blocks. Default: off for conversation, on for full and standard.' },
        redact: { type: 'boolean', default: false, description: 'Mask keys, tokens, passwords, emails and the home folder.' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Read an agent session', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'export_session',
    title: 'Export an agent session',
    description:
      'Write a Claude Code or Codex session to files: by default just the conversation (prompts and replies); with detail "full", everything including tool calls, file reads, subagents and hooks. Markdown by default, or a self-contained HTML page, or JSON. Returns the file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        session: SESSION_PROP,
        source: SOURCE_PROP,
        project_path: PROJECT_PROP,
        formats: { type: 'array', items: { type: 'string', enum: ['md', 'html', 'json', 'all'] }, default: ['md'], description: 'Markdown by default; add "html" for the searchable page, "json" for data, or "all".' },
        detail: { ...DETAIL_PROP, default: 'conversation' },
        thinking: { type: 'boolean', description: 'Include thinking blocks. Default: off for conversation, on for full and standard.' },
        output_dir: { type: 'string', description: 'Folder to write into (default: <project>/chat-exports, which git-ignores itself, or ~/chat-exports).' },
        redact: { type: 'boolean', default: false, description: 'Mask keys, tokens, passwords, emails and the home folder — use before sharing.' },
        include_subagents: { type: 'boolean', default: true },
        include_images: { type: 'boolean', default: true },
        max_output: { type: 'integer', minimum: 0, default: 0, description: 'Cut each tool output to this many characters (0 = no limit).' },
        raw: { type: 'boolean', default: false, description: 'Also copy the raw transcript files.' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Export an agent session', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

// ── session context ───────────────────────────────────────────────────

let clientName = '';
let clientCanListRoots = false;
let roots = [];
let readCache = null; // the last rendered transcript, so paging doesn't re-render

/** The agent we were started by, from the client's name (env vars cover the CLI case). */
function clientHarness() {
  if (/codex/i.test(clientName)) return 'codex';
  if (/claude/i.test(clientName)) return 'claude';
  return null;
}

function sourceFor(a) {
  const f = normalizeFrom(a.source ?? 'auto');
  if (f !== 'auto') return f;
  return clientHarness() ?? (process.env.CODEX_THREAD_ID ? 'codex' : process.env.CLAUDE_CODE_SESSION_ID ? 'claude' : 'all');
}

/**
 * The user's project: the tool argument, the client's first root, or our cwd.
 * null when unknown — e.g. a Codex plugin starts us inside our own install folder.
 */
function projectCwd(a) {
  if (a.project_path) return path.resolve(a.project_path);
  if (roots.length) return roots[0];
  const cwd = process.cwd();
  if (cwd === PACKAGE_ROOT || cwd.startsWith(PACKAGE_ROOT + path.sep)) return null;
  return cwd;
}

const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

function callTool(name, a = {}) {
  const cwd = projectCwd(a);
  const from = sourceFor(a);
  switch (name) {
    case 'list_sessions': {
      const outsideProject = !cwd || (!a.project_path && !roots.length && from === 'claude' && !findProjectDir(cwd));
      const all = !!a.all_projects || outsideProject;
      const rows = listAll({ cwd, all, limit: a.limit ?? 20, query: a.search, from });
      if (!rows.length) return text(all ? 'No sessions found on this computer.' : `No sessions for ${cwd}. Try all_projects: true.`);
      const here = new Set([process.env.CLAUDE_CODE_SESSION_ID, process.env.CODEX_THREAD_ID].filter(Boolean));
      const lines = rows.map(
        (r) =>
          `- ${r.id}${here.has(r.id) ? ' (this session)' : ''} — ${HARNESS[r.source === 'codex' ? 'codex' : 'claude'].product} — ${truncate(r.title ?? '(untitled)', 80)} · ${fmtTime(r.modified ?? new Date(r.mtimeMs).toISOString())} · ${fmtBytes(r.size)}${r.cwd ? ` · ${r.cwd}` : ''}`,
      );
      return text(`${rows.length} session${rows.length === 1 ? '' : 's'}, newest first:\n${lines.join('\n')}`);
    }
    case 'read_session': {
      const info = resolveAny(a.session, { cwd, from });
      const opts = { detail: a.detail ?? 'conversation', thinking: a.thinking, maxOutput: a.max_output ?? 4000, redact: !!a.redact };
      const key = JSON.stringify([info.file, info.size, info.mtimeMs, opts]);
      if (readCache?.key !== key) {
        let model = loadAny(info, { subagents: true });
        if (opts.redact) model = redactDeep(model);
        readCache = { key, md: renderMarkdown(model, { ...opts, assets: null }) };
      }
      const md = readCache.md;
      const offset = Math.max(0, a.offset ?? 0);
      const max = a.max_chars ?? 60000;
      const page = md.slice(offset, offset + max);
      const end = offset + page.length;
      const footer = end < md.length ? `\n\n[unabridged: characters ${offset}–${end} of ${md.length}. Call read_session again with offset=${end} for more.]` : `\n\n[unabridged: end of transcript, ${md.length} characters.]`;
      return text(page + footer);
    }
    case 'export_session': {
      const r = exportSession({
        session: a.session,
        from,
        cwd: cwd ?? os.homedir(),
        sessionCwd: cwd,
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

// ── JSON-RPC over stdio ───────────────────────────────────────────────

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

let rootsSeq = 0;
function askForRoots() {
  if (clientCanListRoots) send({ jsonrpc: '2.0', id: `roots-${++rootsSeq}`, method: 'roots/list' });
}

function onResponse(msg) {
  if (typeof msg.id === 'string' && msg.id.startsWith('roots-') && Array.isArray(msg.result?.roots)) {
    roots = msg.result.roots
      .map((r) => {
        try {
          return r?.uri?.startsWith('file:') ? fileURLToPath(r.uri) : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}

function handle(msg) {
  if (Array.isArray(msg)) return msg.forEach(handle);
  if (!msg || typeof msg !== 'object') return;
  const { id, method, params } = msg;
  if (!method) return onResponse(msg); // a response to something we asked
  if (id === undefined || id === null) {
    if (method === 'notifications/initialized' || method === 'notifications/roots/list_changed') askForRoots();
    return;
  }
  try {
    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        clientName = String(params?.clientInfo?.name ?? '');
        clientCanListRoots = !!params?.capabilities?.roots;
        return reply(id, {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'unabridged', title: 'Unabridged: full agent chat export', version: VERSION },
          instructions:
            'Reads the Claude Code (~/.claude/projects) and Codex (~/.codex/sessions) chat transcripts stored on this computer. Use list_sessions to find one, read_session to read it as Markdown, export_session to write Markdown, HTML or JSON. By default these return only the conversation; pass detail "full" for every tool call, file read and subagent.',
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
