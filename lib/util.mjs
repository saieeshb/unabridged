// Small shared helpers: escaping, formatting, safe fences.

export const VERSION = '0.1.1';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A backtick fence longer than any backtick run inside `text`. */
export function fence(text, lang = '') {
  const s = String(text ?? '');
  let longest = 2;
  let run = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 96) {
      if (++run > longest) longest = run;
    } else run = 0;
  }
  const f = '`'.repeat(longest + 1);
  return `${f}${lang}\n${s.replace(/\n$/, '')}\n${f}`;
}

export function slug(s, max = 60) {
  return (
    String(s ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/g, '') || 'session'
  );
}

export function fmtDuration(ms) {
  if (ms == null || !isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  if (m < 60) return `${m}m ${String(rs).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function fmtNum(n) {
  if (n == null || !isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Local date-time, e.g. 2026-11-05 11:58:03 */
export function fmtTime(ts, { date = true } = {}) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return String(ts);
  const p = (n) => String(n).padStart(2, '0');
  const t = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return date ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${t}` : t;
}

export function sameDay(a, b) {
  if (!a || !b) return false;
  const x = new Date(a);
  const y = new Date(b);
  return x.toDateString() === y.toDateString();
}

export function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function oneLine(s, n = 140) {
  return truncate(String(s ?? '').replace(/\s+/g, ' ').trim(), n);
}

const EXT_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sh: 'bash',
  zsh: 'bash', bash: 'bash', json: 'json', jsonl: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml',
  md: 'markdown', html: 'html', htm: 'html', css: 'css', scss: 'scss', sql: 'sql', xml: 'xml',
  svg: 'xml', r: 'r', lua: 'lua', dart: 'dart', vue: 'vue', svelte: 'svelte', tex: 'latex',
};

export function langFor(file) {
  const m = String(file ?? '').match(/\.([a-z0-9]+)$/i);
  return (m && EXT_LANG[m[1].toLowerCase()]) || '';
}

/** Short display name for a tool: mcp__server__tool → server · tool */
export function toolLabel(name) {
  const n = String(name ?? 'tool');
  const m = n.match(/^mcp__(.+?)__(.+)$/);
  if (!m) return n;
  let server = m[1];
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(server)) server = server.slice(0, 8);
  return `${server} · ${m[2]}`;
}

/** Expand a leading ~ (either slash style) to the home directory. */
export function expandHome(p, home) {
  return String(p ?? '').replace(/^~(?=$|[\\/])/, home);
}

/**
 * Make free text safe to drop into Markdown: escape '<' that would start an HTML
 * tag (viewers would swallow it, and a stray </details> breaks the document),
 * leaving fenced code blocks and inline code untouched.
 */
export function mdSafe(text) {
  let fenceMark = null;
  return String(text ?? '')
    .split('\n')
    .map((line) => {
      const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (f) {
        if (!fenceMark) fenceMark = f[1];
        else if (line.trim().startsWith(fenceMark[0].repeat(fenceMark.length))) fenceMark = null;
        return line;
      }
      if (fenceMark) return line;
      return line
        .split(/(`+[^`]*`+)/)
        .map((seg, i) => (i % 2 ? seg : seg.replace(/<(?=[A-Za-z/!?])/g, '&lt;')))
        .join('');
    })
    .join('\n');
}

/** True for a base64 string (whitespace allowed), so it can sit safely in a data: URI. */
export function isBase64(s) {
  return typeof s === 'string' && /^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(s);
}

/** Inline code span that survives backticks inside the text. */
export function inlineCode(text) {
  const s = String(text ?? '');
  let longest = 0;
  let run = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 96) {
      if (++run > longest) longest = run;
    } else run = 0;
  }
  const t = '`'.repeat(longest + 1);
  const pad = s.startsWith('`') || s.endsWith('`') ? ' ' : '';
  return `${t}${pad}${s}${pad}${t}`;
}

/** Split an argument line like a shell would (double quotes and backslash escapes), without running one. */
export function splitArgs(line) {
  const out = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && (line[i + 1] === '"' || line[i + 1] === '\\')) cur += line[++i];
      else cur += ch;
    } else if (ch === '"' || ch === '\u2018' || ch === '\u201c') {
      quote = ch === '\u201c' ? '\u201d' : ch === '\u2018' ? '\u2019' : '"';
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else cur += ch;
  }
  if (has || cur) out.push(cur);
  return out;
}

export function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}
