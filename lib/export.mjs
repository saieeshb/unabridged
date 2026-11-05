// Export orchestration shared by the CLI, the slash command and the MCP server.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { subagentDirFor } from './locate.mjs';
import { resolveAny, loadAny, normalizeFrom } from './sources.mjs';
import { renderHtml } from './render-html.mjs';
import { renderMarkdown } from './render-markdown.mjs';
import { redactDeep } from './redact.mjs';
import { filterEvents, DETAILS, DEFAULT_DETAIL, plural, keepThinking } from './describe.mjs';
import { VERSION, slug, fmtBytes, fmtTokens, expandHome } from './util.mjs';

export const FORMATS = ['html', 'md', 'json'];

export const DEFAULT_FORMATS = ['md'];

export function normalizeFormats(f) {
  const list = (Array.isArray(f) ? f : String(f ?? '').split(/[,\s]+/))
    .map((x) => String(x).toLowerCase().trim().replace(/^\./, ''))
    .filter(Boolean)
    .map((x) => (x === 'markdown' ? 'md' : x === 'htm' ? 'html' : x));
  if (!list.length) return [...DEFAULT_FORMATS];
  if (list.includes('all')) return [...FORMATS];
  const bad = list.filter((x) => !FORMATS.includes(x));
  if (bad.length) throw new Error(`Unknown format "${bad.join(', ')}". Use html, md, json or all.`);
  return [...new Set(list)];
}

/** Where exports go when no folder is given. */
export function defaultOutDir(cwd = process.cwd()) {
  const home = os.homedir();
  const c = path.resolve(cwd);
  if (c !== home && c !== path.parse(c).root) {
    try {
      fs.accessSync(c, fs.constants.W_OK);
      return path.join(c, 'chat-exports');
    } catch {
      /* fall through */
    }
  }
  return path.join(home, 'chat-exports');
}

function ensureDir(dir, { selfIgnore = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  // Keep exports out of git by default: the folder ignores itself.
  const gi = path.join(dir, '.gitignore');
  if (selfIgnore && !fs.existsSync(gi)) fs.writeFileSync(gi, '# Agent chat exports — not for version control\n*\n');
}

function baseName(model) {
  const d = model.meta.start ? new Date(model.meta.start) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return `${date}_${slug(model.meta.title, 50)}_${String(model.meta.sessionId ?? 'session').slice(0, 8)}`;
}

function stripMedia(value) {
  if (Array.isArray(value)) return value.map(stripMedia);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === 'data' && typeof v === 'string' && v.length > 200 ? `[${v.length} base64 chars omitted]` : stripMedia(v);
    return out;
  }
  return value;
}

/** Every transcript file behind a model: the session itself and all nested agent threads. */
function threadFiles(model, out = new Set()) {
  if (model.meta?.file) out.add(model.meta.file);
  for (const ev of model.events ?? []) for (const b of ev.blocks ?? []) if (b.subagent) threadFiles(b.subagent, out);
  for (const a of model.otherAgents ?? []) threadFiles(a, out);
  return out;
}

function filterModelEvents(model, detail, thinking) {
  const deep = (m) => ({ ...m, events: filterEvents(m.events, detail, { thinking }) });
  const out = deep(model);
  if (detail !== 'full') out.systemPrompt = null;
  out.otherAgents = detail === 'conversation' ? [] : (model.otherAgents ?? []).map(deep);
  return out;
}

/**
 * Export one session.
 * @param {object} o
 * @param {string} [o.session]  current | latest | previous | id | id prefix | path | title text
 * @param {string} [o.cwd]
 * @param {string|string[]} [o.formats]  html, md, json, all
 * @param {string} [o.outDir]
 * @param {'full'|'standard'|'conversation'} [o.detail]
 * @param {boolean} [o.thinking]  force thinking blocks on/off (default: on unless detail is conversation)
 * @param {boolean} [o.redact]
 * @param {boolean} [o.subagents]
 * @param {boolean} [o.images]
 * @param {number} [o.maxOutput]
 * @param {boolean} [o.raw]  also copy the raw JSONL (and subagent / tool-result files)
 */
export function exportSession(o = {}) {
  const cwd = o.cwd ?? process.cwd();
  const detail = o.detail ?? DEFAULT_DETAIL;
  if (!DETAILS.includes(detail)) throw new Error(`Unknown detail level "${detail}". Use conversation (the default), standard or full.`);
  const formats = normalizeFormats(o.formats);
  const images = o.images !== false;
  const info = resolveAny(o.session, { cwd: 'sessionCwd' in o ? o.sessionCwd : cwd, from: o.from });

  let model = loadAny(info, { subagents: o.subagents !== false });
  if (o.redact) model = redactDeep(model);

  const outDir = path.resolve(cwd, expandHome(o.outDir ?? defaultOutDir(cwd), os.homedir()));
  ensureDir(outDir, { selfIgnore: !o.outDir });
  const base = baseName(model);
  const files = [];
  const write = (format, name, content) => {
    const p = path.join(outDir, name);
    fs.writeFileSync(p, content);
    files.push({ format, path: p, bytes: Buffer.byteLength(content) });
  };

  if (formats.includes('html')) write('html', `${base}.html`, renderHtml(model, { detail, thinking: o.thinking, maxOutput: o.maxOutput ?? 0, images }));

  if (formats.includes('md')) {
    let n = 0;
    const assetDir = path.join(outDir, `${base}_files`);
    const assets = images
      ? {
          save(part) {
            if (!part.data) return null;
            const ext = (part.mediaType?.split('/')[1] ?? 'bin').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'bin';
            const name = `${part.type}-${String(++n).padStart(3, '0')}.${ext}`;
            fs.mkdirSync(assetDir, { recursive: true });
            fs.writeFileSync(path.join(assetDir, name), Buffer.from(part.data, 'base64'));
            return `${base}_files/${name}`;
          },
        }
      : null;
    write('md', `${base}.md`, renderMarkdown(model, { detail, thinking: o.thinking, assets, maxOutput: o.maxOutput ?? 0 }));
    if (n) files.push({ format: 'md-assets', path: assetDir, bytes: null, count: n });
  }

  if (formats.includes('json')) {
    let data = filterModelEvents(model, detail, o.thinking);
    if (!images) data = stripMedia(data);
    const doc = { exporter: { name: 'unabridged', version: VERSION, exportedAt: new Date().toISOString(), detail, thinking: keepThinking(detail, o.thinking), redacted: !!o.redact }, ...data };
    write('json', `${base}.json`, JSON.stringify(doc, null, 2));
  }

  if (o.raw) {
    const rawDir = path.join(outDir, `${base}_raw`);
    fs.mkdirSync(rawDir, { recursive: true });
    fs.copyFileSync(info.file, path.join(rawDir, path.basename(info.file)));
    if (info.source === 'codex') {
      // Codex keeps each subagent and review thread in its own rollout file.
      for (const f of threadFiles(model)) if (f !== info.file) fs.copyFileSync(f, path.join(rawDir, path.basename(f)));
    } else {
      const side = path.join(path.dirname(info.file), path.basename(info.file, '.jsonl'));
      if (fs.existsSync(side) && fs.statSync(side).isDirectory()) fs.cpSync(side, path.join(rawDir, path.basename(side)), { recursive: true });
      else if (fs.existsSync(subagentDirFor(info.file))) fs.cpSync(subagentDirFor(info.file), path.join(rawDir, 'subagents'), { recursive: true });
    }
    files.push({ format: 'raw', path: rawDir, bytes: null });
  }

  return {
    session: { id: model.meta.sessionId ?? info.id, source: model.meta.source, title: model.meta.title, file: info.file, cwd: model.meta.cwd, start: model.meta.start, end: model.meta.end },
    note: info.note ?? null,
    detail,
    thinking: o.thinking,
    redacted: !!o.redact,
    outDir,
    files,
    stats: model.stats,
    totals: model.totals,
    cost: model.meta.cost,
  };
}

export function describeResult(r) {
  const s = r.stats;
  const product = r.session.source === 'codex' ? 'Codex' : 'Claude Code';
  const lines = [`Exported "${r.session.title}" (${product} session ${r.session.id}, ${r.detail} detail${r.redacted ? ', redacted' : ''})`];
  if (r.note) lines.push(`  Note: ${r.note}`);
  const label = { html: 'HTML', md: 'Markdown', json: 'JSON', 'md-assets': 'Images', raw: 'Raw JSONL' };
  for (const f of r.files) lines.push(`  ${(label[f.format] ?? f.format).padEnd(10)} ${f.path}${f.bytes != null ? `  (${fmtBytes(f.bytes)})` : f.count ? `  (${f.count} files)` : ''}`);
  lines.push(
    `  ${plural(s.prompts, 'prompt')} · ${plural(s.assistantMessages, 'reply', 'replies')} · ${plural(s.toolCalls, 'tool call')}${s.toolErrors ? ` (${plural(s.toolErrors, 'error')})` : ''}` +
      `${s.subagents ? ` · ${plural(s.subagents, 'subagent')}` : ''}${s.compactions ? ` · ${plural(s.compactions, 'compaction')}` : ''}${s.thinking ? ` · ${plural(s.thinking, 'thinking block')}` : ''}`,
  );
  lines.push(
    `  Tokens: ${fmtTokens(s.usage.input)} in · ${fmtTokens(s.usage.output)} out · ${fmtTokens(s.usage.cacheRead)} cache read · ${fmtTokens(s.usage.cacheWrite)} cache write` +
      `${r.cost?.totalCostUSD != null ? ` · $${r.cost.totalCostUSD.toFixed(2)}` : ''}`,
  );
  if (s.thinkingRedacted && keepThinking(r.detail, r.thinking)) {
    if (r.session.source === 'codex') {
      lines.push(`  Note: ${s.thinkingRedacted} of ${s.thinking} reasoning blocks have no summary (Codex kept them encrypted).`);
      lines.push('        Set model_reasoning_summary = "detailed" in ~/.codex/config.toml to get summaries in new sessions.');
    } else {
      lines.push(`  Note: ${s.thinkingRedacted} of ${s.thinking} thinking blocks have no stored text (Claude Code kept them encrypted).`);
      lines.push('        Set "showThinkingSummaries": true in ~/.claude/settings.json so new sessions keep thinking text.');
    }
  }
  return lines.join('\n');
}
