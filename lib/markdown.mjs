// A small, safe Markdown → HTML converter for assistant replies.
// Everything is HTML-escaped first; only the constructs below become markup.
// Covers what Claude writes: fenced code, headings, lists (nested, task
// items), block quotes, GFM tables, rules, links, emphasis, inline code.

import { esc } from './util.mjs';

const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function safeUrl(u) {
  const s = String(u).trim();
  if (/^(https?:|mailto:|#|\/|\.\.?\/)/i.test(s) || !/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return '#';
}

export function inline(src) {
  const slots = [];
  const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = String(src ?? '');
  // code spans first, so nothing inside them is formatted
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _t, code) => keep(`<code>${esc(code.replace(/^ (.*) $/s, '$1'))}</code>`));
  s = esc(s);
  // images and links: ![alt](url) [text](url)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, url) => keep(`<a href="${esc(safeUrl(url))}" class="imglink">🖼 ${alt || 'image'}</a>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, text, url) => keep(`<a href="${esc(safeUrl(url.replace(/&amp;/g, '&')))}">${text}</a>`));
  // bare URLs
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/g, (_, pre, url) => `${pre}${keep(`<a href="${url}">${url}</a>`)}`);
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  s = s.replace(/ {2,}\n|\\\n/g, '<br>');
  s = s.replace(/\n/g, ' ');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i]);
}

function splitRow(line) {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '`') inCode = !inCode;
    if (ch === '\\' && l[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isBlockStart(line) {
  return FENCE_RE.test(line) || /^\s{0,3}#{1,6}\s/.test(line) || /^\s{0,3}>/.test(line) || LIST_RE.test(line) || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line);
}

function renderList(items) {
  let html = '';
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
    const top = stack[stack.length - 1];
    if (!top || it.indent > top.indent) {
      const tag = it.ordered ? 'ol' : 'ul';
      html += it.ordered && it.start !== 1 ? `<ol start="${it.start}">` : `<${tag}>`;
      stack.push({ indent: it.indent, tag });
    } else {
      html += '</li>';
    }
    let body = it.lines.join('\n');
    let cls = '';
    const task = body.match(/^\[([ xX])\]\s+/);
    if (task) {
      body = body.slice(task[0].length);
      cls = ` class="task${task[1] === ' ' ? '' : ' done'}"`;
    }
    html += `<li${cls}>${task ? `<span class="box">${task[1] === ' ' ? '☐' : '☑'}</span> ` : ''}${inline(body)}`;
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

/**
 * @param {string} src
 * @param {{headingOffset?: number}} o  shift heading levels so replies sit under the page's own headings
 */
export function mdToHtml(src, { headingOffset = 2 } = {}) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const f = line.match(FENCE_RE);
    if (f) {
      const marker = f[1];
      const lang = f[2] ?? '';
      const buf = [];
      i++;
      while (i < lines.length && !(lines[i].trim().startsWith(marker[0].repeat(marker.length)) && lines[i].trim().replace(/[`~]/g, '') === '')) buf.push(lines[i++]);
      i++;
      html += `<pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const lvl = Math.min(6, h[1].length + headingOffset);
      html += `<h${lvl}>${inline(h[2])}</h${lvl}>`;
      i++;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      html += '<hr>';
      i++;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      const cell = (tag, c, j) => `<${tag}${aligns[j] ? ` style="text-align:${aligns[j]}"` : ''}>${inline(c)}</${tag}>`;
      html += `<div class="tablewrap"><table><thead><tr>${head.map((c, j) => cell('th', c, j)).join('')}</tr></thead><tbody>${rows
        .map((r) => `<tr>${head.map((_, j) => cell('td', r[j] ?? '', j)).join('')}</tr>`)
        .join('')}</tbody></table></div>`;
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      const buf = [];
      while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || (lines[i].trim() && !isBlockStart(lines[i]) && buf.length))) {
        buf.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      html += `<blockquote>${mdToHtml(buf.join('\n'), { headingOffset })}</blockquote>`;
      continue;
    }
    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = l.match(LIST_RE);
        if (m) {
          const ordered = /\d/.test(m[2]);
          items.push({ indent: m[1].replace(/\t/g, '    ').length, ordered, start: ordered ? parseInt(m[2], 10) : 1, lines: [m[3]] });
          i++;
          continue;
        }
        if (!l.trim()) {
          const n = lines[i + 1];
          if (n !== undefined && (LIST_RE.test(n) || /^\s{2,}\S/.test(n))) {
            i++;
            continue;
          }
          break;
        }
        if (items.length && (/^\s{2,}\S/.test(l) || !isBlockStart(l))) {
          if (FENCE_RE.test(l)) break;
          items[items.length - 1].lines.push(l.trim());
          i++;
          continue;
        }
        break;
      }
      html += renderList(items);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i]) && !(lines[i].includes('|') && TABLE_SEP_RE.test(lines[i + 1] ?? ''))) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]);
    html += `<p>${inline(buf.join('\n'))}</p>`;
  }
  return html;
}
