// OpenAI Codex sessions: finding them and turning them into the same model as
// Claude Code sessions, so every renderer works unchanged.
//
// Codex writes one "rollout" JSONL per thread at
//   $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<time>-<thread id>.jsonl
// (archived ones as .jsonl.zst under archived_sessions/), with thread titles in
// session_index.jsonl. Subagents and approval reviews are separate rollouts that
// name their parent thread in session_meta.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { expandHome, isPlainObject } from './util.mjs';
import { readJsonl, readJsonlBuffer, groupContext, statsFor, totalsWithSubagents, firstPromptTitle, classifyUserText } from './parse.mjs';

export function codexHome() {
  const env = process.env.CODEX_HOME;
  return env ? path.resolve(expandHome(env, os.homedir())) : path.join(os.homedir(), '.codex');
}

const ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl(\.zst)?$/i;
const canZstd = typeof zlib.zstdDecompressSync === 'function';

export function isCodexFile(file) {
  return /(^|[\\/])rollout-[^\\/]+\.jsonl(\.zst)?$/.test(file) || path.resolve(file).startsWith(codexHome() + path.sep);
}

function walk(dir, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && ID_RE.test(e.name) && (!e.name.endsWith('.zst') || canZstd)) out.push(p);
  }
  return out;
}

/** Raw records of a rollout, decompressing archived ones. */
export function readCodexRecords(file) {
  if (file.endsWith('.zst')) {
    if (!canZstd) throw new Error('Reading archived Codex sessions (.jsonl.zst) needs Node.js 22.15 or newer.');
    return readJsonlBuffer(zlib.zstdDecompressSync(fs.readFileSync(file)));
  }
  return readJsonl(file);
}

/** The first few records of a rollout (session_meta comes first), without reading the whole file. */
function headRecords(file, max = 8) {
  if (file.endsWith('.zst')) return readCodexRecords(file).records.slice(0, max);
  const out = [];
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    let len = Math.min(size, 512 * 1024);
    for (;;) {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, 0);
      const lines = buf.toString('utf8').split('\n');
      if (len < size) lines.pop(); // partial
      out.length = 0;
      for (const l of lines.slice(0, max)) {
        try {
          out.push(JSON.parse(l));
        } catch {
          /* skip */
        }
      }
      if (out.length || len >= size || len >= 32 * 1024 * 1024) break;
      len = Math.min(size, len * 4); // a very long first line (base instructions)
    }
  } catch {
    /* unreadable */
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return out;
}

function threadMeta(file, id) {
  const metas = headRecords(file).filter((r) => r.type === 'session_meta').map((r) => r.payload ?? {});
  return metas.find((m) => m.id === id) ?? metas[metas.length - 1] ?? {};
}

function spawnInfo(meta) {
  const src = meta.source;
  if (isPlainObject(src) && isPlainObject(src.subagent)) {
    const ts = src.subagent.thread_spawn;
    if (ts) return { kind: 'subagent', parent: ts.parent_thread_id, agentPath: ts.agent_path, nickname: ts.agent_nickname };
    return { kind: String(src.subagent.other ?? 'subagent'), parent: meta.parent_thread_id ?? null };
  }
  if (meta.parent_thread_id) return { kind: meta.thread_source ?? 'subagent', parent: meta.parent_thread_id };
  return null;
}

let indexCache = null;

/** Every Codex rollout on disk, with its thread metadata (cached per process). */
export function codexIndex({ refresh = false } = {}) {
  if (indexCache && !refresh) return indexCache;
  const home = codexHome();
  const files = [...walk(path.join(home, 'sessions'), []), ...walk(path.join(home, 'archived_sessions'), [])];
  const titles = new Map();
  try {
    for (const r of readJsonl(path.join(home, 'session_index.jsonl')).records) if (r?.id && r.thread_name) titles.set(r.id, r.thread_name);
  } catch {
    /* no index */
  }
  const threads = [];
  for (const file of files) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    const id = file.match(ID_RE)[1];
    const meta = threadMeta(file, id);
    threads.push({
      source: 'codex',
      id,
      file,
      size: st.size,
      mtimeMs: st.mtimeMs,
      cwd: meta.cwd ?? null,
      started: meta.timestamp ?? null,
      title: titles.get(id) ?? null,
      spawn: spawnInfo(meta),
      archived: file.endsWith('.zst') || file.includes(`${path.sep}archived_sessions${path.sep}`),
      projectDir: path.dirname(file),
    });
  }
  const children = new Map();
  for (const t of threads) if (t.spawn?.parent) (children.get(t.spawn.parent) ?? children.set(t.spawn.parent, []).get(t.spawn.parent)).push(t);
  indexCache = { home, threads, children, byId: new Map(threads.map((t) => [t.id, t])) };
  return indexCache;
}

/** Threads a person started (not subagents or approval reviews), newest first. */
export function codexSessions() {
  return codexIndex()
    .threads.filter((t) => !t.spawn)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** Cheap summary for listings: title and first prompt. */
export function summarizeCodex(info) {
  let firstPrompt = null;
  if (!info.title) {
    const recs = info.file.endsWith('.zst') ? readCodexRecords(info.file).records.slice(0, 400) : headRecords(info.file, 400);
    for (const r of recs) {
      const p = r.payload ?? {};
      if (r.type === 'response_item' && p.type === 'message' && p.role === 'user' && provenanceOf(p) === 'user') {
        firstPrompt = textParts(p.content).join('\n').trim();
        if (firstPrompt) break;
      }
    }
  }
  return {
    ...info,
    modified: new Date(info.mtimeMs).toISOString(),
    title: info.title ?? (firstPrompt ? firstPrompt.replace(/\s+/g, ' ').slice(0, 80) : null),
    firstPrompt,
  };
}

// ── parsing ───────────────────────────────────────────────────────────

function provenanceOf(p) {
  const md = p.internal_chat_message_metadata_passthrough?.content_item_metadata ?? [];
  const kinds = new Set(md.map((m) => m?.provenance?.type).filter(Boolean));
  if (kinds.has('user')) return 'user';
  if (kinds.size) return [...kinds][0];
  // Older rollouts carry no provenance: treat harness-tagged text as context.
  const t = textParts(p.content).join('\n').trim();
  return /^<[a-z_]+[\s>]/.test(t) ? 'harness' : 'user';
}

function textParts(content) {
  if (typeof content === 'string') return [content];
  return (content ?? []).filter((c) => c && (c.type === 'input_text' || c.type === 'output_text' || c.type === 'text')).map((c) => c.text ?? '');
}

function dataUriPart(url) {
  const m = String(url ?? '').match(/^data:([^;,]+);base64,(.*)$/s);
  if (m) return { type: 'image', mediaType: m[1], data: m[2], url: null, title: null };
  return { type: 'image', mediaType: 'image', data: null, url: url ?? null, title: null };
}

function contentParts(content) {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
  const out = [];
  for (const c of content ?? []) {
    if (!c) continue;
    if (c.type === 'input_text' || c.type === 'output_text' || c.type === 'text') out.push({ type: 'text', text: c.text ?? '' });
    else if (c.type === 'input_image') out.push(dataUriPart(c.image_url));
    else if (c.type === 'encrypted_content') out.push({ type: 'text', text: '[encrypted content]' });
    else out.push({ type: 'json', value: c });
  }
  return out;
}

function parseArgs(s) {
  if (typeof s !== 'string') return s ?? {};
  try {
    const v = JSON.parse(s);
    return isPlainObject(v) ? v : { arguments: v };
  } catch {
    return { arguments: s };
  }
}

const CONTEXT_LABELS = {
  'environments.environment_context': 'Environment',
  'additional_content.codex_apps_open_page': 'Open page',
  'additional_content.codex_apps_client_time_context': 'Client time',
  'goal.internal_context': 'Thread goal',
  'skills.selected_skill_instructions': 'Skill instructions',
};

function looksFailed(name, text) {
  if (name === 'exec') return /^Script (failed|error)/m.test(text);
  const m = text.match(/"exit_code"\s*:\s*(-?\d+)/);
  return m ? Number(m[1]) !== 0 : false;
}

/**
 * Load one Codex thread, with its subagent threads nested where they were spawned.
 * @param {string} file  rollout path
 * @param {{subagents?: boolean}} opts
 */
export function loadCodexSession(file, opts = {}) {
  const o = { subagents: true, ...opts };
  const ctx = { opts: o, index: codexIndex(), visited: new Set(), linked: new Set() };
  const model = parseCodexFile(file, ctx, 0);
  const id = file.match(ID_RE)?.[1];
  model.otherAgents = [];
  if (o.subagents) {
    for (const child of ctx.index.children.get(id) ?? []) {
      if (ctx.linked.has(child.id) || ctx.visited.has(child.file)) continue;
      const sub = parseCodexFile(child.file, ctx, 1);
      if (sub.events.length) model.otherAgents.push({ agentId: child.id, info: { agentType: child.spawn?.kind === 'guardian' ? 'Approval review' : child.spawn?.nickname ?? 'Agent', description: child.spawn?.agentPath ?? child.title ?? child.id }, ...sub });
    }
  }
  model.totals = totalsWithSubagents(model);
  return model;
}

function parseCodexFile(file, ctx, depth) {
  ctx.visited.add(file);
  const id = file.match(ID_RE)?.[1] ?? path.basename(file);
  const info = ctx.index.byId.get(id);
  const { records, bad } = readCodexRecords(file);
  const own = records.filter((r) => r?.type === 'session_meta').map((r) => r.payload ?? {});
  const m0 = own.find((x) => x.id === id) ?? own[own.length - 1] ?? {};
  const historyStart = Number.isFinite(m0.subagent_history_start_ordinal) ? m0.subagent_history_start_ordinal : -1;

  const meta = {
    source: 'codex',
    file,
    sessionId: id,
    customTitle: info?.title ?? null,
    aiTitle: null,
    agentName: m0.agent_nickname ?? null,
    summary: null,
    lastPrompt: null,
    cwd: m0.cwd ?? null,
    start: null,
    end: null,
    cost: null,
    slug: null,
    malformedLines: bad,
  };
  const sets = { cwds: new Set(), gitBranches: new Set(), versions: new Set(), entrypoints: new Set(), models: new Set(), permissionModes: new Set() };
  if (m0.cwd) sets.cwds.add(m0.cwd);
  if (m0.cli_version) sets.versions.add(m0.cli_version);
  if (m0.originator) sets.entrypoints.add(m0.originator);
  if (m0.git?.branch) sets.gitBranches.add(m0.git.branch);
  const base = m0.base_instructions;
  const systemPrompt = typeof base === 'string' ? [base] : typeof base?.text === 'string' ? [base.text] : null;

  const events = [];
  const tools = new Map();
  let cur = null;
  let model = null;
  let effort = null;
  let lastAssistant = null;
  let lastTotal = null;
  let sawUsage = false;
  const push = (ev) => {
    ev.seq = events.length;
    events.push(ev);
    return ev;
  };
  const turnEnd = () => (cur = null);
  const assistant = (ts) => {
    if (!cur) {
      cur = push({ kind: 'assistant', id: `codex-${events.length}`, ts, model, effort, blocks: [], usage: null, requestId: null });
      lastAssistant = cur;
    }
    cur.tsEnd = ts;
    return cur;
  };

  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    if (r.metadata?.inherited_user_message) continue; // a forked child replays its parent's history first
    if (historyStart >= 0 && Number.isFinite(r.ordinal) && r.ordinal < historyStart) continue;
    const ts = r.timestamp ?? null;
    if (ts) {
      if (!meta.start || ts < meta.start) meta.start = ts;
      if (!meta.end || ts > meta.end) meta.end = ts;
    }
    const p = r.payload ?? {};

    switch (r.type) {
      case 'turn_context':
        if (p.model) {
          model = p.model;
          sets.models.add(p.model);
        }
        effort = p.collaboration_mode?.settings?.reasoning_effort ?? p.effort ?? effort;
        if (p.cwd) sets.cwds.add(p.cwd);
        if (p.approval_policy || p.sandbox_policy?.type) sets.permissionModes.add([p.approval_policy, p.sandbox_policy?.type].filter(Boolean).join(' / '));
        break;

      case 'compacted':
        turnEnd();
        push({ kind: 'compact', ts, uuid: null, level: 'info', trigger: 'auto', preTokens: null, postTokens: null, durationMs: null });
        if (p.message) push({ kind: 'compact-summary', ts, uuid: null, text: String(p.message) });
        break;

      case 'token_usage_record': {
        const target = cur ?? lastAssistant;
        const u = p.usage ?? {};
        sawUsage = true;
        if (target) {
          const acc = (target.usage ??= { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
          const cached = u.cached_input_tokens ?? 0;
          acc.input_tokens += Math.max(0, (u.input_tokens ?? 0) - cached);
          acc.output_tokens += u.output_tokens ?? 0;
          acc.cache_read_input_tokens += cached;
          acc.cache_creation_input_tokens += u.cache_write_input_tokens ?? 0;
          if (p.response_id) target.requestId = p.response_id;
        }
        break;
      }

      case 'event_msg':
        if (p.type === 'token_count' && p.info?.total_token_usage) lastTotal = p.info.total_token_usage;
        if (p.type === 'task_complete') {
          if (lastAssistant && p.duration_ms != null) lastAssistant.turnDurationMs = p.duration_ms;
          push({ kind: 'system', subtype: 'turn_duration', ts, level: 'info', durationMs: p.duration_ms ?? null, quiet: true });
          turnEnd();
        } else if (p.type === 'turn_aborted') {
          turnEnd();
          push({ kind: 'user', ts, uuid: null, text: '[Request interrupted by user]', parts: [{ type: 'text', text: '[Request interrupted by user]' }], cls: { type: 'interrupted' }, origin: 'human' });
        } else if (p.type === 'thread_goal_updated') {
          push({ kind: 'context', attType: 'codex:goal', ts, text: JSON.stringify(p.goal ?? p, null, 2) });
        }
        break;

      case 'response_item':
        switch (p.type) {
          case 'message': {
            const parts = contentParts(p.content);
            const text = textParts(p.content).join('\n');
            if (p.role === 'assistant') {
              if (text.trim()) assistant(ts).blocks.push({ type: 'text', text, phase: p.phase ?? null });
              break;
            }
            if (p.role === 'user' && provenanceOf(p) === 'user') {
              turnEnd();
              push({ kind: 'user', ts, uuid: p.id ?? null, text, parts, cls: classifyUserText(text), origin: 'human' });
              break;
            }
            const kinds = p.internal_chat_message_metadata_passthrough?.content_item_kinds ?? [];
            const label = CONTEXT_LABELS[kinds[0]] ?? (p.role === 'developer' ? 'codex:developer' : `codex:${kinds[0] ?? p.role}`);
            push({ kind: 'context', attType: label, ts, text, parts });
            break;
          }
          case 'reasoning': {
            const summary = (p.summary ?? []).map((s) => s?.text ?? '').filter(Boolean).join('\n\n');
            const content = Array.isArray(p.content) ? p.content.map((c) => c?.text ?? '').filter(Boolean).join('\n\n') : '';
            const t = summary || content;
            assistant(ts).blocks.push({ type: 'thinking', text: t, redacted: !t, durationMs: null });
            break;
          }
          case 'function_call':
          case 'custom_tool_call':
          case 'local_shell_call':
          case 'web_search_call': {
            const name = p.type === 'local_shell_call' ? 'shell' : p.type === 'web_search_call' ? 'web_search' : p.namespace ? `${p.namespace}.${p.name}` : p.name;
            const input =
              p.type === 'custom_tool_call'
                ? p.name === 'exec'
                  ? { code: p.input ?? '' }
                  : { input: p.input ?? '' }
                : p.type === 'local_shell_call'
                  ? { command: Array.isArray(p.action?.command) ? p.action.command.join(' ') : p.action?.command ?? '' }
                  : p.type === 'web_search_call'
                    ? { query: p.action?.query ?? '' }
                    : parseArgs(p.arguments);
            const tb = { type: 'tool', id: p.call_id ?? p.id, name, input, server: false, ts, result: null, hooks: [] };
            if (p.call_id) tools.set(p.call_id, tb);
            assistant(ts).blocks.push(tb);
            if (p.type === 'web_search_call') tb.result = { ts, isError: p.status === 'failed', parts: [{ type: 'text', text: `status: ${p.status ?? 'unknown'}` }] };
            break;
          }
          case 'function_call_output':
          case 'custom_tool_call_output':
          case 'local_shell_call_output': {
            const tb = tools.get(p.call_id);
            const out = p.output;
            const parts = typeof out === 'string' ? [{ type: 'text', text: out }] : isPlainObject(out) && 'content' in out ? contentParts(out.content) : contentParts(out);
            const txt = parts.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
            const res = { ts, isError: looksFailed(tb?.name, txt), parts };
            if (tb) {
              tb.result = res;
              const d = Date.parse(ts) - Date.parse(tb.ts);
              if (isFinite(d) && d >= 0) tb.durationMs = d;
            } else {
              push({ kind: 'system', subtype: 'orphan_tool_result', ts, level: 'info', text: `Result for unknown tool call ${p.call_id}`, result: res });
            }
            break;
          }
          case 'agent_message': {
            turnEnd();
            const parts = contentParts(p.content);
            const text = parts.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
            push({ kind: 'user', ts, uuid: p.id ?? null, text, parts, cls: { type: 'text' }, origin: 'peer', originName: [p.author, p.recipient].filter(Boolean).join(' → ') || null });
            break;
          }
          case 'additional_tools': {
            const names = [];
            const visit = (ts2, ns) => {
              for (const t of ts2 ?? []) {
                if (t?.tools) visit(t.tools, t.name);
                else if (t?.name) names.push(ns && ns !== 'functions' ? `${ns}.${t.name}` : t.name);
              }
            };
            visit(p.tools);
            push({ kind: 'context', attType: 'Tool definitions', ts, text: `Tools available: ${names.join(', ')}` });
            break;
          }
          default:
            break;
        }
        break;

      default:
        break; // world_state, inter_agent_communication_metadata, retained_context, …
    }
  }

  // Older rollouts only keep a running total; put it on the last reply so the stats show it.
  if (!sawUsage && lastTotal && lastAssistant) {
    const cached = lastTotal.cached_input_tokens ?? 0;
    lastAssistant.usage = {
      input_tokens: Math.max(0, (lastTotal.input_tokens ?? 0) - cached),
      output_tokens: lastTotal.output_tokens ?? 0,
      cache_read_input_tokens: cached,
      cache_creation_input_tokens: lastTotal.cache_write_input_tokens ?? 0,
    };
  }

  // Nest subagent threads under the spawn_agent call that started them.
  const kids = ctx.index.children.get(id) ?? [];
  for (const tb of tools.values()) {
    if (!/(^|\.)spawn_agent$/.test(tb.name)) continue;
    const task = tb.input?.task_name ?? tb.input?.name;
    const child = kids.find((k) => !ctx.linked.has(k.id) && task && String(k.spawn?.agentPath ?? '').split('/').pop() === task);
    if (!child) continue;
    ctx.linked.add(child.id);
    tb.agentId = child.id;
    tb.agentMeta = { agentType: child.spawn?.nickname ?? 'agent', description: child.spawn?.agentPath };
    if (ctx.opts.subagents && !ctx.visited.has(child.file) && depth < 8) tb.subagent = parseCodexFile(child.file, ctx, depth + 1);
  }

  const grouped = groupContext(events);
  meta.title = meta.customTitle || firstPromptTitle(grouped) || (m0.agent_path ? `${m0.agent_nickname ?? 'Agent'} · ${m0.agent_path}` : null) || id;
  for (const k of Object.keys(sets)) meta[k] = [...sets[k]];
  meta.promptSnapshots = 0;
  return { meta, systemPrompt, events: grouped, stats: statsFor(grouped, meta) };
}
