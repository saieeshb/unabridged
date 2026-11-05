// Optional redaction for exports you intend to share.
// Masks well-known key/token formats, private keys, "password=…" style
// assignments, email addresses, and the home-directory prefix.

import os from 'node:os';

const R = (kind) => `[REDACTED:${kind}]`;

const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, R('private-key')],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, R('anthropic-key')],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g, R('api-key')],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, R('github-token')],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/g, R('github-token')],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/g, R('gitlab-token')],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, R('aws-key')],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, R('slack-token')],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, R('google-key')],
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g, R('stripe-key')],
  [/\bsbp_[a-f0-9]{40}\b/g, R('supabase-token')],
  [/\bnpm_[A-Za-z0-9]{36}\b/g, R('npm-token')],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, R('jwt')],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]{20,}=*/g, (_, kind) => `${kind} ${R('token')}`],
  [
    /((?:api[_-]?key|secret[_-]?key|client[_-]?secret|auth[_-]?token|access[_-]?token|refresh[_-]?token|password|passwd|pwd)["']?\s*[:=]\s*["']?)([^\s"'`,;{}]{8,})/gi,
    (_, pre) => `${pre}${R('secret')}`,
  ],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, R('email')],
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every way a home folder shows up in transcripts: native, forward slashes, Git Bash /c/…, any case on Windows. */
function homePattern(home) {
  if (!home || home.length < 2) return null;
  const forms = new Set([home, home.replace(/\\/g, '/')]);
  const drive = home.match(/^([A-Za-z]):[\\/](.*)$/);
  if (drive) forms.add(`/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}`);
  const alt = [...forms].sort((a, b) => b.length - a.length).map((f) => escapeRe(f).replace(/\\\\|\//g, '[\\\\/]'));
  // Claude Code names project folders after the path with every non-alphanumeric turned into "-"
  // (/Users/alice/code → -Users-alice-code), which would otherwise leak the username.
  alt.push(escapeRe(home.replace(/[^a-zA-Z0-9]/g, '-')));
  return new RegExp(`(?:${alt.join('|')})(?![A-Za-z0-9_.])`, drive || process.platform === 'win32' || process.platform === 'darwin' ? 'gi' : 'g');
}

export function redactString(s, home = os.homedir()) {
  let out = String(s);
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  const hp = homePattern(home);
  if (hp) out = out.replace(hp, '~');
  return out;
}

// Long base64 runs (images, PDFs, thinking signatures) can't hold readable secrets; leave them intact.
const isBlob = (s) => s.length >= 200 && /^[A-Za-z0-9+/=_-]+$/.test(s);

/** Deep-copy `value`, redacting every string. */
export function redactDeep(value, home = os.homedir()) {
  if (typeof value === 'string') return isBlob(value) ? value : redactString(value, home);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, home));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v, home);
    return out;
  }
  return value;
}
