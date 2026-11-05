// Presentation helpers shared by the HTML and Markdown renderers.

import { oneLine, toolLabel, isPlainObject } from './util.mjs';

export const DETAILS = ['conversation', 'standard', 'full'];
export const DEFAULT_DETAIL = 'conversation';

/** One-line summary of what a tool call did. */
export function toolDigest(name, input = {}) {
  const i = isPlainObject(input) ? input : {};
  const first = (...keys) => keys.map((k) => i[k]).find((v) => typeof v === 'string' && v.trim());
  switch (name) {
    case 'Bash':
      return oneLine(i.command, 160);
    case 'Read':
      return `${i.file_path ?? ''}${i.offset || i.limit ? ` (lines ${i.offset ?? 1}${i.limit ? `–${(i.offset ?? 1) + i.limit - 1}` : '+'})` : ''}${i.pages ? ` (pages ${i.pages})` : ''}`;
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return i.file_path ?? i.notebook_path ?? '';
    case 'Glob':
      return `${i.pattern ?? ''}${i.path ? `  in ${i.path}` : ''}`;
    case 'Grep':
      return `${i.pattern ?? ''}${i.path ? `  in ${i.path}` : ''}${i.glob ? `  (${i.glob})` : ''}`;
    case 'WebFetch':
      return i.url ?? '';
    case 'WebSearch':
      return i.query ?? '';
    case 'Agent':
    case 'Task':
      return `${i.subagent_type ?? 'agent'} — ${i.description ?? ''}`;
    case 'Skill':
      return `${i.skill ?? ''}${i.args ? ` ${i.args}` : ''}`;
    case 'TodoWrite':
      return `${(i.todos ?? []).length} items`;
    case 'ToolSearch':
      return i.query ?? '';
    case 'AskUserQuestion':
      return oneLine((i.questions ?? []).map((q) => q.question).join(' / '), 160);
    case 'ExitPlanMode':
      return 'plan ready for approval';
    default: {
      if (name === 'mcp__ccd_turn__update_plan' && Array.isArray(i.items)) return `${i.items.length} steps`;
      if (name === 'mcp__ccd_turn__wrap_up') return oneLine(i.recap, 160);
      const v = first('command', 'query', 'url', 'file_path', 'path', 'name', 'title', 'description', 'prompt', 'text', 'action', 'intent');
      if (v) return oneLine(v, 160);
      const keys = Object.keys(i);
      return keys.length ? oneLine(keys.map((k) => `${k}=${typeof i[k] === 'string' ? i[k] : JSON.stringify(i[k])}`).join(' '), 160) : '';
    }
  }
}

export { toolLabel };

/** Text the model saw as the tool's result. */
export function resultText(res) {
  if (!res) return '';
  return res.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

export function toolStatus(tb) {
  if (!tb.result) return { key: 'pending', label: 'no result' };
  if (tb.result.denial || tb.result.permission?.decision === 'reject' || tb.result.permission?.decision === 'deny') return { key: 'denied', label: 'denied' };
  if (tb.result.isError) return { key: 'error', label: 'error' };
  return { key: 'ok', label: 'ok' };
}

export function userLabel(ev) {
  if (ev.queued) return 'You · sent while the agent was working';
  if (ev.cls?.type === 'interrupted') return 'Interrupted';
  switch (ev.origin) {
    case 'task-notification':
      return 'Task notification';
    case 'peer':
      return ev.originName ? `Report from ${ev.originName}` : 'Agent report';
    case 'tool':
      return 'Tool context';
    case 'human':
    default:
      if (ev.cls?.type === 'command') return 'You · command';
      if (ev.cls?.type === 'shell') return 'You · shell';
      if (ev.cls?.type === 'shell-output') return 'Shell output';
      if (ev.cls?.type === 'command-output') return 'Command output';
      if (ev.cls?.type === 'interrupted') return 'Interrupted';
      if (ev.cls?.type === 'notification') return 'Task notification';
      return 'You';
  }
}

/** Is this user event a real prompt from the person (used for the table of contents)? */
export function isPrompt(ev) {
  return ev.kind === 'user' && (ev.origin === 'human' || ev.queued) && ['text', 'command', 'shell'].includes(ev.cls?.type) && (ev.text.trim() || ev.parts.length);
}

/** Whether thinking blocks are shown: on for full/standard, off for conversation, unless set. */
export function keepThinking(detail, thinking) {
  return thinking ?? detail !== 'conversation';
}

/**
 * Drop what a detail level leaves out. Returns a new events array (deep for subagents).
 * @param {object[]} events
 * @param {'full'|'standard'|'conversation'} detail
 * @param {{thinking?: boolean}} [o]  force thinking blocks on or off
 */
export function filterEvents(events, detail, { thinking } = {}) {
  const withThinking = keepThinking(detail, thinking);
  if (detail === 'full' && withThinking) return events;
  const out = [];
  for (const ev of events) {
    if (detail !== 'full' && ev.kind === 'context-group') continue;
    if (detail !== 'full' && ev.kind === 'system' && ev.quiet) continue;
    if (detail === 'conversation') {
      // Only what was said: your prompts and the agent's replies.
      if (ev.kind === 'user') {
        if (ev.origin !== 'human' && !ev.queued) continue;
        if (!['text', 'command', 'shell'].includes(ev.cls?.type ?? 'text')) continue; // command / shell output, interrupts
        out.push(ev);
      } else if (ev.kind === 'assistant') {
        const blocks = ev.blocks.filter((b) => b.type === 'text' || b.type === 'media' || (withThinking && b.type === 'thinking'));
        if (blocks.length) out.push({ ...ev, blocks });
      }
      continue; // system notes, command output, compactions, context
    }
    if (ev.kind === 'assistant') {
      const blocks = ev.blocks
        .filter((b) => withThinking || b.type !== 'thinking')
        .map((b) => (b.type === 'tool' && b.subagent ? { ...b, subagent: { ...b.subagent, events: filterEvents(b.subagent.events, detail, { thinking }) } } : b));
      if (!blocks.length) continue;
      out.push({ ...ev, blocks });
      continue;
    }
    out.push(ev);
  }
  return out;
}

export function harnessNames(meta) {
  return meta?.source === 'codex' ? { product: 'Codex', agent: 'Codex' } : { product: 'Claude Code', agent: 'Claude' };
}

export function modelShort(m) {
  return String(m ?? '').replace(/^claude-/, '');
}

export function pluralWord(n, word, many = `${word}s`) {
  return n === 1 ? word : many;
}

export function plural(n, word, many = `${word}s`) {
  return `${n} ${pluralWord(n, word, many)}`;
}

/** Drop blank lines at the start and whitespace at the end, keep inner layout. */
export function tidy(text) {
  return String(text ?? '')
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/\s+$/, '');
}

// The desktop app wraps pasted text as <pasted_content id="N">…</pasted_content id="N">.
const PASTE_RE = /<pasted_content(?:\s+id="([^"]*)")?\s*>([\s\S]*?)<\/pasted_content(?:\s+id="[^"]*")?\s*>/g;

/** Split a prompt into typed and pasted segments. */
export function splitPasted(text) {
  const s = String(text ?? '');
  const out = [];
  let last = 0;
  for (const m of s.matchAll(PASTE_RE)) {
    if (m.index > last) out.push({ type: 'text', text: s.slice(last, m.index) });
    out.push({ type: 'pasted', id: m[1] ?? null, text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
  return out.map((x) => ({ ...x, text: tidy(x.text) })).filter((x) => x.text.trim());
}

export function stripPasteTags(text) {
  return String(text ?? '').replace(PASTE_RE, (_, _id, body) => body);
}

export function patchText(structuredPatch) {
  return structuredPatch
    .map((h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n${(h.lines ?? []).join('\n')}`)
    .join('\n');
}

export function naiveDiff(oldS, newS) {
  const o = String(oldS ?? '').split('\n').map((l) => `-${l}`);
  const n = String(newS ?? '').split('\n').map((l) => `+${l}`);
  return [...o, ...n].join('\n');
}

export function thinkingNote(st, source = 'claude-code') {
  const stored = st.thinking - st.thinkingRedacted;
  if (!st.thinkingRedacted) return `${plural(st.thinking, 'block')}, all with text`;
  if (source === 'codex')
    return `${plural(st.thinking, 'block')}, ${stored} with a summary — Codex kept the other ${st.thinkingRedacted} encrypted only. Set model_reasoning_summary = "detailed" in ~/.codex/config.toml to get summaries in new sessions.`;
  return `${plural(st.thinking, 'block')}, ${stored} with text — Claude Code stored the other ${st.thinkingRedacted} encrypted only. Set "showThinkingSummaries": true in ~/.claude/settings.json to keep thinking text in new sessions.`;
}

export function promptLine(ev) {
  const c = ev.cls ?? {};
  if (c.type === 'command') return `${c.name} ${c.args ?? ''}`.trim();
  if (c.type === 'shell') return `! ${c.command}`;
  return stripPasteTags(ev.text);
}
