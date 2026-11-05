// Markdown export. Collapsible parts use <details>, which GitHub, Obsidian,
// VS Code and most viewers render.

import { VERSION, esc, fence, fmtTime, fmtDuration, fmtTokens, fmtNum, fmtBytes, sameDay, langFor, oneLine, mdSafe, inlineCode, isBase64 } from './util.mjs';
import { toolDigest, toolLabel, toolStatus, userLabel, filterEvents, modelShort, isPrompt, plural, splitPasted, patchText, naiveDiff, promptLine, thinkingNote, harnessNames } from './describe.mjs';
import { attachmentLabel } from './parse.mjs';

const STATUS_ICON = { ok: '✓', error: '✗', denied: '⛔', pending: '…' };

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const quote = (s) =>
  mdSafe(s)
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n');

/**
 * @param {object} model   from loadSession()
 * @param {{detail?: string, thinking?: boolean, assets?: {save(part): string|null}, maxOutput?: number}} o
 */
export function renderMarkdown(model, { detail = 'conversation', thinking, assets = null, maxOutput = 0 } = {}) {
  const view = { thinking };
  const out = [];
  const w = (...l) => out.push(...l);
  const m = model.meta;
  const st = model.stats;
  const full = detail === 'full';
  const hn = harnessNames(m);
  let promptNo = 0;

  const clip = (s) => {
    s = String(s ?? '');
    return maxOutput && s.length > maxOutput ? s.slice(0, maxOutput) + `\n… [${fmtNum(s.length - maxOutput)} more characters cut by --max-output]` : s;
  };

  const media = (p, i) => {
    if (p.type !== 'image' && p.type !== 'document') return parts([p]);
    const rel = p.data && isBase64(p.data) ? assets?.save(p) : null;
    const what = p.type === 'image' ? 'image' : 'document';
    if (rel) return p.type === 'image' ? `![${what} ${i + 1}](${encodeURI(rel)})` : `[📄 ${p.title ?? what} (${p.mediaType})](${encodeURI(rel)})`;
    return `_[${what}: ${p.mediaType}${p.data ? `, ${fmtBytes(Math.round((p.data.length * 3) / 4))}` : ''}${p.url ? `, ${p.url}` : ''}]_`;
  };

  const parts = (ps, { asQuote = false } = {}) => {
    const lines = [];
    const text = ps.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    if (text.trim()) lines.push(asQuote ? quote(text) : fence(clip(text)));
    const refs = ps.filter((p) => p.type === 'tool_reference').map((p) => `\`${p.name}\``);
    if (refs.length) lines.push(`Loaded tools: ${refs.join(', ')}`);
    ps.filter((p) => p.type === 'image' || p.type === 'document').forEach((p, i) => lines.push(media(p, i)));
    ps.filter((p) => p.type === 'json').forEach((p) => lines.push(fence(clip(JSON.stringify(p.value, null, 2)), 'json')));
    return lines.join('\n\n');
  };

  // ── header ──────────────────────────────────────────────────────────
  w(`# ${m.title}`, '');
  w(`_${hn.product} session export · ${detail} detail · generated ${fmtTime(new Date().toISOString())} by unabridged ${VERSION}_`, '');
  const rows = [
    ['Session', `\`${m.sessionId ?? '?'}\``],
    ['Project', m.cwd ? `\`${m.cwd}\`` : ''],
    ['Git branch', m.gitBranches.filter((b) => b !== 'HEAD').join(', ') || (m.gitBranches.length ? 'detached / none' : '')],
    ['Started', fmtTime(m.start)],
    ['Last activity', fmtTime(m.end)],
    ['Span', fmtDuration(st.durationMs)],
    ['Models', m.models.map(modelShort).join(', ')],
    [hn.product, [m.versions.join(', '), m.entrypoints.join(', ')].filter(Boolean).join(' · ')],
    ['Permission modes', m.permissionModes.join(', ')],
    [
      'Activity',
      [
        plural(st.prompts, 'prompt'),
        plural(st.assistantMessages, 'assistant message'),
        `${plural(st.toolCalls, 'tool call')}${st.toolErrors ? ` (${plural(st.toolErrors, 'error')})` : ''}`,
        st.subagents ? plural(st.subagents, 'subagent') : '',
        st.compactions ? plural(st.compactions, 'compaction') : '',
        st.apiErrors ? plural(st.apiErrors, 'API error') : '',
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    [
      'Tokens (main thread)',
      `${fmtTokens(st.usage.input)} input · ${fmtTokens(st.usage.output)} output · ${fmtTokens(st.usage.cacheRead)} cache read · ${fmtTokens(st.usage.cacheWrite)} cache write`,
    ],
    model.totals?.subagentCount
      ? ['Tokens (with subagents)', `${fmtTokens(model.totals.usage.input)} input · ${fmtTokens(model.totals.usage.output)} output · ${fmtTokens(model.totals.usage.cacheRead)} cache read`]
      : null,
    m.cost?.totalCostUSD != null ? [`Cost (${hn.product} tally)`, `$${m.cost.totalCostUSD.toFixed(2)}${m.cost.linesAdded != null ? ` · +${m.cost.linesAdded} / −${m.cost.linesRemoved} lines` : ''}`] : null,
    st.thinking ? ['Thinking', thinkingNote(st, m.source)] : null,
    ['Transcript', `\`${m.file}\``],
  ]
    .filter((r) => r && r[1])
    .filter((r) => detail !== 'conversation' || ['Session', 'Project', 'Git branch', 'Started', 'Last activity', 'Models'].includes(r[0]));
  w('| | |', '|---|---|', ...rows.map(([k, v]) => `| **${k}** | ${cell(v)} |`), '');

  if (detail !== 'conversation' && Object.keys(st.tools).length) {
    w('<details>', '<summary>Tool usage</summary>', '');
    w('| Tool | Calls | Errors | Time |', '|---|---:|---:|---:|');
    for (const [name, t] of Object.entries(st.tools).sort((a, b) => b[1].calls - a[1].calls)) w(`| ${cell(toolLabel(name))} | ${t.calls} | ${t.errors || ''} | ${fmtDuration(t.durationMs)} |`);
    w('', '</details>', '');
  }
  if (detail !== 'conversation' && Object.keys(st.usageByModel).length > 1) {
    w('<details>', '<summary>Tokens by model</summary>', '');
    w('| Model | Input | Output | Cache read | Cache write |', '|---|---:|---:|---:|---:|');
    for (const [k, u] of Object.entries(st.usageByModel)) w(`| ${cell(k)} | ${fmtNum(u.input)} | ${fmtNum(u.output)} | ${fmtNum(u.cacheRead)} | ${fmtNum(u.cacheWrite)} |`);
    w('', '</details>', '');
  }
  if (full && model.systemPrompt?.length) {
    w('<details>', `<summary>System prompt (${model.systemPrompt.length} sections, first snapshot)</summary>`, '');
    model.systemPrompt.forEach((s) => w(fence(s.trim(), 'text'), ''));
    w('</details>', '');
  }

  const events = filterEvents(model.events, detail, view);
  const prompts = events.filter(isPrompt);
  if (prompts.length > 1 && detail !== 'conversation') {
    w('## Prompts', '');
    prompts.forEach((p, i) => w(`${i + 1}. [${cell(oneLine(promptLine(p), 90)) || '(attachment)'}](#p-${i + 1}) <sub>${fmtTime(p.ts)}</sub>`));
    w('');
  }
  w('## Conversation', '');

  // ── events ──────────────────────────────────────────────────────────
  function renderEvents(evs, depth) {
    let inTurn = false;
    let lastTs = null;
    const h = '#'.repeat(Math.min(6, 3 + depth));
    const when = (ts) => {
      const s = fmtTime(ts, { date: !lastTs || !sameDay(lastTs, ts) });
      lastTs = ts ?? lastTs;
      return s;
    };
    for (const ev of evs) {
      switch (ev.kind) {
        case 'user': {
          inTurn = false;
          const label = userLabel(ev);
          if (depth === 0 && isPrompt(ev)) w(`<a id="p-${++promptNo}"></a>`, '');
          w(`${h} 👤 ${label} · ${when(ev.ts)}`, '');
          const c = ev.cls ?? { type: 'text' };
          if (c.type === 'command') w(inlineCode(`${c.name}${c.args ? ` ${c.args}` : ''}`), '');
          else if (c.type === 'shell') w(fence(`$ ${c.command}`, 'bash'), '');
          else if (c.type === 'shell-output') w(fence([c.stdout, c.stderr && `stderr:\n${c.stderr}`].filter(Boolean).join('\n') || '(no output)'), '');
          else if (c.type === 'command-output') w(fence(c.text), '');
          else if (c.type === 'interrupted') w('_⏹ Interrupted by user_', '');
          else if (c.type === 'notification' || ev.origin === 'task-notification') w('<details>', '<summary>Notification</summary>', '', fence(ev.text, 'xml'), '', '</details>', '');
          else if (ev.origin === 'peer') w('<details>', '<summary>Report</summary>', '', quote(ev.text), '', '</details>', '');
          else {
            for (const seg of splitPasted(ev.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n'))) {
              if (seg.type === 'pasted') w('<details>', `<summary>📋 Pasted text · ${plural(seg.text.split('\n').length, 'line')}</summary>`, '', quote(seg.text), '', '</details>', '');
              else w(quote(seg.text), '');
            }
            const extra = parts(ev.parts.filter((p) => p.type !== 'text'));
            if (extra) w(extra, '');
          }
          if (c.type !== 'text') {
            const extra = parts(ev.parts.filter((p) => p.type !== 'text'));
            if (extra) w(extra, '');
          }
          break;
        }
        case 'assistant': {
          if (!inTurn) {
            w(`${h} 🤖 ${hn.agent} · ${when(ev.ts)}${ev.model && !ev.synthetic ? ` · ${modelShort(ev.model)}` : ''}`, '');
            inTurn = true;
          }
          for (const b of ev.blocks) renderBlock(b, depth);
          if (detail === 'conversation' && ev.toolCount) w(`_… used ${ev.toolCount} tool${ev.toolCount === 1 ? '' : 's'} …_`, '');
          if (full && (ev.usage || ev.requestId)) {
            const u = ev.usage ?? {};
            const bits = [
              ev.id?.startsWith('msg_') ? ev.id : null,
              ev.usage ? `in ${fmtNum(u.input_tokens)} · out ${fmtNum(u.output_tokens)} · cache read ${fmtTokens(u.cache_read_input_tokens)} · cache write ${fmtTokens(u.cache_creation_input_tokens)}` : null,
              ev.stopReason ? `stop: ${ev.stopReason}` : null,
              ev.effort ? `effort: ${ev.effort}` : null,
              ev.turnDurationMs ? `turn ${fmtDuration(ev.turnDurationMs)}` : null,
            ].filter(Boolean);
            if (bits.length) w(`<sub>${esc(bits.join(' · '))}</sub>`, '');
          }
          break;
        }
        case 'tools-folded':
          w(`_… used ${ev.count} tool${ev.count === 1 ? '' : 's'} …_`, '');
          break;
        case 'context-group': {
          const labels = [...new Set(ev.items.map((x) => attachmentLabel(x.attType)))];
          w('<details>', `<summary>📎 ${ev.items.length} context injection${ev.items.length === 1 ? '' : 's'}: ${esc(labels.join(', '))}</summary>`, '');
          for (const x of ev.items) w(`**${attachmentLabel(x.attType)}** <sub>${fmtTime(x.ts)}</sub>`, '', fence(clip(x.text || '(empty)'), 'text'), '');
          w('</details>', '');
          break;
        }
        case 'compact':
          inTurn = false;
          w('---', '', `**🗜 Conversation compacted**${ev.trigger ? ` (${ev.trigger})` : ''}${ev.preTokens ? ` · ${fmtTokens(ev.preTokens)} → ${fmtTokens(ev.postTokens)} tokens` : ''} · ${when(ev.ts)}`, '', '---', '');
          break;
        case 'compact-summary':
          w('<details>', '<summary>📝 Summary carried forward after compaction</summary>', '', quote(ev.text), '', '</details>', '');
          break;
        case 'command-output':
          w(`_Command output${ev.command?.command ? ` (/${ev.command.command})` : ''}:_`, '', fence(ev.text || '(no output)'), '');
          break;
        case 'system':
          renderSystem(ev);
          break;
        default:
          break;
      }
    }
  }

  function renderSystem(ev) {
    if (ev.subtype === 'api_error') w(`> ⚠️ **API error** — ${ev.text}${ev.retry ? ` (${ev.retry})` : ''}`, '');
    else if (ev.subtype === 'turn_duration') w(`_⏱ Turn took ${fmtDuration(ev.durationMs)}_`, '');
    else if (ev.subtype === 'stop_hook_summary') {
      const names = ev.hooks.map((x) => x.command ?? x.name).filter(Boolean);
      w(`> 🪝 **Stop hooks** ran (${ev.hookCount})${names.length ? `: ${names.map((n) => `\`${oneLine(n, 60)}\``).join(', ')}` : ''}${ev.preventedContinuation ? ' — prevented continuation' : ''}`);
      for (const e of ev.hookErrors) w(`> ✗ ${oneLine(typeof e === 'string' ? e : JSON.stringify(e), 300)}`);
      w('');
    } else w(`> ℹ️ **${ev.subtype}**${ev.text ? ` — ${oneLine(ev.text, 600)}` : ''}`, '');
  }

  function renderBlock(b, depth) {
    if (b.type === 'text') w(mdSafe(b.text.trim()), '');
    else if (b.type === 'thinking') {
      const dur = b.durationMs ? ` (${fmtDuration(b.durationMs)})` : '';
      if (b.redacted) w(`_💭 Thinking${dur} — content not stored in the transcript_`, '');
      else w('<details>', `<summary>💭 Thinking${dur}</summary>`, '', quote(b.text.trim()), '', '</details>', '');
    } else if (b.type === 'tool') renderTool(b, depth);
    else if (b.type === 'media') w(media(b.part, 0), '');
    else if (b.type === 'unknown') w(fence(JSON.stringify(b.raw, null, 2), 'json'), '');
  }

  function renderTool(b, depth) {
    const s = toolStatus(b);
    const digest = toolDigest(b.name, b.input);
    const i = b.input ?? {};
    w('<details>', `<summary>🔧 <b>${esc(toolLabel(b.name))}</b>${digest ? ` <code>${esc(oneLine(digest, 120))}</code>` : ''} — ${STATUS_ICON[s.key]} ${s.key === 'ok' ? '' : s.label + ' '}${fmtDuration(b.durationMs)}</summary>`, '');
    const sd = b.result?.structured;

    switch (b.name) {
      case 'Bash':
        w(fence(i.command ?? '', 'bash'), '');
        if (i.description) w(`_${i.description}_`, '');
        if (i.run_in_background || i.timeout || i.dangerouslyDisableSandbox)
          w(`<sub>${[i.run_in_background && 'background', i.timeout && `timeout ${i.timeout} ms`, i.dangerouslyDisableSandbox && 'sandbox disabled'].filter(Boolean).join(' · ')}</sub>`, '');
        break;
      case 'Edit':
        w(`**File** \`${i.file_path}\`${i.replace_all ? ' · replace all' : ''}`, '', fence(sd?.structuredPatch?.length ? patchText(sd.structuredPatch) : naiveDiff(i.old_string, i.new_string), 'diff'), '');
        break;
      case 'MultiEdit':
        w(`**File** \`${i.file_path}\``, '');
        if (sd?.structuredPatch?.length) w(fence(patchText(sd.structuredPatch), 'diff'), '');
        else (i.edits ?? []).forEach((e) => w(fence(naiveDiff(e.old_string, e.new_string), 'diff'), ''));
        break;
      case 'Write':
        w(`**File** \`${i.file_path}\`${sd?.type ? ` · ${sd.type}` : ''}`, '', fence(clip(i.content ?? ''), langFor(i.file_path)), '');
        break;
      case 'Agent':
      case 'Task':
        w(`**${i.subagent_type ?? 'Agent'}** — ${i.description ?? ''}${i.model ? ` · model ${i.model}` : ''}${i.run_in_background ? ' · background' : ''}`, '', '**Prompt**', '', quote(i.prompt ?? ''), '');
        break;
      case 'TodoWrite':
        (i.todos ?? []).forEach((t) => w(`- [${t.status === 'completed' ? 'x' : ' '}] ${t.status === 'in_progress' ? '▶ ' : ''}${t.content}`));
        w('');
        break;
      case 'ExitPlanMode':
        w(quote(i.plan ?? ''), '');
        break;
      case 'AskUserQuestion':
        for (const q of i.questions ?? []) {
          w(`**${q.header ? `${q.header}: ` : ''}${q.question}**`);
          (q.options ?? []).forEach((o) => w(`- ${o.label}${o.description ? ` — ${o.description}` : ''}`));
          w('');
        }
        if (sd?.answers) w('**Answers**', '', fence(JSON.stringify(sd.answers, null, 2), 'json'), '');
        break;
      default:
        if (b.name === 'mcp__ccd_turn__update_plan' && Array.isArray(i.items)) {
          i.items.forEach((t) => w(`- [${t.status === 'completed' ? 'x' : ' '}] ${t.status === 'in_progress' ? '▶ ' : ''}${t.content}`));
          w('');
        } else if (Object.keys(i).length) w(fence(clip(JSON.stringify(i, null, 2)), 'json'), '');
    }

    if (b.subagent) {
      const sub = b.subagent;
      w('<details>', `<summary>🧵 Subagent transcript — ${esc(sub.meta.title ?? b.agentId)} · ${sub.stats.toolCalls} tool calls · ${fmtTokens(sub.stats.usage.output)} output tokens</summary>`, '');
      renderEvents(filterEvents(sub.events, detail, view), depth + 1);
      w('</details>', '');
    } else if (b.agentId) {
      w(`<sub>Subagent ${b.agentId} (transcript not included)</sub>`, '');
    }

    if (b.result) {
      const r = b.result;
      const isAgentReport = (b.name === 'Agent' || b.name === 'Task') && !r.isError;
      w(r.isError ? '**Error**' : '**Result**', '');
      const body = isAgentReport ? parts(r.parts, { asQuote: true }) : parts(r.parts);
      w(body || '_(empty)_', '');
      if (r.fullOutput != null) w('<details>', `<summary>Full output (${fmtBytes(Buffer.byteLength(r.fullOutput))})</summary>`, '', fence(clip(r.fullOutput)), '', '</details>', '');
      else if (r.fullOutputNote) w(`<sub>${esc(r.fullOutputNote)} ${esc(r.persistedPath ?? '')}</sub>`, '');
      if (sd?.interrupted) w('_Interrupted_', '');
      if (sd?.returnCodeInterpretation) w(`<sub>${esc(sd.returnCodeInterpretation)}</sub>`, '');
      if (sd?.backgroundTaskId) w(`<sub>Background task ${esc(sd.backgroundTaskId)}</sub>`, '');
      if (full && r.permission?.decision) w(`<sub>Permission: ${esc([r.permission.decision, r.permission.source, r.permission.reasonType, r.permission.ruleSource].filter(Boolean).join(' · '))}</sub>`, '');
    } else {
      w('_No result recorded._', '');
    }
    if (b.hooks?.length) {
      w('**Hooks**', '');
      for (const hk of b.hooks) w(`- ${hk.name ?? hk.type}`, '', fence(clip(hk.text), 'text'), '');
    }
    w('</details>', '');
  }

  renderEvents(events, 0);

  if (model.otherAgents?.length && detail !== 'conversation') {
    w('## Other agent transcripts', '', '_Agent runs in this session that no tool call in the main thread points to (for example compaction or background helpers)._', '');
    for (const a of model.otherAgents) {
      w('<details>', `<summary>🧵 ${esc(a.info?.agentType ?? 'agent')} · ${esc(a.info?.description ?? a.agentId)} · ${a.stats.toolCalls} tool calls</summary>`, '');
      renderEvents(filterEvents(a.events, detail, view), 1);
      w('</details>', '');
    }
  }

  w('', '---', '', `_Exported with unabridged ${VERSION}. Transcript: \`${m.file}\`_`, '');
  return out.join('\n');
}
