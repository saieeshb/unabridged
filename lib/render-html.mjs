// Self-contained HTML export: one file, no network requests, light/dark,
// searchable, with every tool call, output, thinking block and subagent
// transcript collapsible in place.

import { VERSION, isBase64, esc, fmtTime, fmtDuration, fmtTokens, fmtNum, fmtBytes, sameDay, oneLine } from './util.mjs';
import { toolDigest, toolLabel, toolStatus, userLabel, filterEvents, modelShort, isPrompt, plural, pluralWord, splitPasted, patchText, naiveDiff, promptLine, thinkingNote } from './describe.mjs';
import { attachmentLabel } from './parse.mjs';
import { mdToHtml } from './markdown.mjs';

const STATUS = { ok: '✓', error: '✗', denied: '⛔', pending: '…' };

const LIGHT = `
  --bg:#f7f6f2;--surface:#ffffff;--surface-2:#f0eee8;--text:#1f1d1a;--muted:#655f57;
  --border:#e3dfd6;--border-strong:#cfc8bb;--user:#2a59c7;--user-bg:#edf2fd;--user-line:#c9d7f6;
  --claude:#a3441d;--ok:#1f7a45;--err:#b42318;--warn:#8a5d00;--code-bg:#f3f1ec;
  --diff-add:#e3f3e8;--diff-del:#fbe9e7;--diff-hunk:#eaeef7;--mark:#ffe58a;color-scheme:light;`;
const DARK = `
  --bg:#131316;--surface:#1b1b1f;--surface-2:#232328;--text:#ebe9e4;--muted:#a39e95;
  --border:#2c2c32;--border-strong:#3b3b42;--user:#86a8ff;--user-bg:#1a2238;--user-line:#2c3a63;
  --claude:#e8916a;--ok:#5cc28a;--err:#ff7b72;--warn:#e3b341;--code-bg:#1f1f24;
  --diff-add:#15301f;--diff-del:#3b1b1b;--diff-hunk:#1d2333;--mark:#6b5300;color-scheme:dark;`;

const CSS = `
:root{${LIGHT}
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK}}}
:root[data-theme="dark"]{${DARK}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:72px}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 var(--sans);overflow-x:hidden}
a{color:var(--user);text-underline-offset:2px}
.hero{max-width:1240px;margin:0 auto;padding:44px 24px 22px}
.eyebrow{font:600 12px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--claude);margin:0 0 12px}
h1{font-size:clamp(24px,3.4vw,36px);line-height:1.15;margin:0 0 10px;letter-spacing:-.015em;text-wrap:balance;overflow-wrap:anywhere}
.sub{color:var(--muted);margin:0 0 20px;font:13px/1.5 var(--mono);overflow-wrap:anywhere}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}
.chip{background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:3px 12px;font-size:13px;color:var(--muted);white-space:nowrap}
.chip b{color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}
.chip.bad b{color:var(--err)}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px 28px;margin:0 0 20px}
.facts div{min-width:0}
dt{font-size:12px;color:var(--muted);margin:0}
dd{margin:0;font-size:14px;overflow-wrap:anywhere}
.more{display:grid;gap:8px}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:10px}
.panel>summary{padding:9px 14px;cursor:pointer;font-size:14px;font-weight:500}
.panel>.pbody{padding:0 14px 14px;overflow-x:auto}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);background:color-mix(in srgb,var(--bg) 90%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.bar-in{max-width:1240px;margin:0 auto;padding:10px 24px;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center}
.search{flex:1 1 240px;min-width:0;display:flex;align-items:center;gap:8px}
#q{flex:1;min-width:0;font:inherit;font-size:14px;color:var(--text);background:var(--surface);border:1px solid var(--border-strong);border-radius:8px;padding:7px 11px}
#q:focus{outline:2px solid var(--user);outline-offset:1px}
#count{font-size:12px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.group{display:flex;flex-wrap:wrap;gap:6px}
button{font:inherit;font-size:13px;color:var(--text);background:var(--surface);border:1px solid var(--border-strong);border-radius:8px;padding:5px 11px;cursor:pointer;line-height:1.3}
button:hover{border-color:var(--muted)}
button:focus-visible{outline:2px solid var(--user);outline-offset:1px}
.filters button[aria-pressed="true"]{background:var(--text);color:var(--bg);border-color:var(--text)}
.filters button .n{opacity:.7;font-variant-numeric:tabular-nums;margin-left:4px}
.layout{max-width:1240px;margin:0 auto;padding:28px 24px 64px;display:grid;grid-template-columns:250px minmax(0,1fr);gap:44px}
.toc{position:sticky;top:72px;align-self:start;max-height:calc(100vh - 88px);overflow:auto;font-size:13px;padding-right:4px}
.toc>details>summary{font-weight:600;cursor:pointer;margin:0 0 8px;color:var(--muted);font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.toc ol{list-style:none;margin:0;padding:0;counter-reset:p}
.toc li{counter-increment:p;margin:0}
.toc a{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;padding:5px 8px;border-radius:6px;color:var(--text);text-decoration:none}
.toc a::before{content:counter(p);color:var(--muted);font-variant-numeric:tabular-nums;grid-row:span 2}
.toc a:hover{background:var(--surface-2)}
.toc a.on{background:var(--user-bg)}
.toc .tt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.toc .tm{color:var(--muted);font-size:11.5px}
main{min-width:0;max-width:880px}
.ev{margin:0 0 26px}
.ev.miss{display:none}
.eh{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:0 0 6px;font-size:13px;color:var(--muted)}
.who{font-weight:650;color:var(--text)}
.user .who{color:var(--user)}
.asst .who{color:var(--claude)}
.model{font:12px var(--mono)}
.pn{margin-left:auto;color:var(--muted);text-decoration:none;font-variant-numeric:tabular-nums}
.ubody{background:var(--user-bg);border:1px solid var(--user-line);border-radius:12px;padding:12px 16px;overflow-wrap:anywhere;display:grid;gap:10px}
.ubody.cmd{font:13.5px var(--mono);white-space:pre-wrap;display:block}
.utext,.ptext{white-space:pre-wrap}
.pasted{border:1px dashed var(--user-line);border-radius:8px;padding:6px 12px;background:color-mix(in srgb,var(--surface) 55%,transparent)}
.pasted>summary{font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.02em}
.pasted>summary::before{content:"";display:inline-block;width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s;margin-right:8px;position:relative;top:-1px;opacity:.7}
.pasted .ptext{margin-top:6px;font-size:14px}
.user.o-task-notification .ubody,.user.o-peer .ubody,.user.o-tool .ubody{background:var(--surface);border-color:var(--border)}
.interrupted{font-size:13px;color:var(--err)}
.queued-note{font-size:12px;color:var(--muted)}
.md{overflow-wrap:break-word}
.md>:first-child{margin-top:0}.md>:last-child{margin-bottom:0}
.md p,.md ul,.md ol,.md blockquote,.md pre,.md .tablewrap{margin:0 0 .8em}
.md ul,.md ol{padding-left:1.4em}
.md li{margin:.15em 0}
.md li.task{list-style:none;margin-left:-1.2em}
.md h3,.md h4,.md h5,.md h6{line-height:1.3;margin:1.1em 0 .45em}
.md h3{font-size:1.15em}.md h4{font-size:1.05em}.md h5,.md h6{font-size:1em}
.md blockquote{border-left:3px solid var(--border-strong);margin-left:0;padding-left:14px;color:var(--muted)}
.md hr{border:0;border-top:1px solid var(--border);margin:1.2em 0}
.turn>.md{margin:0 0 12px}
pre{font:12.5px/1.55 var(--mono);background:var(--code-bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;overflow:auto;max-height:540px;margin:0;tab-size:4;white-space:pre}
pre.wrap{white-space:pre-wrap;overflow-wrap:anywhere}
pre.err{border-color:color-mix(in srgb,var(--err) 45%,var(--border))}
code{font-family:var(--mono);font-size:.88em;background:var(--code-bg);padding:.1em .35em;border-radius:4px;overflow-wrap:anywhere}
pre code{background:none;padding:0;font-size:inherit;overflow-wrap:normal}
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;font-size:13.5px}
th,td{border:1px solid var(--border);padding:5px 10px;text-align:left;vertical-align:top}
th{background:var(--surface-2);font-weight:600}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
details>summary{cursor:pointer;list-style:none}
details>summary::-webkit-details-marker{display:none}
.tool>summary::before,.thinking>summary::before,.ctx>summary::before,.ctxitem>summary::before,.subagent>summary::before,.fold>summary::before,.panel>summary::before,.toc>details>summary::before{content:"";display:inline-block;width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s;flex:none;margin-right:8px;position:relative;top:-1px;opacity:.7}
details[open]>summary::before{transform:rotate(45deg)!important}
.tool{border:1px solid var(--border);border-radius:10px;background:var(--surface);margin:8px 0}
.tool>summary{display:flex;align-items:center;gap:10px;padding:7px 12px;min-width:0}
.tool>summary::before{margin-right:0}
.tname{font:600 12.5px var(--mono);flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.digest{font:12.5px var(--mono);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.tmeta{flex:none;font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center;font-variant-numeric:tabular-nums}
.st{font-weight:700}
.s-ok .st{color:var(--ok)}
.s-error .st,.s-denied .st{color:var(--err)}
.s-error,.s-denied{border-color:color-mix(in srgb,var(--err) 40%,var(--border))}
.tbody{padding:2px 12px 12px;border-top:1px solid var(--border);min-width:0}
.lbl{font-size:11px;font-weight:650;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin:12px 0 5px}
.note{font-size:13px;color:var(--muted);margin:6px 0 0}
.kv{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:3px 14px;margin:0;font-size:13px}
.kv dt{font:12.5px var(--mono);color:var(--muted)}
.kv dd{font:12.5px var(--mono);white-space:pre-wrap}
.checklist{list-style:none;padding:0;margin:0;font-size:14px}
.checklist li{padding:2px 0}
.checklist .done{color:var(--muted);text-decoration:line-through}
.checklist .cur{font-weight:600}
.thinking{margin:6px 0 10px;color:var(--muted)}
.thinking>summary{font-size:13px;font-style:italic;display:inline-flex;align-items:center}
.thinking .md{border-left:2px solid var(--border-strong);padding:2px 0 2px 14px;margin-top:6px;font-size:14px}
.thinking.redacted{font-size:13px;font-style:italic}
.dur{font-style:normal;font-variant-numeric:tabular-nums;margin-left:6px;opacity:.85}
.ctx{color:var(--muted);font-size:13px;margin:8px 0}
.ctx>summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ctx .tag{font:600 10.5px var(--sans);letter-spacing:.07em;text-transform:uppercase;border:1px solid var(--border-strong);border-radius:4px;padding:1px 5px}
.ctxitems{padding:6px 0 0 14px;display:grid;gap:6px}
.ctxitem>summary{display:flex;align-items:center;gap:8px}
.ctxitem pre{margin-top:6px;max-height:420px}
.compact{display:flex;align-items:center;gap:14px;color:var(--muted);font-size:13px;text-align:center}
.compact::before,.compact::after{content:"";flex:1;height:1px;background:var(--border-strong)}
.fold{margin:0 0 26px}
.fold>summary{font-size:13px;color:var(--muted)}
.fold .md{margin-top:8px;border-left:2px solid var(--border-strong);padding-left:14px}
.sys{font-size:13px;color:var(--muted);padding:4px 0 4px 12px;border-left:2px solid var(--border-strong);margin:6px 0 14px;overflow-wrap:anywhere}
.sys.error{color:var(--err);border-color:var(--err)}
.sys.quiet{border:0;padding-left:0;font-size:12px}
.subagent{border-left:2px solid var(--claude);margin:12px 0 4px;padding-left:12px}
.subagent>summary{font-size:13px;font-weight:600;display:inline-flex;align-items:center}
.nested{padding-top:12px}
.nested .ev{margin-bottom:18px}
.msgmeta{font:11.5px var(--mono);color:var(--muted);margin:-4px 0 12px;overflow-wrap:anywhere}
.folded{font-size:13px;color:var(--muted);font-style:italic;margin:4px 0 10px}
.diff{padding:8px 0}
.diff span{display:block;min-height:1.55em;padding:0 12px}
.diff .da{background:var(--diff-add)}
.diff .dd{background:var(--diff-del)}
.diff .dh{background:var(--diff-hunk);color:var(--muted)}
figure.img{margin:8px 0}
figure.img img{display:block;max-width:min(100%,520px);height:auto;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;background:var(--surface-2)}
figure.img img.big{max-width:100%;cursor:zoom-out}
figcaption{font-size:12px;color:var(--muted);margin-top:4px}
.doc{display:inline-block;font-size:13px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);text-decoration:none;margin:4px 0}
mark{background:var(--mark);color:inherit;border-radius:2px}
footer{max-width:1240px;margin:0 auto;padding:24px;border-top:1px solid var(--border);color:var(--muted);font-size:12.5px;overflow-wrap:anywhere}
body.hide-thinking .thinking{display:none}
body.hide-tools .tool{display:none}
body.hide-context .ctx{display:none}
body.hide-system .sys,body.hide-system .cmdout,body.hide-system .compact,body.hide-system .fold.csum{display:none}
body.hide-meta .msgmeta{display:none}
@media (max-width:900px){
  .layout{grid-template-columns:minmax(0,1fr);gap:18px;padding:18px 16px 48px}
  .toc{position:static;max-height:none;padding:0}
  .hero{padding:28px 16px 16px}
  .bar-in{padding:8px 16px}
  footer{padding:20px 16px}
  .tname{max-width:50%}
}
@media print{
  .bar,.toc{display:none}
  .layout{display:block;padding:0 16px}
  pre{max-height:none;white-space:pre-wrap;overflow-wrap:anywhere}
  body{font-size:12px}
}`;

const JS = `
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement, body = document.body;
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  const themes = ['auto', 'light', 'dark'];
  const tbtn = $('#theme');
  let ti = Math.max(0, themes.indexOf(store.get('cc-exporter-theme') || 'auto'));
  const applyTheme = () => {
    const t = themes[ti];
    if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    tbtn.textContent = 'Theme: ' + t;
  };
  applyTheme();
  tbtn.addEventListener('click', () => { ti = (ti + 1) % themes.length; applyTheme(); store.set('cc-exporter-theme', themes[ti]); });

  for (const b of $$('[data-filter]')) {
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      body.classList.toggle('hide-' + b.dataset.filter, !on);
    });
  }
  const main = $('main');
  $('#expand').addEventListener('click', () => $$('details', main).forEach((d) => (d.open = true)));
  $('#collapse').addEventListener('click', () => $$('details', main).forEach((d) => (d.open = false)));

  main.addEventListener('click', (e) => { const img = e.target.closest('figure.img img'); if (img) img.classList.toggle('big'); });

  const q = $('#q'), count = $('#count');
  const evs = $$(':scope > .ev, :scope > details.ev', main);
  let texts = null, timer = 0;
  const run = () => {
    const s = q.value.trim().toLowerCase();
    if (!texts) texts = evs.map((e) => e.textContent.toLowerCase());
    let n = 0;
    evs.forEach((e, i) => {
      const hit = !s || texts[i].includes(s);
      e.classList.toggle('miss', !hit);
      if (s && hit) {
        n++;
        for (const d of $$('details', e)) if (!d.open && d.textContent.toLowerCase().includes(s)) d.open = true;
        if (e.tagName === 'DETAILS') e.open = true;
      }
    });
    count.textContent = s ? n + (n === 1 ? ' message' : ' messages') : '';
  };
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 150); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; run(); q.blur(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== q && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  });

  const tocD = $('.toc > details');
  if (tocD && matchMedia('(min-width: 901px)').matches) tocD.open = true;
  const links = new Map($$('.toc a').map((a) => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window && links.size) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { $$('.toc a.on').forEach((a) => a.classList.remove('on')); links.get(en.target.id)?.classList.add('on'); }
    }, { rootMargin: '-80px 0px -70% 0px' });
    for (const id of links.keys()) { const el = document.getElementById(id); if (el) io.observe(el); }
  }
  window.addEventListener('beforeprint', () => $$('details').forEach((d) => (d.open = true)));
})();`;

/**
 * @param {object} model  from loadSession()
 * @param {{detail?: string, thinking?: boolean, maxOutput?: number, images?: boolean}} o
 */
export function renderHtml(model, { detail = 'full', thinking, maxOutput = 0, images = true } = {}) {
  const view = { thinking };
  const m = model.meta;
  const st = model.stats;
  const full = detail === 'full';
  const toc = [];
  let contextCount = 0;
  let thinkingCount = 0;

  const clip = (s) => {
    s = String(s ?? '');
    return maxOutput && s.length > maxOutput ? s.slice(0, maxOutput) + `\n… [${fmtNum(s.length - maxOutput)} more characters cut by --max-output]` : s;
  };
  const time = (ts, prev) => (ts ? `<time datetime="${esc(ts)}" title="${esc(fmtTime(ts))}">${esc(fmtTime(ts, { date: !prev || !sameDay(prev, ts) }))}</time>` : '');
  const sec = (label, inner) => `<div class="lbl">${esc(label)}</div>${inner}`;
  const pre = (text, cls = '') => `<pre${cls ? ` class="${cls}"` : ''}>${esc(clip(text))}</pre>`;

  const mediaHtml = (p) => {
    if (p.type !== 'image' && p.type !== 'document') return partsHtml([p]);
    const safe = p.data && isBase64(p.data) && /^[\w.+-]+\/[\w.+-]+$/.test(p.mediaType ?? '');
    if (p.data && !safe) return `<p class="note">[${esc(p.type)} with malformed data — omitted]</p>`;
    const size = p.data ? fmtBytes(Math.round((p.data.length * 3) / 4)) : '';
    if (p.type === 'image') {
      if (p.data && images) return `<figure class="img"><img src="data:${esc(p.mediaType)};base64,${p.data}" alt="Image from the conversation" loading="lazy"><figcaption>${esc(p.mediaType)} · ${size}</figcaption></figure>`;
      if (p.url) return `<figure class="img"><a href="${esc(p.url)}">${esc(p.url)}</a></figure>`;
      return `<p class="note">[image: ${esc(p.mediaType)}${size ? `, ${size}` : ''} — omitted]</p>`;
    }
    if (p.data && images) {
      const ext = (p.mediaType.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
      return `<a class="doc" download="${esc((p.title || 'document').replace(/[^\w.-]+/g, '_'))}.${ext}" href="data:${esc(p.mediaType)};base64,${p.data}">Download ${esc(p.title || 'document')} · ${esc(p.mediaType)} · ${size}</a>`;
    }
    return `<p class="note">[document: ${esc(p.mediaType)}${size ? `, ${size}` : ''}]</p>`;
  };

  const partsHtml = (ps, { markdown = false, err = false } = {}) => {
    let h = '';
    const text = ps.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    if (text.trim()) h += markdown ? `<div class="md">${mdToHtml(text)}</div>` : pre(text, err ? 'err' : '');
    const refs = ps.filter((p) => p.type === 'tool_reference');
    if (refs.length) h += `<p class="note">Loaded tools: ${refs.map((r) => `<code>${esc(r.name)}</code>`).join(' ')}</p>`;
    for (const p of ps) if (p.type === 'image' || p.type === 'document') h += mediaHtml(p);
    for (const p of ps) if (p.type === 'json') h += pre(JSON.stringify(p.value, null, 2));
    return h;
  };

  const diffHtml = (text) =>
    `<pre class="diff">${String(text)
      .split('\n')
      .map((l) => `<span class="${l.startsWith('@@') ? 'dh' : l.startsWith('+') ? 'da' : l.startsWith('-') ? 'dd' : 'dc'}">${esc(l)}</span>`)
      .join('')}</pre>`;

  const checklist = (items, textKey = 'content') =>
    `<ul class="checklist">${items
      .map((t) => `<li class="${t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'cur' : ''}">${t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '▶' : '☐'} ${esc(t[textKey] ?? t.activeForm ?? '')}</li>`)
      .join('')}</ul>`;

  const kv = (obj) => {
    const entries = Object.entries(obj ?? {});
    if (!entries.length) return '';
    const simple = entries.every(([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v));
    if (!simple) return pre(JSON.stringify(obj, null, 2));
    return `<dl class="kv">${entries.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(clip(String(v)))}</dd>`).join('')}</dl>`;
  };

  function toolInput(b) {
    const i = b.input ?? {};
    const sd = b.result?.structured;
    switch (b.name) {
      case 'Bash': {
        const flags = [i.run_in_background && 'background', i.timeout && `timeout ${i.timeout} ms`, i.dangerouslyDisableSandbox && 'sandbox disabled'].filter(Boolean);
        return sec('Command', `<pre class="wrap"><code>${esc(i.command ?? '')}</code></pre>`) + (i.description ? `<p class="note">${esc(i.description)}</p>` : '') + (flags.length ? `<p class="note">${esc(flags.join(' · '))}</p>` : '');
      }
      case 'Edit':
        return sec(`Edit${i.replace_all ? ' (replace all)' : ''}`, `<p class="note"><code>${esc(i.file_path)}</code></p>` + diffHtml(sd?.structuredPatch?.length ? patchText(sd.structuredPatch) : naiveDiff(i.old_string, i.new_string)));
      case 'MultiEdit':
        return sec('Edits', `<p class="note"><code>${esc(i.file_path)}</code></p>` + (sd?.structuredPatch?.length ? diffHtml(patchText(sd.structuredPatch)) : (i.edits ?? []).map((e) => diffHtml(naiveDiff(e.old_string, e.new_string))).join('')));
      case 'Write':
        return sec(`Write${sd?.type ? ` (${sd.type})` : ''}`, `<p class="note"><code>${esc(i.file_path)}</code> · ${fmtNum(String(i.content ?? '').split('\n').length)} lines</p>` + pre(i.content ?? ''));
      case 'Read':
        return sec('File', kv(i));
      case 'Agent':
      case 'Task':
        return sec(`${i.subagent_type ?? 'Agent'} · ${i.description ?? ''}${i.model ? ` · ${i.model}` : ''}${i.run_in_background ? ' · background' : ''}`, `<div class="md">${mdToHtml(i.prompt ?? '')}</div>`);
      case 'TodoWrite':
        return sec('Todos', checklist(i.todos ?? []));
      case 'ExitPlanMode':
        return sec('Plan', `<div class="md">${mdToHtml(i.plan ?? '')}</div>`);
      case 'AskUserQuestion':
        return sec(
          'Questions',
          (i.questions ?? [])
            .map((q) => `<p><strong>${esc(q.header ? `${q.header}: ` : '')}${esc(q.question)}</strong></p><ul>${(q.options ?? []).map((o) => `<li>${esc(o.label)}${o.description ? ` — <span class="note">${esc(o.description)}</span>` : ''}</li>`).join('')}</ul>`)
            .join(''),
        ) + (sd?.answers ? sec('Answers', kv(sd.answers)) : '');
      default:
        if (b.name === 'mcp__ccd_turn__update_plan' && Array.isArray(i.items)) return sec('Plan', checklist(i.items));
        return Object.keys(i).length ? sec('Input', kv(i)) : '';
    }
  }

  function toolOutput(b) {
    const r = b.result;
    if (!r) return sec('Result', '<p class="note">No result recorded.</p>');
    const sd = r.structured;
    const report = (b.name === 'Agent' || b.name === 'Task') && !r.isError;
    let h = partsHtml(r.parts, { markdown: report, err: r.isError }) || '<p class="note">(empty)</p>';
    if (r.fullOutput != null) h += `<details class="fold" style="margin:8px 0 0"><summary>Full output · ${fmtBytes(Buffer.byteLength(r.fullOutput))}</summary>${pre(r.fullOutput)}</details>`;
    else if (r.fullOutputNote) h += `<p class="note">${esc(r.fullOutputNote)} <code>${esc(r.persistedPath ?? '')}</code></p>`;
    const notes = [
      sd?.interrupted && 'interrupted',
      sd?.returnCodeInterpretation,
      sd?.backgroundTaskId && `background task ${sd.backgroundTaskId}`,
      r.denial && `denied (${r.denial})`,
    ].filter(Boolean);
    if (notes.length) h += `<p class="note">${esc(notes.join(' · '))}</p>`;
    if (full && r.permission?.decision) h += `<p class="msgmeta">permission: ${esc([r.permission.decision, r.permission.source, r.permission.reasonType, r.permission.ruleSource].filter(Boolean).join(' · '))}</p>`;
    return sec(r.isError ? 'Error' : report ? 'Report' : 'Result', h);
  }

  function toolHtml(b, depth) {
    const s = toolStatus(b);
    const digest = toolDigest(b.name, b.input);
    let inner = toolInput(b);
    if (b.subagent) {
      const sub = b.subagent;
      inner += `<details class="subagent"><summary>Subagent transcript · ${esc(sub.meta.title ?? b.agentId)} · ${sub.stats.toolCalls} tool calls · ${fmtTokens(sub.stats.usage.output)} output tokens</summary><div class="nested">${renderEvents(filterEvents(sub.events, detail, view), depth + 1)}</div></details>`;
    } else if (b.agentId) {
      inner += `<p class="note">Subagent <code>${esc(b.agentId)}</code> — transcript not included.</p>`;
    }
    inner += toolOutput(b);
    if (b.hooks?.length) inner += sec('Hooks', b.hooks.map((hk) => `<p class="note">${esc(hk.name ?? hk.type)}</p>${pre(hk.text, 'wrap')}`).join(''));
    if (full) inner += `<p class="msgmeta">${esc(b.id ?? '')}${b.caller ? ` · caller ${esc(b.caller.type)}` : ''}</p>`;
    return `<details class="tool s-${s.key}" data-tool="${esc(b.name)}"><summary><span class="tname" title="${esc(b.name)}">${esc(toolLabel(b.name))}</span><span class="digest" title="${esc(digest)}">${esc(oneLine(digest, 200))}</span><span class="tmeta"><span class="st" title="${s.label}">${STATUS[s.key]}</span>${esc(fmtDuration(b.durationMs))}</span></summary><div class="tbody">${inner}</div></details>`;
  }

  function blockHtml(b, depth) {
    if (b.type === 'text') return `<div class="md">${mdToHtml(b.text)}</div>`;
    if (b.type === 'thinking') {
      thinkingCount++;
      const dur = b.durationMs ? `<span class="dur">${esc(fmtDuration(b.durationMs))}</span>` : '';
      if (b.redacted) return `<div class="thinking redacted">Thinking${dur} · not stored in the transcript</div>`;
      return `<details class="thinking"><summary>Thinking${dur}</summary><div class="md">${mdToHtml(b.text)}</div></details>`;
    }
    if (b.type === 'tool') return toolHtml(b, depth);
    if (b.type === 'media') return mediaHtml(b.part);
    if (b.type === 'unknown') return pre(JSON.stringify(b.raw, null, 2));
    return '';
  }

  function contextHtml(ev, top) {
    contextCount += ev.items.length;
    const labels = [...new Set(ev.items.map((x) => attachmentLabel(x.attType)))];
    return `<details class="ctx${top ? ' ev' : ''}"><summary><span class="tag">Context</span>${ev.items.length} injected · ${esc(oneLine(labels.join(', '), 140))}</summary><div class="ctxitems">${ev.items
      .map((x) => `<details class="ctxitem"><summary>${esc(attachmentLabel(x.attType))} <span class="note" style="margin:0">${esc(fmtTime(x.ts, { date: false }))}</span></summary>${pre(x.text || '(empty)', 'wrap')}</details>`)
      .join('')}</div></details>`;
  }

  function systemHtml(ev, top) {
    const cls = `sys${ev.level === 'error' || ev.subtype === 'api_error' ? ' error' : ''}${ev.quiet ? ' quiet' : ''}${top ? ' ev' : ''}`;
    let body;
    if (ev.subtype === 'api_error') body = `<strong>API error</strong> — ${esc(ev.text)}${ev.retry ? ` (${esc(ev.retry)})` : ''}`;
    else if (ev.subtype === 'turn_duration') body = `Turn took ${esc(fmtDuration(ev.durationMs))}${ev.messageCount ? ` · ${ev.messageCount} messages` : ''}`;
    else if (ev.subtype === 'stop_hook_summary') {
      const names = ev.hooks.map((x) => x.command ?? x.name).filter(Boolean);
      body = `Stop hooks ran (${ev.hookCount})${names.length ? `: ${names.map((n) => `<code>${esc(oneLine(n, 80))}</code>`).join(' ')}` : ''}${ev.preventedContinuation ? ' — prevented continuation' : ''}${ev.hookErrors.map((e) => `<br>✗ ${esc(oneLine(typeof e === 'string' ? e : JSON.stringify(e), 400))}`).join('')}`;
    } else body = `<strong>${esc(String(ev.subtype).replace(/_/g, ' '))}</strong>${ev.text ? ` — ${esc(clip(ev.text))}` : ''}`;
    return `<div class="${cls}">${body} <span class="note" style="margin:0">${esc(fmtTime(ev.ts, { date: false }))}</span></div>`;
  }

  function userHtml(ev, depth, prevTs) {
    const prompt = depth === 0 && isPrompt(ev);
    let id = '';
    if (prompt) {
      id = `p-${toc.length + 1}`;
      toc.push({ id, text: oneLine(promptLine(ev), 100) || '(attachment)', ts: ev.ts });
    }
    const c = ev.cls ?? { type: 'text' };
    let body;
    if (c.type === 'command') body = `<div class="ubody cmd">${esc(`${c.name}${c.args ? ` ${c.args}` : ''}`)}</div>`;
    else if (c.type === 'shell') body = `<div class="ubody cmd">$ ${esc(c.command)}</div>`;
    else if (c.type === 'shell-output') body = pre([c.stdout, c.stderr && `stderr:\n${c.stderr}`].filter(Boolean).join('\n') || '(no output)');
    else if (c.type === 'command-output') body = pre(c.text || '(no output)', c.isError ? 'err' : '');
    else if (c.type === 'interrupted') body = `<p class="interrupted">Interrupted by user</p>`;
    else if (c.type === 'notification' || ev.origin === 'task-notification') body = `<details class="fold" style="margin:0"><summary>${esc(oneLine(ev.text.replace(/<[^>]+>/g, ' '), 140))}</summary>${pre(ev.text, 'wrap')}</details>`;
    else if (ev.origin === 'peer') body = `<details class="fold" style="margin:0"><summary>${esc(oneLine(ev.text, 140))}</summary><div class="md">${mdToHtml(ev.text)}</div></details>`;
    else {
      const segs = splitPasted(ev.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n'));
      body = segs.length
        ? `<div class="ubody">${segs
            .map((s) => (s.type === 'pasted' ? `<details class="pasted"${s.text.length < 1500 ? ' open' : ''}><summary>Pasted text · ${esc(plural(s.text.split('\n').length, 'line'))}</summary><div class="ptext">${esc(s.text)}</div></details>` : `<div class="utext">${esc(s.text)}</div>`))
            .join('')}</div>`
        : '';
    }
    body += partsHtml(ev.parts.filter((p) => p.type !== 'text'));
    const label = userLabel(ev);
    return `<section class="ev user o-${esc(ev.origin)} c-${esc(c.type)}"${id ? ` id="${id}"` : ''}><header class="eh"><span class="who">${esc(label)}</span>${time(ev.ts, prevTs)}${prompt ? `<a class="pn" href="#${id}">#${toc.length}</a>` : ''}</header>${body}</section>`;
  }

  function renderEvents(evs, depth) {
    const out = [];
    let open = false;
    let prevTs = null;
    const close = () => {
      if (open) out.push('</div></section>');
      open = false;
    };
    for (const ev of evs) {
      if (ev.kind === 'assistant') {
        if (!open) {
          out.push(`<section class="ev asst"><header class="eh"><span class="who">Claude</span>${ev.model && !ev.synthetic ? `<span class="model">${esc(modelShort(ev.model))}</span>` : ''}${time(ev.ts, prevTs)}</header><div class="turn">`);
          open = true;
        }
        out.push(ev.blocks.map((b) => blockHtml(b, depth)).join(''));
        if (detail === 'conversation' && ev.toolCount) out.push(`<p class="folded">… used ${ev.toolCount} tool${ev.toolCount === 1 ? '' : 's'} …</p>`);
        if (full && (ev.usage || ev.requestId)) {
          const u = ev.usage ?? {};
          const bits = [
            ev.id?.startsWith('msg_') ? ev.id : null,
            ev.requestId,
            ev.usage ? `in ${fmtNum(u.input_tokens)} · out ${fmtNum(u.output_tokens)} · cache read ${fmtTokens(u.cache_read_input_tokens)} · cache write ${fmtTokens(u.cache_creation_input_tokens)}` : null,
            ev.stopReason && `stop ${ev.stopReason}`,
            ev.effort && `effort ${ev.effort}`,
            ev.attribution?.skill && `skill ${ev.attribution.skill}`,
            ev.attribution?.plugin && `plugin ${ev.attribution.plugin}`,
          ].filter(Boolean);
          out.push(`<p class="msgmeta">${esc(bits.join(' · '))}</p>`);
        }
        prevTs = ev.ts ?? prevTs;
        continue;
      }
      if (open && (ev.kind === 'context-group' || (ev.kind === 'system' && ev.quiet))) {
        out.push(ev.kind === 'context-group' ? contextHtml(ev, false) : systemHtml(ev, false));
        continue;
      }
      close();
      const top = depth === 0;
      switch (ev.kind) {
        case 'user':
          out.push(userHtml(ev, depth, prevTs));
          break;
        case 'context-group':
          out.push(contextHtml(ev, true));
          break;
        case 'system':
          out.push(systemHtml(ev, true));
          break;
        case 'compact':
          out.push(`<div class="ev compact">Conversation compacted${ev.trigger ? ` (${esc(ev.trigger)})` : ''}${ev.preTokens ? ` · ${fmtTokens(ev.preTokens)} → ${fmtTokens(ev.postTokens)} tokens` : ''} · ${esc(fmtTime(ev.ts))}</div>`);
          break;
        case 'compact-summary':
          out.push(`<details class="ev fold csum"><summary>Summary Claude carried forward after compaction · ${fmtNum(ev.text.length)} chars</summary><div class="md">${mdToHtml(ev.text)}</div></details>`);
          break;
        case 'command-output':
          out.push(`<div class="ev cmdout"><header class="eh"><span class="who">Command output</span>${ev.command?.command ? `<code>/${esc(ev.command.command)}</code>` : ''}${time(ev.ts, prevTs)}</header>${pre(ev.text || '(no output)')}</div>`);
          break;
        case 'tools-folded':
          out.push(`<p class="ev folded">… used ${ev.count} tool${ev.count === 1 ? '' : 's'} …</p>`);
          break;
        default:
          break;
      }
      void top;
      prevTs = ev.ts ?? prevTs;
    }
    close();
    return out.join('');
  }

  const events = filterEvents(model.events, detail, view);
  let timeline = renderEvents(events, 0);
  if (model.otherAgents?.length) {
    timeline += `<section class="ev"><header class="eh"><span class="who">Other agent transcripts</span></header><p class="note">Agent runs in this session that no tool call in the main thread points to, such as compaction or background helpers.</p>${model.otherAgents
      .map((a) => `<details class="subagent"><summary>${esc(a.info?.agentType ?? 'agent')} · ${esc(a.info?.description ?? a.agentId)} · ${a.stats.toolCalls} tool calls</summary><div class="nested">${renderEvents(filterEvents(a.events, detail, view), 1)}</div></details>`)
      .join('')}</section>`;
  }

  // ── header ──────────────────────────────────────────────────────────
  const word = pluralWord;
  const chips = [
    [st.prompts, word(st.prompts, 'prompt')],
    [st.assistantMessages, word(st.assistantMessages, 'reply', 'replies')],
    [st.toolCalls, word(st.toolCalls, 'tool call')],
    st.toolErrors ? [st.toolErrors, word(st.toolErrors, 'tool error'), 'bad'] : null,
    st.subagents ? [st.subagents, word(st.subagents, 'subagent')] : null,
    st.compactions ? [st.compactions, word(st.compactions, 'compaction')] : null,
    st.apiErrors ? [st.apiErrors, word(st.apiErrors, 'API error'), 'bad'] : null,
    [fmtTokens(st.usage.output), 'output tokens'],
    m.cost?.totalCostUSD != null ? [`$${m.cost.totalCostUSD.toFixed(2)}`, 'cost'] : null,
  ].filter(Boolean);
  const branches = m.gitBranches.filter((b) => b !== 'HEAD');
  const facts = [
    ['Started', fmtTime(m.start)],
    ['Last activity', fmtTime(m.end)],
    ['Span', fmtDuration(st.durationMs)],
    ['Models', m.models.map(modelShort).join(', ')],
    ['Claude Code', [m.versions.join(', '), m.entrypoints.join(', ')].filter(Boolean).join(' · ')],
    ['Permission modes', m.permissionModes.join(', ')],
    ['Tokens in', `${fmtTokens(st.usage.input)} fresh · ${fmtTokens(st.usage.cacheRead)} cache read · ${fmtTokens(st.usage.cacheWrite)} cache write`],
    model.totals?.subagentCount ? ['With subagents', `${fmtTokens(model.totals.usage.output)} output · ${model.totals.toolCalls} tool calls`] : null,
    m.cost?.linesAdded != null ? ['Lines changed', `+${fmtNum(m.cost.linesAdded)} / −${fmtNum(m.cost.linesRemoved)}`] : null,
    st.thinking ? ['Thinking', thinkingNote(st)] : null,
    ['Session id', m.sessionId ?? ''],
  ].filter((f) => f && f[1]);

  const panels = [];
  if (detail !== 'conversation' && Object.keys(st.tools).length) {
    panels.push(
      `<details class="panel"><summary>Tool usage · ${Object.keys(st.tools).length} tools</summary><div class="pbody"><table><thead><tr><th>Tool</th><th class="num">Calls</th><th class="num">Errors</th><th class="num">Time</th></tr></thead><tbody>${Object.entries(st.tools)
        .sort((a, b) => b[1].calls - a[1].calls)
        .map(([n, t]) => `<tr><td><code>${esc(toolLabel(n))}</code></td><td class="num">${t.calls}</td><td class="num">${t.errors || ''}</td><td class="num">${esc(fmtDuration(t.durationMs))}</td></tr>`)
        .join('')}</tbody></table></div></details>`,
    );
  }
  if (detail !== 'conversation' && Object.keys(st.usageByModel).length) {
    panels.push(
      `<details class="panel"><summary>Tokens by model</summary><div class="pbody"><table><thead><tr><th>Model</th><th class="num">Input</th><th class="num">Output</th><th class="num">Cache read</th><th class="num">Cache write</th></tr></thead><tbody>${Object.entries(st.usageByModel)
        .map(([k, u]) => `<tr><td><code>${esc(k)}</code></td><td class="num">${fmtNum(u.input)}</td><td class="num">${fmtNum(u.output)}</td><td class="num">${fmtNum(u.cacheRead)}</td><td class="num">${fmtNum(u.cacheWrite)}</td></tr>`)
        .join('')}</tbody></table></div></details>`,
    );
  }
  if (full && model.systemPrompt?.length) {
    panels.push(`<details class="panel"><summary>System prompt · ${model.systemPrompt.length} sections (first snapshot)</summary><div class="pbody">${model.systemPrompt.map((s) => pre(s.trim(), 'wrap')).join('<div style="height:8px"></div>')}</div></details>`);
  }

  const filterBtn = (key, label, on, n) => `<button type="button" data-filter="${key}" aria-pressed="${on}">${label}${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
  const filters = [
    thinkingCount ? filterBtn('thinking', 'Thinking', true, thinkingCount) : '',
    detail !== 'conversation' && st.toolCalls ? filterBtn('tools', 'Tools', true, st.toolCalls) : '',
    contextCount ? filterBtn('context', 'Context', false, contextCount) : '',
    filterBtn('system', 'System', true),
    full ? filterBtn('meta', 'Metadata', false) : '',
  ].join('');

  const tocHtml = toc.length
    ? `<nav class="toc" aria-label="Prompts"><details><summary>Prompts · ${toc.length}</summary><ol>${toc
        .map((t) => `<li><a href="#${t.id}"><span class="tt">${esc(t.text)}</span><span class="tm">${esc(fmtTime(t.ts))}</span></a></li>`)
        .join('')}</ol></details></nav>`
    : '<nav class="toc" aria-label="Prompts"></nav>';

  const title = String(m.title ?? 'Claude Code session');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="cc-exporter ${VERSION}">
<title>${esc(oneLine(title, 90))} · Claude Code chat</title>
<style>${CSS}</style>
</head>
<body class="${contextCount ? 'hide-context ' : ''}${full ? 'hide-meta' : ''}">
<header class="hero">
<p class="eyebrow">Claude Code session · ${esc(detail)} detail</p>
<h1>${esc(title)}</h1>
<p class="sub">${esc(m.cwd ?? '')}${branches.length ? ` · ${esc(branches.join(', '))}` : ''}</p>
<div class="chips">${chips.map(([v, l, c]) => `<span class="chip${c ? ` ${c}` : ''}"><b>${esc(String(v))}</b> ${esc(l)}</span>`).join('')}</div>
<dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
${panels.length ? `<div class="more">${panels.join('')}</div>` : ''}
</header>
<div class="bar"><div class="bar-in" role="toolbar" aria-label="View options">
<div class="search"><input id="q" type="search" placeholder="Search this chat  ( / )" aria-label="Search this chat" autocomplete="off"><span id="count" aria-live="polite"></span></div>
<div class="group filters" aria-label="Show">${filters}</div>
<div class="group"><button type="button" id="expand">Expand all</button><button type="button" id="collapse">Collapse all</button><button type="button" id="theme">Theme: auto</button></div>
</div></div>
<div class="layout">
${tocHtml}
<main>${timeline || '<p class="note">This session has no messages yet.</p>'}</main>
</div>
<footer>Exported ${esc(fmtTime(new Date().toISOString()))} with cc-exporter ${VERSION} · ${esc(detail)} detail · transcript <code>${esc(m.file)}</code></footer>
<script>${JS}</script>
</body>
</html>
`;
}
