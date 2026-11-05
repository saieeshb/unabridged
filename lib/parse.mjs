// Turn a Claude Code JSONL transcript into a normalized, render-ready model.
//
// The transcript is append-only and holds far more than the visible chat:
// one record per assistant content block (merged here by message id), tool
// results as user records (attached here to the tool call they answer),
// context the harness injected (attachments), hook runs, compaction
// boundaries, API errors, cost snapshots and title updates.

import fs from 'node:fs';
import path from 'node:path';
import { subagentDirFor, projectsRoot } from './locate.mjs';
import { isPlainObject } from './util.mjs';

// Records the exporter never reads; skipped before JSON.parse to save time and memory
// (api-request blobs alone can be most of a transcript's size).
const SKIP_PREFIXES = ['{"type":"api-request', '{"type":"file-history', '{"type":"queue-operation', '{"type":"atis-latch', '{"type":"bridge-session', '{"type":"frame-link', '{"type":"artifact-', '{"type":"mode"'].map((p) => Buffer.from(p));

/** Read a JSONL file in chunks, so transcripts larger than the JS string limit still load. */
export function readJsonl(file) {
  const records = [];
  let bad = 0;
  const handle = (line) => {
    if (!line.length) return;
    for (const p of SKIP_PREFIXES) if (line.length >= p.length && line.subarray(0, p.length).equals(p)) return;
    let s;
    try {
      s = line.toString('utf8');
    } catch {
      bad++;
      return;
    }
    if (!s.trim()) return;
    try {
      records.push(JSON.parse(s));
    } catch {
      bad++;
    }
  };
  const fd = fs.openSync(file, 'r');
  try {
    const CHUNK = 8 * 1024 * 1024;
    const buf = Buffer.allocUnsafe(CHUNK);
    let carry = null;
    let pos = 0;
    for (;;) {
      const n = fs.readSync(fd, buf, 0, CHUNK, pos);
      if (n <= 0) break;
      pos += n;
      const chunk = buf.subarray(0, n);
      let start = 0;
      for (let i = chunk.indexOf(10); i !== -1; i = chunk.indexOf(10, start)) {
        const piece = chunk.subarray(start, i);
        handle(carry ? Buffer.concat([carry, piece]) : piece);
        carry = null;
        start = i + 1;
      }
      if (start < n) {
        const rest = chunk.subarray(start);
        carry = carry ? Buffer.concat([carry, rest]) : Buffer.from(rest);
      }
    }
    if (carry?.length) handle(carry);
  } finally {
    fs.closeSync(fd);
  }
  return { records, bad };
}

/**
 * @param {string} file  path to a <session>.jsonl
 * @param {{subagents?: boolean, inlinePersisted?: boolean, persistedMaxBytes?: number}} opts
 */
export function loadSession(file, opts = {}) {
  const o = { subagents: true, inlinePersisted: true, persistedMaxBytes: 4 * 1024 * 1024, ...opts };
  const ctx = { opts: o, index: indexSubagents(subagentDirFor(file)), visited: new Set(), linked: new Set() };
  const model = parseFile(file, ctx, 0);
  model.otherAgents = [];
  if (o.subagents) {
    for (const [agentId, info] of ctx.index.byAgentId) {
      if (ctx.linked.has(agentId) || ctx.visited.has(path.resolve(info.file))) continue;
      const sub = parseFile(info.file, ctx, 1);
      if (sub.events.length) model.otherAgents.push({ agentId, info: info.meta, ...sub });
    }
  }
  model.totals = totalsWithSubagents(model);
  return model;
}

/** Only files Claude Code itself saved: <config>/projects/<project>/<session>/tool-results/<file>. */
function isToolResultsFile(p) {
  const root = path.resolve(projectsRoot());
  const abs = path.resolve(p);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const parts = rel.split(path.sep);
  return parts.length === 4 && parts[2] === 'tool-results';
}

function indexSubagents(dir) {
  const byAgentId = new Map();
  const byToolUseId = new Map();
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    /* no subagents */
  }
  for (const n of names.sort()) {
    const m = n.match(/^agent-(.+)\.jsonl$/);
    if (!m) continue;
    const agentId = m[1];
    let meta = null;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, `agent-${agentId}.meta.json`), 'utf8'));
    } catch {
      /* older builds write no meta file */
    }
    const info = { agentId, file: path.join(dir, n), meta };
    byAgentId.set(agentId, info);
    if (meta?.toolUseId) byToolUseId.set(meta.toolUseId, info);
  }
  return { dir, byAgentId, byToolUseId };
}

function normParts(content) {
  if (content == null) return [];
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
  if (!Array.isArray(content)) return [{ type: 'json', value: content }];
  const out = [];
  for (const b of content) {
    if (!b) continue;
    if (typeof b === 'string') out.push({ type: 'text', text: b });
    else if (b.type === 'text') out.push({ type: 'text', text: b.text ?? '' });
    else if (b.type === 'image') out.push(mediaPart('image', b));
    else if (b.type === 'document') out.push(mediaPart('document', b));
    else if (b.type === 'tool_reference') out.push({ type: 'tool_reference', name: b.tool_name ?? b.name });
    else out.push({ type: 'json', value: b });
  }
  return out;
}

function mediaPart(type, b) {
  const src = b.source ?? {};
  return {
    type,
    mediaType: src.media_type ?? (type === 'image' ? 'image/png' : 'application/pdf'),
    data: src.type === 'base64' ? src.data : null,
    url: src.url ?? null,
    title: b.title ?? null,
  };
}

function textOf(content) {
  return normParts(content)
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

const stripReminder = (s) =>
  String(s ?? '')
    .replace(/^\s*<system-reminder>\s*/, '')
    .replace(/\s*<\/system-reminder>\s*$/, '');

function tag(text, name) {
  const m = text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : null;
}

/** Recognize the harness's tagged user messages (slash commands, ! shell, notifications). */
export function classifyUserText(text) {
  const t = String(text ?? '');
  const name = tag(t, 'command-name');
  if (name != null) return { type: 'command', name: name.trim(), args: (tag(t, 'command-args') ?? '').trim() };
  if (/^\s*<local-command-stdout>/.test(t)) return { type: 'command-output', text: tag(t, 'local-command-stdout') ?? t };
  if (/^\s*<local-command-stderr>/.test(t)) return { type: 'command-output', text: tag(t, 'local-command-stderr') ?? t, isError: true };
  if (/^\s*<bash-input>/.test(t)) return { type: 'shell', command: tag(t, 'bash-input') ?? '' };
  if (/^\s*<bash-(stdout|stderr)>/.test(t)) return { type: 'shell-output', stdout: tag(t, 'bash-stdout') ?? '', stderr: tag(t, 'bash-stderr') ?? '' };
  if (/^\s*<task-notification>/.test(t)) return { type: 'notification' };
  if (/^\[Request interrupted by user/.test(t.trim())) return { type: 'interrupted' };
  return { type: 'text' };
}

/** Keep the structured tool result, minus copies of what the output already shows. */
function cleanStructured(v) {
  if (!isPlainObject(v)) return undefined;
  const out = { ...v };
  delete out.originalFile;
  if (isPlainObject(out.file) && typeof out.file.content === 'string') {
    out.file = { ...out.file, content: `[${out.file.content.length} chars, shown in output]` };
  }
  return out;
}

const shortJson = (v, max = 4000) =>
  JSON.stringify(
    v,
    (k, x) => {
      if (typeof x !== 'string') return x;
      if ((k === 'base64' || k === 'data' || k === 'signature') && x.length > 200) return `[${x.length} chars omitted]`;
      return x.length > max ? x.slice(0, max) + `… [${x.length - max} more chars]` : x;
    },
    2,
  );

/** Human-readable text for one attachment record. */
function attachmentText(att, rendered) {
  const r = Array.isArray(rendered) ? rendered.map((x) => stripReminder(x?.content ?? '')).filter(Boolean).join('\n\n') : '';
  switch (att.type) {
    case 'invoked_skills':
      return (att.skills ?? []).map((s) => `# Skill: ${s.name} (${s.path ?? ''})\n\n${s.content ?? ''}`).join('\n\n');
    case 'nested_memory':
      return `${att.path}\n\n${att.content?.content ?? ''}`;
    case 'file': {
      const c = att.content ?? {};
      const body = c.type === 'text' ? c.file?.content ?? '' : `[${c.type ?? 'file'} attached${c.file?.originalSize ? `, ${c.file.originalSize} bytes` : ''}]`;
      return `${att.filename ?? att.displayPath ?? ''}\n\n${body}`;
    }
    case 'hook_success':
    case 'hook_error':
    case 'hook_blocking_error':
      return [
        `${att.hookName ?? att.hookEvent ?? 'hook'}${att.command ? ` — ${att.command}` : ''}${att.exitCode != null ? ` (exit ${att.exitCode})` : ''}${att.durationMs != null ? `, ${att.durationMs} ms` : ''}`,
        att.stdout ? `stdout:\n${att.stdout}` : '',
        att.stderr ? `stderr:\n${att.stderr}` : '',
        att.content ? String(att.content) : '',
        r,
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'deferred_tools_record':
      return `Tool definitions recorded: ${(att.entries ?? []).map((e) => e.name).join(', ')}`;
    default:
      if (r) return r;
      if (typeof att.text === 'string') return att.text;
      if (typeof att.content === 'string') return att.content;
      return shortJson(Object.fromEntries(Object.entries(att).filter(([k]) => k !== 'type')));
  }
}

const ATTACHMENT_LABELS = {
  environment: 'Environment', model: 'Model identity', date: 'Date', date_change: 'Date change',
  instructions: 'CLAUDE.md / memory', nested_memory: 'Nested CLAUDE.md', skill_listing: 'Skill listing',
  deferred_tools_delta: 'Deferred tools', deferred_tools_record: 'Tool definitions', agent_listing_delta: 'Agent types',
  mcp_instructions_delta: 'MCP server instructions', session_context: 'Session context', auto_mode: 'Auto mode',
  plan_mode: 'Plan mode', plan_mode_exit: 'Plan mode exit', total_tokens_reminder: 'Token budget',
  silent_turn_reminder: 'Progress reminder', task_reminder: 'Task reminder', edited_text_file: 'File changed on disk',
  file: 'Attached file', pdf_reference: 'PDF reference', directory: 'Attached directory', hook_success: 'Hook output',
  hook_additional_context: 'Hook context', invoked_skills: 'Skills in context', skill_mention: 'Skill mention',
  compact_file_reference: 'File kept through compaction', remote_session_change: 'Session settings',
  command_permissions: 'Command permissions', read_truncation_notice: 'Read truncated', thinking_drop: 'Thinking dropped',
  thinking_stripped: 'Thinking stripped', credential_org: 'Organization', 'meta-message': 'Injected message',
};

export function attachmentLabel(t) {
  return ATTACHMENT_LABELS[t] ?? String(t ?? 'context').replace(/_/g, ' ');
}

function parseFile(file, ctx, depth) {
  ctx.visited.add(path.resolve(file));
  const { records, bad } = readJsonl(file);

  const seen = new Set();
  const recs = [];
  for (const r of records) {
    if (r?.uuid) {
      if (seen.has(r.uuid)) continue;
      seen.add(r.uuid);
    }
    if (r && typeof r === 'object') recs.push(r);
  }

  const meta = {
    file,
    sessionId: null,
    customTitle: null,
    aiTitle: null,
    agentName: null,
    summary: null,
    lastPrompt: null,
    cwd: null,
    start: null,
    end: null,
    cost: null,
    slug: null,
    malformedLines: bad,
  };
  const sets = { cwds: new Set(), gitBranches: new Set(), versions: new Set(), entrypoints: new Set(), models: new Set(), permissionModes: new Set() };
  const events = [];
  const tools = new Map();
  const asstById = new Map();
  let systemPrompt = null;
  let promptSnapshots = 0;
  let lastAssistant = null;
  const push = (ev) => {
    ev.seq = events.length;
    events.push(ev);
    return ev;
  };

  const attachResult = (b, r, structured) => {
    const parts = normParts(b.content);
    const res = {
      ts: r.timestamp ?? null,
      isError: !!b.is_error,
      parts,
      structured: cleanStructured(structured),
      permission: r.permissionDecision ?? undefined,
      denial: r.toolDenialKind ?? undefined,
    };
    const txt = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    const pm = txt.includes('<persisted-output>') && txt.match(/Full output saved to: (.+?)\s*$/m);
    if (pm) {
      res.persistedPath = pm[1].trim();
      if (ctx.opts.inlinePersisted && !isToolResultsFile(res.persistedPath)) {
        res.fullOutputNote = 'The saved-output path is outside Claude Code\'s tool-results folders; not inlined.';
      } else if (ctx.opts.inlinePersisted) {
        try {
          const st = fs.statSync(res.persistedPath);
          if (st.size <= ctx.opts.persistedMaxBytes) res.fullOutput = fs.readFileSync(res.persistedPath, 'utf8');
          else res.fullOutputNote = `Full output is ${st.size} bytes; not inlined.`;
        } catch {
          res.fullOutputNote = 'The saved full output no longer exists on disk.';
        }
      }
    }
    const tb = tools.get(b.tool_use_id);
    if (tb) {
      tb.result = res;
      const d = Date.parse(res.ts) - Date.parse(tb.ts);
      if (isFinite(d) && d >= 0) tb.durationMs = d;
    } else {
      push({ kind: 'system', subtype: 'orphan_tool_result', ts: r.timestamp, uuid: r.uuid, text: `Result for unknown tool call ${b.tool_use_id}`, result: res });
    }
  };

  for (const r of recs) {
    if (r.sessionId) meta.sessionId ??= r.sessionId;
    if (r.timestamp) {
      if (!meta.start || r.timestamp < meta.start) meta.start = r.timestamp;
      if (!meta.end || r.timestamp > meta.end) meta.end = r.timestamp;
    }
    if (r.cwd) {
      meta.cwd ??= r.cwd;
      sets.cwds.add(r.cwd);
    }
    if (r.gitBranch) sets.gitBranches.add(r.gitBranch);
    if (r.version) sets.versions.add(r.version);
    if (r.entrypoint) sets.entrypoints.add(r.entrypoint);
    if (r.permissionMode) sets.permissionModes.add(r.permissionMode);
    if (r.slug) meta.slug = r.slug;

    switch (r.type) {
      case 'custom-title':
        if (r.customTitle) meta.customTitle = r.customTitle;
        break;
      case 'ai-title':
        if (r.aiTitle) meta.aiTitle = r.aiTitle;
        break;
      case 'agent-name':
        if (r.agentName) meta.agentName = r.agentName;
        break;
      case 'summary':
        if (r.summary) meta.summary = r.summary;
        break;
      case 'last-prompt':
        if (r.lastPrompt) meta.lastPrompt = r.lastPrompt;
        break;
      case 'cost-state':
        meta.cost = {
          totalCostUSD: r.totalCostUSD,
          totalAPIDurationMs: r.totalAPIDuration,
          totalToolDurationMs: r.totalToolDuration,
          totalDurationMs: r.totalDuration,
          linesAdded: r.totalLinesAdded,
          linesRemoved: r.totalLinesRemoved,
          modelUsage: r.modelUsage,
          hasUnknownModelCost: r.hasUnknownModelCost,
        };
        break;
      case 'permission-mode':
        if (r.permissionMode) sets.permissionModes.add(r.permissionMode);
        break;

      case 'assistant': {
        const m = r.message ?? {};
        if (r.isApiErrorMessage || (r.error && !m.content?.length)) {
          push({ kind: 'system', subtype: 'api_error', level: 'error', ts: r.timestamp, uuid: r.uuid, text: textOf(m.content) || String(r.error ?? 'API error'), status: r.apiErrorStatus });
          break;
        }
        const id = m.id || r.uuid;
        let ev = asstById.get(id);
        if (!ev) {
          ev = push({
            kind: 'assistant',
            id,
            uuid: r.uuid,
            ts: r.timestamp,
            model: m.model ?? null,
            requestedModel: r.requestedModel ?? null,
            effort: r.effort ?? null,
            requestId: r.requestId ?? null,
            blocks: [],
            synthetic: m.model === '<synthetic>',
          });
          asstById.set(id, ev);
        }
        lastAssistant = ev;
        ev.tsEnd = r.timestamp;
        if (m.model && m.model !== '<synthetic>') sets.models.add(m.model);
        if (m.usage) ev.usage = m.usage;
        if (m.stop_reason) ev.stopReason = m.stop_reason;
        const attribution = { skill: r.attributionSkill, plugin: r.attributionPlugin, mcpServer: r.attributionMcpServer, agent: r.attributionAgent };
        if (Object.values(attribution).some(Boolean)) ev.attribution = attribution;
        for (const b of m.content ?? []) {
          if (!b) continue;
          if (b.type === 'text') {
            if (b.text?.trim()) ev.blocks.push({ type: 'text', text: b.text });
          } else if (b.type === 'thinking') {
            ev.blocks.push({ type: 'thinking', text: b.thinking ?? '', redacted: !b.thinking, durationMs: r.thinkingDurationMs ?? null });
          } else if (b.type === 'redacted_thinking') {
            ev.blocks.push({ type: 'thinking', text: '', redacted: true, durationMs: r.thinkingDurationMs ?? null });
          } else if (b.type === 'tool_use' || b.type === 'server_tool_use' || b.type === 'mcp_tool_use') {
            const tb = { type: 'tool', id: b.id, name: b.name, input: b.input ?? {}, server: b.type !== 'tool_use', ts: r.timestamp, result: null, hooks: [] };
            if (b.caller && b.caller.type !== 'direct') tb.caller = b.caller;
            tools.set(b.id, tb);
            ev.blocks.push(tb);
          } else if (/_tool_result$/.test(b.type ?? '') && b.tool_use_id) {
            attachResult({ tool_use_id: b.tool_use_id, content: b.content, is_error: b.is_error }, r);
          } else if (b.type === 'image') {
            ev.blocks.push({ type: 'media', part: mediaPart('image', b) });
          } else {
            ev.blocks.push({ type: 'unknown', raw: b });
          }
        }
        break;
      }

      case 'user': {
        const c = r.message?.content;
        if (r.isCompactSummary) {
          push({ kind: 'compact-summary', ts: r.timestamp, uuid: r.uuid, text: textOf(c) });
          break;
        }
        const blocks = typeof c === 'string' ? [{ type: 'text', text: c }] : Array.isArray(c) ? c : [];
        const results = blocks.filter((b) => b?.type === 'tool_result');
        for (const b of results) attachResult(b, r, results.length === 1 ? r.toolUseResult : undefined);
        const rest = blocks.filter((b) => b && b.type !== 'tool_result');
        if (!rest.length) break;
        const parts = normParts(rest);
        const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
        if (!text.trim() && !parts.some((p) => p.type !== 'text')) break;
        if (r.isMeta) {
          push({ kind: 'context', attType: 'meta-message', ts: r.timestamp, uuid: r.uuid, text, parts });
          break;
        }
        const cls = classifyUserText(text);
        const originKind = r.origin?.kind ?? (results.length ? 'tool' : 'human');
        push({
          kind: 'user',
          ts: r.timestamp,
          uuid: r.uuid,
          text,
          parts,
          cls,
          origin: originKind,
          originName: r.origin?.name ?? null,
          permissionMode: r.permissionMode ?? null,
          sidechain: !!r.isSidechain,
        });
        break;
      }

      case 'attachment': {
        const att = r.attachment ?? {};
        if (att.type === 'prompt_snapshot') {
          promptSnapshots++;
          if (!systemPrompt && Array.isArray(att.systemPrompt)) {
            systemPrompt = att.systemPrompt.filter((s) => typeof s === 'string' && !/^__[A-Z_]+__$/.test(s.trim()));
          }
          break;
        }
        if (att.type === 'queued_command' && att.prompt && att.commandMode !== 'task-notification') {
          push({
            kind: 'user',
            ts: att.timestamp ?? r.timestamp,
            uuid: r.uuid,
            text: String(att.prompt),
            parts: [{ type: 'text', text: String(att.prompt) }],
            cls: classifyUserText(att.prompt),
            origin: att.origin?.kind ?? 'human',
            queued: true,
          });
          break;
        }
        if ((att.type === 'hook_success' || att.type === 'hook_additional_context' || /^hook_/.test(att.type)) && att.toolUseID && tools.has(att.toolUseID)) {
          tools.get(att.toolUseID).hooks.push({ type: att.type, name: att.hookName ?? att.hookEvent, text: attachmentText(att, r.rendered) });
          break;
        }
        push({ kind: 'context', attType: att.type ?? 'unknown', ts: r.timestamp, uuid: r.uuid, text: attachmentText(att, r.rendered) });
        break;
      }

      case 'system': {
        const base = { ts: r.timestamp, uuid: r.uuid, level: r.level ?? 'info' };
        switch (r.subtype) {
          case 'compact_boundary': {
            const cm = r.compactMetadata ?? {};
            push({ kind: 'compact', ...base, trigger: cm.trigger ?? null, preTokens: cm.preTokens ?? null, postTokens: cm.postTokens ?? null, durationMs: cm.durationMs ?? null });
            break;
          }
          case 'turn_duration':
            if (lastAssistant) lastAssistant.turnDurationMs = r.durationMs;
            push({ kind: 'system', subtype: 'turn_duration', ...base, durationMs: r.durationMs, messageCount: r.messageCount, quiet: true });
            break;
          case 'stop_hook_summary':
            push({
              kind: 'system',
              subtype: 'stop_hook_summary',
              ...base,
              hookCount: r.hookCount ?? 0,
              hooks: r.hookInfos ?? [],
              hookErrors: r.hookErrors ?? [],
              preventedContinuation: !!r.preventedContinuation,
              stopReason: r.stopReason ?? null,
              quiet: !(r.hookErrors?.length || r.preventedContinuation),
            });
            break;
          case 'local_command': {
            const t = String(r.content ?? '');
            push({ kind: 'command-output', ...base, text: tag(t, 'local-command-stdout') ?? tag(t, 'local-command-stderr') ?? t, command: r.commandRun ?? null });
            break;
          }
          case 'api_error': {
            const e = r.error ?? {};
            push({
              kind: 'system',
              subtype: 'api_error',
              ...base,
              level: 'error',
              text: e.formatted || e.message || 'API error',
              retry: r.retryAttempt != null ? `retry ${r.retryAttempt}/${r.maxRetries ?? '?'} in ${r.retryInMs ?? '?'} ms` : null,
            });
            break;
          }
          default:
            push({ kind: 'system', subtype: r.subtype ?? 'system', ...base, text: typeof r.content === 'string' ? r.content : r.content ? shortJson(r.content) : '' });
        }
        break;
      }

      default:
        break; // bookkeeping records: api-request*, file-history*, queue-operation, mode, bridge-session, …
    }
  }

  // Link subagent transcripts to the Agent/Task calls that launched them.
  for (const tb of tools.values()) {
    const s = tb.result?.structured;
    const info = ctx.index.byToolUseId.get(tb.id) || (s?.agentId && ctx.index.byAgentId.get(s.agentId)) || null;
    if (!info) continue;
    ctx.linked.add(info.agentId);
    tb.agentId = info.agentId;
    tb.agentMeta = info.meta;
    if (ctx.opts.subagents && !ctx.visited.has(path.resolve(info.file)) && depth < 8) {
      tb.subagent = parseFile(info.file, ctx, depth + 1);
    }
  }

  // Group runs of injected context into one collapsible event.
  const grouped = [];
  for (const ev of events) {
    const prev = grouped[grouped.length - 1];
    if (ev.kind === 'context') {
      if (prev?.kind === 'context-group') prev.items.push(ev);
      else grouped.push({ kind: 'context-group', ts: ev.ts, items: [ev] });
    } else {
      grouped.push(ev);
    }
  }
  grouped.forEach((ev, i) => (ev.seq = i));

  meta.title = meta.customTitle || meta.aiTitle || meta.agentName || meta.summary || firstPromptTitle(grouped) || meta.sessionId || path.basename(file, '.jsonl');
  for (const k of Object.keys(sets)) meta[k] = [...sets[k]];
  meta.promptSnapshots = promptSnapshots;

  return { meta, systemPrompt, events: grouped, stats: statsFor(grouped, meta) };
}

function firstPromptTitle(events) {
  const u = events.find((e) => e.kind === 'user' && e.origin === 'human' && e.cls?.type === 'text' && e.text.trim());
  return u ? u.text.replace(/\s+/g, ' ').trim().slice(0, 80) : null;
}

function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function addUsage(acc, u) {
  acc.input += u.input_tokens ?? 0;
  acc.output += u.output_tokens ?? 0;
  acc.cacheRead += u.cache_read_input_tokens ?? 0;
  acc.cacheWrite += u.cache_creation_input_tokens ?? 0;
}

function statsFor(events, meta) {
  const st = {
    prompts: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolErrors: 0,
    tools: {},
    thinking: 0,
    thinkingRedacted: 0,
    images: 0,
    compactions: 0,
    apiErrors: 0,
    subagents: 0,
    usage: emptyUsage(),
    usageByModel: {},
    durationMs: meta.start && meta.end ? Date.parse(meta.end) - Date.parse(meta.start) : null,
  };
  for (const ev of events) {
    if (ev.kind === 'user') {
      if ((ev.origin === 'human' || ev.queued) && ev.cls?.type !== 'interrupted') st.prompts++;
      st.images += ev.parts.filter((p) => p.type === 'image').length;
    } else if (ev.kind === 'assistant') {
      if (!ev.synthetic) st.assistantMessages++;
      if (ev.usage) {
        addUsage(st.usage, ev.usage);
        const k = ev.model ?? 'unknown';
        addUsage((st.usageByModel[k] ??= emptyUsage()), ev.usage);
      }
      for (const b of ev.blocks) {
        if (b.type === 'thinking') {
          st.thinking++;
          if (b.redacted) st.thinkingRedacted++;
        } else if (b.type === 'tool') {
          st.toolCalls++;
          const t = (st.tools[b.name] ??= { calls: 0, errors: 0, durationMs: 0 });
          t.calls++;
          t.durationMs += b.durationMs ?? 0;
          if (b.result?.isError) {
            st.toolErrors++;
            t.errors++;
          }
          if (b.agentId) st.subagents++;
          st.images += (b.result?.parts ?? []).filter((p) => p.type === 'image').length;
        }
      }
    } else if (ev.kind === 'compact') st.compactions++;
    else if (ev.kind === 'system' && ev.subtype === 'api_error') st.apiErrors++;
  }
  return st;
}

function totalsWithSubagents(model) {
  const t = { usage: { ...model.stats.usage }, toolCalls: model.stats.toolCalls, subagentCount: 0 };
  const visit = (events) => {
    for (const ev of events) {
      if (ev.kind !== 'assistant') continue;
      for (const b of ev.blocks) {
        if (b.type !== 'tool' || !b.subagent) continue;
        t.subagentCount++;
        const s = b.subagent.stats;
        for (const k of Object.keys(t.usage)) t.usage[k] += s.usage[k];
        t.toolCalls += s.toolCalls;
        visit(b.subagent.events);
      }
    }
  };
  visit(model.events);
  for (const a of model.otherAgents ?? []) {
    t.subagentCount++;
    for (const k of Object.keys(t.usage)) t.usage[k] += a.stats.usage[k];
    t.toolCalls += a.stats.toolCalls;
    visit(a.events);
  }
  return t;
}
