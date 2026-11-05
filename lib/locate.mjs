// Finding Claude Code session transcripts on disk.
//
// Claude Code keeps one JSONL file per session at
//   <config>/projects/<cwd with non-alphanumerics replaced by "-">/<session-id>.jsonl
// with subagent transcripts beside it in <session-id>/subagents/agent-<id>.jsonl
// and oversized tool outputs in <session-id>/tool-results/.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandHome } from './util.mjs';

export function claudeHome() {
  const env = process.env.CLAUDE_CONFIG_DIR;
  return env ? path.resolve(expandHome(env, os.homedir())) : path.join(os.homedir(), '.claude');
}

export function projectsRoot() {
  return path.join(claudeHome(), 'projects');
}

export function projectDirName(cwd) {
  return path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, '-');
}

function readdir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function listProjectDirs() {
  return readdir(projectsRoot())
    .filter((d) => d.isDirectory())
    .map((d) => path.join(projectsRoot(), d.name));
}

/** Top-level session files in one project folder. */
export function sessionFilesIn(dir) {
  const out = [];
  for (const d of readdir(dir)) {
    if (!d.isFile() || !d.name.endsWith('.jsonl')) continue;
    const file = path.join(dir, d.name);
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    out.push({ id: d.name.slice(0, -6), file, projectDir: dir, mtimeMs: st.mtimeMs, size: st.size });
  }
  return out;
}

/** Read up to `bytes` from the start (or end) of a file and parse whole JSON lines. */
function readRecords(file, bytes, fromEnd = false) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(bytes, size);
    const pos = fromEnd ? size - len : 0;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, pos);
    let lines = buf.toString('utf8').split('\n');
    if (fromEnd && pos > 0) lines = lines.slice(1); // first line is partial
    if (!fromEnd && len < size) lines = lines.slice(0, -1); // last line is partial
    const recs = [];
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        recs.push(JSON.parse(l));
      } catch {
        /* partial or corrupt line */
      }
    }
    return recs;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function promptText(rec) {
  const c = rec?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return '';
}

/** Cheap summary of a session (head + tail of the file only). */
export function summarizeSessionFile(info) {
  const head = readRecords(info.file, 256 * 1024);
  const tail = info.size > 256 * 1024 ? readRecords(info.file, 1024 * 1024, true) : head;
  let cwd = null;
  let firstPrompt = null;
  let started = null;
  for (const r of head) {
    cwd ??= r.cwd ?? null;
    started ??= r.timestamp ?? null;
    if (!firstPrompt && r.type === 'user' && !r.isMeta && !r.isCompactSummary) {
      let t = promptText(r).trim();
      const cmd = t.match(/<command-name>([^<]*)<\/command-name>[\s\S]*?(?:<command-args>([\s\S]*?)<\/command-args>)?/);
      if (cmd) t = `${cmd[1]} ${cmd[2] ?? ''}`.trim();
      t = t.replace(/<\/?pasted_content[^>]*>/g, ' ').trim();
      if (t && !t.startsWith('<local-command') && !t.startsWith('[Request interrupted')) firstPrompt = t;
    }
  }
  let customTitle = null;
  let aiTitle = null;
  let summary = null;
  let lastPrompt = null;
  for (const r of [...head, ...tail]) {
    if (r.type === 'custom-title' && r.customTitle) customTitle = r.customTitle;
    if (r.type === 'ai-title' && r.aiTitle) aiTitle = r.aiTitle;
    if (r.type === 'summary' && r.summary) summary = r.summary;
    if (r.type === 'last-prompt' && r.lastPrompt) lastPrompt = r.lastPrompt;
  }
  return {
    ...info,
    cwd,
    started,
    modified: new Date(info.mtimeMs).toISOString(),
    title: customTitle || aiTitle || summary || (firstPrompt ? firstPrompt.replace(/\s+/g, ' ').slice(0, 80) : null),
    firstPrompt,
    lastPrompt,
  };
}

/** Project folder for a working directory, or null. */
/** The same folder as Claude Code may have recorded it: as given, symlinks resolved, or as $PWD spells it. */
export function cwdSpellings(cwd) {
  const out = new Set([path.resolve(cwd)]);
  try {
    const real = fs.realpathSync(cwd);
    out.add(real);
    if (real.startsWith('/private/')) out.add(real.slice('/private'.length));
    const pwd = process.env.PWD;
    if (pwd && fs.realpathSync(pwd) === real) out.add(path.resolve(pwd));
  } catch {
    /* folder may no longer exist */
  }
  return [...out];
}

export function findProjectDir(cwd) {
  if (!cwd) return null;
  const spellings = cwdSpellings(cwd);
  for (const c of spellings) {
    const direct = path.join(projectsRoot(), projectDirName(c));
    if (fs.existsSync(direct)) return direct;
  }
  // Very long paths are shortened by Claude Code; match on the recorded cwd instead.
  for (const c of spellings) {
    const prefix = projectDirName(c).slice(0, 80);
    for (const dir of listProjectDirs()) {
      if (!path.basename(dir).startsWith(prefix)) continue;
      const newest = sessionFilesIn(dir).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
      if (newest && readRecords(newest.file, 64 * 1024).some((r) => spellings.includes(r.cwd))) return dir;
    }
  }
  return null;
}

export function allSessionFiles() {
  return listProjectDirs().flatMap(sessionFilesIn);
}

/**
 * List sessions, newest first.
 * @param {{cwd?: string, all?: boolean, limit?: number, query?: string}} o
 */
export function listSessions({ cwd, all = false, limit = 20, query } = {}) {
  let files;
  if (!all && cwd) {
    const dir = findProjectDir(cwd);
    files = dir ? sessionFilesIn(dir) : [];
  } else {
    files = allSessionFiles();
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const q = query?.toLowerCase().trim();
  const out = [];
  for (const f of files) {
    if (f.size === 0) continue;
    const s = summarizeSessionFile(f);
    if (q) {
      const hay = `${s.id} ${s.title ?? ''} ${s.firstPrompt ?? ''} ${s.lastPrompt ?? ''} ${s.cwd ?? ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(s);
    if (limit && out.length >= limit) break;
  }
  return out;
}

// An id prefix: hex with at least one digit or dash, so words like "cafe" search titles instead.
const UUIDISH = /^(?=.*[0-9-])[0-9a-f-]{4,36}$/i;

/**
 * Resolve a session spec to a transcript file.
 *   undefined | "current"  → $CLAUDE_CODE_SESSION_ID, else the newest session for cwd
 *   "latest"               → newest session for cwd (or anywhere, if cwd has none)
 *   "previous"             → second newest session for cwd
 *   <path>.jsonl           → that file
 *   <id or id prefix>      → matching session in any project
 *   <text>                 → the one session whose title / first prompt contains it
 */
export function resolveSession(spec, { cwd = process.cwd() } = {}) {
  const s = spec == null ? 'current' : String(spec).trim();

  const asPath = path.resolve(cwd, expandHome(s, os.homedir()));
  const hasSep = s.includes('/') || s.includes('\\');
  if (/\.jsonl$/i.test(s) || (hasSep && fs.existsSync(asPath))) {
    const file = asPath;
    if (!fs.existsSync(file)) throw new Error(`No transcript at ${file}`);
    const st = fs.statSync(file);
    if (!st.isFile()) throw new Error(`${file} is a folder, not a .jsonl transcript`);
    return { id: path.basename(file, '.jsonl'), file, projectDir: path.dirname(file), mtimeMs: st.mtimeMs, size: st.size };
  }

  const newest = (n = 0) => {
    const dir = findProjectDir(cwd);
    let files = dir ? sessionFilesIn(dir) : [];
    if (!files.length) files = allSessionFiles();
    files = files.filter((f) => f.size > 0).sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (!files[n]) throw new Error(n ? 'There is no previous session to export.' : 'No Claude Code sessions found.');
    return files[n];
  };

  if (s === '' || s === 'current') {
    const envId = process.env.CLAUDE_CODE_SESSION_ID;
    if (envId) {
      const hit = allSessionFiles().find((f) => f.id === envId);
      if (hit) return hit;
      return { ...newest(0), note: `Session ${envId} wasn't found on disk; exported the newest session for this folder instead.` };
    }
    return newest(0);
  }
  if (s === 'latest' || s === 'last') return newest(0);
  if (s === 'previous' || s === 'prev') return newest(1);

  if (UUIDISH.test(s)) {
    const hits = allSessionFiles().filter((f) => f.id === s || f.id.startsWith(s.toLowerCase()));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      const exact = hits.find((f) => f.id === s);
      if (exact) return exact;
      throw new Error(`"${s}" matches ${hits.length} sessions; give more of the id:\n` + hits.slice(0, 10).map((h) => `  ${h.id}`).join('\n'));
    }
  }

  const matches = listSessions({ all: true, limit: 0, query: s });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `"${s}" matches ${matches.length} sessions; pass one of these ids:\n` +
        matches.slice(0, 10).map((m) => `  ${m.id}  ${m.title ?? ''}`).join('\n'),
    );
  }
  throw new Error(`No session matches "${s}". List recent sessions (--list, or the list_sessions tool) to find its id.`);
}

/** Folder holding a session's subagent transcripts. */
export function subagentDirFor(file) {
  const dir = path.dirname(file);
  if (path.basename(dir) === 'subagents') return dir; // already a subagent file
  return path.join(dir, path.basename(file, '.jsonl'), 'subagents');
}
