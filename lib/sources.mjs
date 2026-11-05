// One view over every harness whose transcripts unabridged can read:
// Claude Code (~/.claude/projects) and Codex (~/.codex/sessions).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveSession as resolveClaude, listSessions as listClaude, findProjectDir, sessionFilesIn, allSessionFiles, cwdSpellings } from './locate.mjs';
import { codexIndex, codexSessions, summarizeCodex, loadCodexSession, isCodexFile } from './codex.mjs';
import { loadSession } from './parse.mjs';
import { expandHome } from './util.mjs';

export const SOURCES = ['auto', 'claude', 'codex', 'all'];
export const HARNESS = {
  claude: { product: 'Claude Code', agent: 'Claude' },
  codex: { product: 'Codex', agent: 'Codex' },
};

export function normalizeFrom(from) {
  const f = String(from ?? 'auto').toLowerCase().trim();
  if (['', 'auto'].includes(f)) return 'auto';
  if (['claude', 'claude-code', 'claudecode', 'cc'].includes(f)) return 'claude';
  if (['codex', 'openai', 'openai-codex'].includes(f)) return 'codex';
  if (['all', 'both', 'any'].includes(f)) return 'all';
  throw new Error(`Unknown source "${from}". Use claude, codex, all or auto.`);
}

/** The harness this process runs inside, judged by the variables each one sets for its tools. */
export function detectHarness(env = process.env) {
  if (env.CODEX_THREAD_ID && !env.CLAUDE_CODE_SESSION_ID) return 'codex';
  return 'claude';
}

function picked(from) {
  const f = normalizeFrom(from);
  if (f === 'auto') return [detectHarness()];
  if (f === 'all') return ['claude', 'codex'];
  return [f];
}

const sourceOf = (f) => (f.source === 'codex' ? 'codex' : 'claude');

function inFolder(threadCwd, cwd) {
  // cwd is null when the caller doesn't know the project: nothing is "local" then.
  if (!threadCwd || !cwd) return false;
  const want = new Set(cwdSpellings(cwd));
  return cwdSpellings(threadCwd).some((c) => want.has(c));
}

function claudeCandidates(cwd) {
  const dir = cwd ? findProjectDir(cwd) : null;
  return (dir ? sessionFilesIn(dir) : []).filter((f) => f.size > 0).map((f) => ({ ...f, source: 'claude' }));
}

function codexCandidates(cwd) {
  return codexSessions().filter((t) => inFolder(t.cwd, cwd));
}

function newest(sources, cwd, n = 0) {
  const local = sources.flatMap((s) => (s === 'codex' ? codexCandidates(cwd) : claudeCandidates(cwd)));
  let pool = local;
  if (!pool.length) pool = sources.flatMap((s) => (s === 'codex' ? codexSessions() : allSessionFiles().filter((f) => f.size > 0).map((f) => ({ ...f, source: 'claude' }))));
  pool.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!pool[n]) throw new Error(n ? 'There is no previous session to export.' : `No ${sources.map((s) => HARNESS[s].product).join(' or ')} sessions found.`);
  return pool[n];
}

/**
 * List sessions, newest first.
 * @param {{cwd?: string, all?: boolean, limit?: number, query?: string, from?: string}} o
 */
export function listAll({ cwd = process.cwd(), all = false, limit = 20, query, from } = {}) {
  const sources = picked(from);
  if (!cwd) all = true;
  const rows = [];
  if (sources.includes('claude')) rows.push(...listClaude({ cwd, all, limit: 0, query }).map((r) => ({ ...r, source: 'claude' })));
  if (sources.includes('codex')) {
    const q = query?.toLowerCase().trim();
    for (const t of codexSessions()) {
      if (!all && !inFolder(t.cwd, cwd)) continue;
      const s = summarizeCodex(t);
      if (q && !`${s.id} ${s.title ?? ''} ${s.firstPrompt ?? ''} ${s.cwd ?? ''}`.toLowerCase().includes(q)) continue;
      rows.push(s);
    }
  }
  rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return limit ? rows.slice(0, limit) : rows;
}

const UUIDISH = /^(?=.*[0-9-])[0-9a-f-]{4,36}$/i;

/** Resolve a session spec across harnesses. See resolveSession in locate.mjs for the spec forms. */
export function resolveAny(spec, { cwd = process.cwd(), from } = {}) {
  const f = normalizeFrom(from);
  const sources = picked(f);
  const s = spec == null ? 'current' : String(spec).trim();

  const asPath = path.resolve(cwd ?? process.cwd(), expandHome(s, os.homedir()));
  if (/\.jsonl(\.zst)?$/i.test(s) || ((s.includes('/') || s.includes('\\')) && fs.existsSync(asPath))) {
    if (isCodexFile(asPath)) {
      if (!fs.existsSync(asPath)) throw new Error(`No transcript at ${asPath}`);
      const st = fs.statSync(asPath);
      return { source: 'codex', id: path.basename(asPath).match(/([0-9a-f-]{36})\.jsonl/i)?.[1] ?? path.basename(asPath), file: asPath, mtimeMs: st.mtimeMs, size: st.size };
    }
    return { ...resolveClaude(s, { cwd: cwd ?? process.cwd() }), source: 'claude' };
  }

  if (s === '' || s === 'current') {
    if (sources.includes('codex') && process.env.CODEX_THREAD_ID) {
      const t = codexIndex().byId.get(process.env.CODEX_THREAD_ID) ?? codexIndex({ refresh: true }).byId.get(process.env.CODEX_THREAD_ID);
      if (t) return t;
    }
    if (sources.includes('claude') && process.env.CLAUDE_CODE_SESSION_ID) return { ...resolveClaude('current', { cwd: cwd ?? process.cwd() }), source: 'claude' };
    return newest(sources, cwd, 0);
  }
  if (s === 'latest' || s === 'last') return newest(sources, cwd, 0);
  if (s === 'previous' || s === 'prev') return newest(sources, cwd, 1);

  // Ids and titles are looked up in every harness unless one was asked for.
  const searchIn = f === 'auto' || f === 'all' ? ['claude', 'codex'] : sources;
  if (UUIDISH.test(s)) {
    const hits = [];
    if (searchIn.includes('claude')) hits.push(...allSessionFiles().filter((x) => x.id === s || x.id.startsWith(s.toLowerCase())).map((x) => ({ ...x, source: 'claude' })));
    if (searchIn.includes('codex')) {
      const codexHits = codexIndex().threads.filter((x) => x.id === s || x.id.startsWith(s.toLowerCase()));
      // Subagent threads share their parent's id prefix (ids are time-ordered); a prefix means the thread you started.
      const started = codexHits.filter((x) => !x.spawn || x.id === s);
      hits.push(...(started.length ? started : codexHits));
    }
    const exact = hits.find((h) => h.id === s);
    if (exact) return exact;
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw new Error(`"${s}" matches ${hits.length} sessions; give more of the id:\n` + hits.slice(0, 10).map((h) => `  ${h.id}  (${HARNESS[sourceOf(h)].product})`).join('\n'));
  }
  const matches = listAll({ cwd, all: true, limit: 0, query: s, from: searchIn.length === 2 ? 'all' : searchIn[0] });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`"${s}" matches ${matches.length} sessions; pass one of these ids:\n` + matches.slice(0, 10).map((m) => `  ${m.id}  ${m.title ?? ''}  (${HARNESS[sourceOf(m)].product})`).join('\n'));
  }
  throw new Error(`No session matches "${s}". List recent sessions (--list, or the list_sessions tool) to find its id.`);
}

/** Load any resolved session into the shared model. */
export function loadAny(info, opts = {}) {
  return sourceOf(info) === 'codex' ? loadCodexSession(info.file, opts) : loadSession(info.file, opts);
}

export function harnessOf(meta) {
  return HARNESS[meta?.source === 'codex' ? 'codex' : 'claude'];
}
