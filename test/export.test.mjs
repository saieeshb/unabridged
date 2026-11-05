// Run with: node --test test/
// Builds a synthetic Claude Code config dir with one session covering the
// record shapes the exporter handles, then exercises the CLI and MCP server.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'export-chat.mjs');
const SERVER = path.join(ROOT, 'mcp', 'server.mjs');
const SID = '11111111-2222-4333-8444-555555555555';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SECRET = 'sk-ant-api03-' + 'A'.repeat(40);

let tmp, config, cwd, out, codexHome;

function rec(o) {
  return JSON.stringify({ sessionId: SID, cwd, version: '9.9.9', gitBranch: 'main', entrypoint: 'cli', ...o });
}

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-exporter-test-'));
  config = path.join(tmp, 'config');
  cwd = path.join(tmp, 'My Project');
  out = path.join(tmp, 'out');
  codexHome = path.join(tmp, 'codex');
  process.env.CODEX_HOME = codexHome; // in-process imports too
  process.env.CLAUDE_CONFIG_DIR = config;
  fs.mkdirSync(cwd, { recursive: true });
  const proj = path.join(config, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  const side = path.join(proj, SID);
  fs.mkdirSync(path.join(side, 'subagents'), { recursive: true });
  fs.mkdirSync(path.join(side, 'tool-results'), { recursive: true });
  const big = path.join(side, 'tool-results', 'big.txt');
  fs.writeFileSync(big, 'FULL-PERSISTED-OUTPUT\n'.repeat(50));

  const usage = (out) => ({ input_tokens: 3, output_tokens: out, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 });
  const t = (s) => `2026-01-02T10:00:${String(s).padStart(2, '0')}.000Z`;
  const lines = [
    { type: 'custom-title', customTitle: 'Fixture session', sessionId: SID },
    rec({ type: 'attachment', uuid: 'a0', parentUuid: null, timestamp: t(0), attachment: { type: 'prompt_snapshot', systemPrompt: ['You are a test system prompt.', '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'] } }),
    rec({ type: 'attachment', uuid: 'a1', parentUuid: 'a0', timestamp: t(0), attachment: { type: 'environment' }, rendered: [{ content: '<system-reminder>\nENV-CONTEXT-TEXT\n</system-reminder>' }] }),
    rec({ type: 'user', uuid: 'u1', parentUuid: 'a1', timestamp: t(1), message: { role: 'user', content: '\n\nFix the bug please\n<pasted_content id="1">TRACEBACK LINE</pasted_content id="1">' }, origin: { kind: 'human' } }),
    rec({ type: 'assistant', uuid: 'm1a', parentUuid: 'u1', timestamp: t(2), requestId: 'req_1', thinkingDurationMs: 1500, message: { id: 'msg_1', model: 'claude-test-1', role: 'assistant', content: [{ type: 'thinking', thinking: 'THINKING-TEXT', signature: 'sig' }], usage: usage(5) } }),
    rec({ type: 'assistant', uuid: 'm1b', parentUuid: 'm1a', timestamp: t(3), message: { id: 'msg_1', model: 'claude-test-1', role: 'assistant', content: [{ type: 'text', text: 'I will **check** it.' }], usage: usage(20) } }),
    rec({ type: 'assistant', uuid: 'm1c', parentUuid: 'm1b', timestamp: t(3), message: { id: 'msg_1', model: 'claude-test-1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'echo hi', description: 'Say hi' } }], usage: usage(30) } }),
    rec({ type: 'assistant', uuid: 'm1d', parentUuid: 'm1c', timestamp: t(4), message: { id: 'msg_1', model: 'claude-test-1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_2', name: 'Edit', input: { file_path: '/x/app.js', old_string: 'a', new_string: 'b' } }], stop_reason: 'tool_use', usage: usage(50) } }),
    rec({ type: 'user', uuid: 'r1', parentUuid: 'm1d', timestamp: t(5), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'hi' }] }, toolUseResult: { stdout: 'hi', stderr: '', interrupted: false } }),
    rec({ type: 'user', uuid: 'r2', parentUuid: 'r1', timestamp: t(6), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: 'updated' }] }, toolUseResult: { filePath: '/x/app.js', originalFile: 'a', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }] } }),
    rec({ type: 'attachment', uuid: 'q1', parentUuid: 'r2', timestamp: t(7), attachment: { type: 'queued_command', prompt: 'QUEUED-PROMPT', commandMode: 'prompt', origin: { kind: 'human' } } }),
    rec({ type: 'assistant', uuid: 'm2', parentUuid: 'q1', timestamp: t(8), message: { id: 'msg_2', model: 'claude-test-1', role: 'assistant', content: [
      { type: 'tool_use', id: 'toolu_3', name: 'Agent', input: { subagent_type: 'Explore', description: 'look around', prompt: 'find x' } },
      { type: 'tool_use', id: 'toolu_4', name: 'Read', input: { file_path: '/x/big.txt' } },
      { type: 'tool_use', id: 'toolu_5', name: 'mcp__browser__screenshot', input: {} },
    ], usage: usage(40) } }),
    rec({ type: 'user', uuid: 'r3', parentUuid: 'm2', timestamp: t(12), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_3', content: [{ type: 'text', text: 'Found **x** in y' }] }] }, toolUseResult: { agentId: 'abc123', status: 'completed' } }),
    rec({ type: 'user', uuid: 'r4', parentUuid: 'r3', timestamp: t(13), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_4', content: `<persisted-output>\nOutput too large (1KB). Full output saved to: ${big}\n\nPreview (first 2KB):\nFULL-PERSISTED\n</persisted-output>` }] } }),
    rec({ type: 'user', uuid: 'r5', parentUuid: 'r4', timestamp: t(14), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_5', is_error: false, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } }] }] } }),
    rec({ type: 'system', subtype: 'api_error', uuid: 's1', parentUuid: 'r5', timestamp: t(15), level: 'error', error: { formatted: '529 Overloaded' }, retryAttempt: 1, maxRetries: 10, retryInMs: 500 }),
    rec({ type: 'system', subtype: 'compact_boundary', uuid: 'c1', parentUuid: null, logicalParentUuid: 's1', timestamp: t(16), compactMetadata: { trigger: 'auto', preTokens: 100000, postTokens: 5000 } }),
    rec({ type: 'user', uuid: 'cs', parentUuid: 'c1', timestamp: t(17), isCompactSummary: true, message: { role: 'user', content: 'COMPACT-SUMMARY-TEXT' } }),
    rec({ type: 'user', uuid: 'u2', parentUuid: 'cs', timestamp: t(18), message: { role: 'user', content: '<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args>opus</command-args>' }, origin: { kind: 'human' } }),
    rec({ type: 'system', subtype: 'local_command', uuid: 'lc', parentUuid: 'u2', timestamp: t(19), content: '<local-command-stdout>Set model to opus</local-command-stdout>', commandRun: { command: 'model', args: 'opus' } }),
    rec({ type: 'user', uuid: 'u3', parentUuid: 'lc', timestamp: t(20), message: { role: 'user', content: 'Thanks' }, origin: { kind: 'human' } }),
    rec({ type: 'assistant', uuid: 'm3', parentUuid: 'u3', timestamp: t(21), message: { id: 'msg_3', model: 'claude-test-1', role: 'assistant', content: [{ type: 'text', text: `Done. Key was ${SECRET} and mail me at someone@example.com` }], stop_reason: 'end_turn', usage: usage(7) } }),
    rec({ type: 'user', uuid: 'u1', parentUuid: 'a1', timestamp: t(1), message: { role: 'user', content: 'DUPLICATE RECORD MUST BE SKIPPED' } }),
    { type: 'cost-state', sessionId: SID, totalCostUSD: 1.234, totalLinesAdded: 3, totalLinesRemoved: 1 },
  ];
  fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');

  const sub = [
    JSON.stringify({ type: 'user', uuid: 'su1', parentUuid: null, isSidechain: true, agentId: 'abc123', sessionId: SID, timestamp: t(9), message: { role: 'user', content: 'find x' } }),
    JSON.stringify({ type: 'assistant', uuid: 'sa1', parentUuid: 'su1', isSidechain: true, agentId: 'abc123', sessionId: SID, timestamp: t(10), message: { id: 'msg_s1', model: 'claude-test-2', role: 'assistant', content: [{ type: 'text', text: 'SUBAGENT-REPLY' }], usage: usage(9) } }),
  ];
  fs.writeFileSync(path.join(side, 'subagents', 'agent-abc123.jsonl'), sub.join('\n') + '\n');
  fs.writeFileSync(path.join(side, 'subagents', 'agent-abc123.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'look around', toolUseId: 'toolu_3' }));
});

after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

function cli(args, extraEnv = {}) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config, CODEX_HOME: codexHome, ...extraEnv };
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CODEX_THREAD_ID;
  Object.assign(env, extraEnv);
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: 'utf8' });
  return r;
}

function outputs(dir) {
  const files = fs.readdirSync(dir);
  const get = (ext) => {
    const f = files.find((x) => x.endsWith(ext));
    return f ? fs.readFileSync(path.join(dir, f), 'utf8') : null;
  };
  return { files, html: get('.html'), md: get('.md'), json: get('.json') };
}

test('exports the session in full detail to html, md and json', () => {
  const dir = path.join(out, 'full');
  const r = cli(['-f', 'all', '--full', '-o', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Fixture session/);
  const { files, html, md, json } = outputs(dir);
  assert.ok(files.some((f) => f.endsWith('_files')), 'markdown image folder');

  // html
  for (const needle of [
    'Fixture session',
    'Pasted text',
    'TRACEBACK LINE',
    'THINKING-TEXT',
    'I will <strong>check</strong> it.',
    'echo hi',
    '<span class="da">+b</span>',
    'Subagent transcript',
    'SUBAGENT-REPLY',
    'Found <strong>x</strong> in y',
    'FULL-PERSISTED-OUTPUT',
    'data:image/png;base64,',
    'Conversation compacted',
    'COMPACT-SUMMARY-TEXT',
    '529 Overloaded',
    'sent while the agent was working',
    'QUEUED-PROMPT',
    '/model opus',
    'Set model to opus',
    'ENV-CONTEXT-TEXT',
    'You are a test system prompt.',
    '$1.23',
  ])
    assert.ok(html.includes(needle), `html has ${needle}`);
  assert.ok(!html.includes('DUPLICATE RECORD'), 'duplicate uuid skipped');
  assert.ok(!html.includes('__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'));
  assert.ok(!/<script[^>]+src=/.test(html) && !/<link[^>]+href="http/.test(html), 'no external resources');

  // markdown
  assert.match(md, /```diff\n@@ -1,1 \+1,1 @@\n-a\n\+b\n```/);
  assert.match(md, /!\[image 1\]\(.*_files\/image-001\.png\)/);
  assert.match(md, /<a id="p-1"><\/a>/);

  // json
  const data = JSON.parse(json);
  assert.equal(data.exporter.name, 'cc-exporter');
  assert.equal(data.meta.title, 'Fixture session');
  assert.equal(data.stats.toolCalls, 5);
  assert.equal(data.stats.prompts, 4); // typed prompt, queued prompt, /model, "Thanks"
  assert.equal(data.stats.assistantMessages, 3);
  assert.equal(data.stats.usage.output, 50 + 40 + 7, 'usage counted once per message');
  assert.equal(data.stats.subagents, 1);
  assert.equal(data.totals.usage.output, 50 + 40 + 7 + 9);
  const asst = data.events.find((e) => e.kind === 'assistant');
  assert.deepEqual(asst.blocks.map((b) => b.type), ['thinking', 'text', 'tool', 'tool']);
  const edit = asst.blocks.find((b) => b.name === 'Edit');
  assert.equal(edit.result.structured.originalFile, undefined, 'original file dropped');
  assert.equal(edit.durationMs, 2000);
});

test('--redact masks secrets, emails and the home path', () => {
  const dir = path.join(out, 'redact');
  const r = cli(['-f', 'all', '-o', dir, '--redact']);
  assert.equal(r.status, 0, r.stderr);
  for (const text of Object.values(outputs(dir)).filter((v) => typeof v === 'string')) {
    assert.ok(!text.includes(SECRET), 'secret removed');
    assert.ok(!text.includes('someone@example.com'), 'email removed');
    assert.ok(text.includes('[REDACTED:anthropic-key]'));
  }
});

test('conversation detail keeps prompts and replies only', () => {
  const dir = path.join(out, 'conv');
  const r = cli(['-d', 'conversation', '-f', 'md,html', '-o', dir]);
  assert.equal(r.status, 0, r.stderr);
  const { md, html } = outputs(dir);
  assert.ok(!md.includes('THINKING-TEXT') && !html.includes('THINKING-TEXT'));
  assert.ok(!md.includes('ENV-CONTEXT-TEXT'));
  assert.ok(!md.includes('used 2 tools') && md.includes('I will **check** it.'));
  assert.ok(md.includes('Done. Key was'));
});

test('session selection: id prefix, title words, list, errors', () => {
  assert.equal(cli(['1111', '-f', 'json', '-o', path.join(out, 'pfx')]).status, 0);
  assert.equal(cli(['Fixture', '-f', 'json', '-o', path.join(out, 'title')]).status, 0);
  const list = cli(['--list']);
  assert.equal(list.status, 0);
  assert.match(list.stdout, new RegExp(SID));
  const bad = cli(['no-such-session-words']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /No session matches/);
  const cur = cli(['-f', 'json', '-o', path.join(out, 'cur'), '--json'], { CLAUDE_CODE_SESSION_ID: SID });
  assert.equal(JSON.parse(cur.stdout).session.id, SID);
});

test('default output folder git-ignores itself', () => {
  const r = cli(['-f', 'json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(cwd, 'claude-exports', '.gitignore'), 'utf8').trim().split('\n').pop(), '*');
});

test('markdown is the only default format', () => {
  const dir = path.join(out, 'default-format');
  const r = cli(['-o', dir]);
  assert.equal(r.status, 0, r.stderr);
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
  assert.ok(files.some((f) => f.endsWith('.md')));
  assert.ok(!files.some((f) => f.endsWith('.html') || f.endsWith('.json')), files.join(', '));
});

test('thinking flags override the detail level', () => {
  const on = path.join(out, 'think-on');
  assert.equal(cli(['-d', 'conversation', '--thinking', '-o', on]).status, 0);
  assert.ok(outputs(on).md.includes('THINKING-TEXT'));
  const off = path.join(out, 'think-off');
  assert.equal(cli(['--no-thinking', '--full', '-f', 'md,json', '-o', off]).status, 0);
  const { md, json } = outputs(off);
  assert.ok(!md.includes('THINKING-TEXT'));
  assert.ok(!JSON.parse(json).events.some((e) => e.kind === 'assistant' && e.blocks.some((b) => b.type === 'thinking')));
  assert.ok(md.includes('echo hi'), 'tools stay');
});

test('a title query containing a slash is not mistaken for a path', () => {
  const r = cli(['Fixture/none', '-o', path.join(out, 'slash')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No session matches/);
});

test('relative --out resolves against the working folder', () => {
  const r = cli(['-o', 'rel-out', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.realpathSync(JSON.parse(r.stdout).outDir), fs.realpathSync(path.join(cwd, 'rel-out')));
});

test('helpers: fences survive huge outputs, markdown stays structural, JSONL edge cases parse', async () => {
  const { fence, mdSafe } = await import(pathToFileURL(path.join(ROOT, 'lib', 'util.mjs')).href);
  const many = '`x'.repeat(300000);
  assert.ok(fence(many).startsWith('``` '.trim()));
  assert.equal(fence('a ```` b').split('\n')[0], '`````');
  assert.equal(mdSafe('use <div> and </details> here `<b>` ok'), 'use &lt;div> and &lt;/details> here `<b>` ok');
  assert.equal(mdSafe('```\n<raw>\n```'), '```\n<raw>\n```');
  assert.equal(mdSafe('a < b and 3<4'), 'a < b and 3<4');

  const { readJsonl } = await import(pathToFileURL(path.join(ROOT, 'lib', 'parse.mjs')).href);
  const f = path.join(tmp, 'edge.jsonl');
  fs.writeFileSync(f, '{"a":1}\r\n\r\n{"type":"api-request-blob","x":1}\n{broken\n{"b":2}');
  const { records, bad } = readJsonl(f);
  assert.deepEqual(records, [{ a: 1 }, { b: 2 }]);
  assert.equal(bad, 1);
});

test('review fixes: unsafe media, outside saved-output paths, redaction, argument lines, code spans', async () => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, 'lib', f)).href);
  const { renderHtml } = await lib('render-html.mjs');
  const { renderMarkdown } = await lib('render-markdown.mjs');
  const evil = { type: 'image', mediaType: 'image/png', data: 'x" onerror="alert(1)', url: null };
  const model = {
    meta: { title: 't', file: 'f', sessionId: 's', models: [], versions: [], entrypoints: [], permissionModes: [], gitBranches: [], cwds: [] },
    stats: { prompts: 1, assistantMessages: 0, toolCalls: 0, toolErrors: 0, tools: {}, thinking: 0, thinkingRedacted: 0, images: 1, compactions: 0, apiErrors: 0, subagents: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, usageByModel: {} },
    events: [{ kind: 'user', ts: null, text: '/review `x`', parts: [{ type: 'text', text: '/review' }, evil, { type: 'json', value: { k: 1 } }], cls: { type: 'command', name: '/review', args: 'fix `foo()` now' }, origin: 'human' }],
    otherAgents: [],
  };
  const html = renderHtml(model);
  assert.ok(!html.includes('onerror'), 'malformed base64 never reaches an attribute');
  assert.ok(html.includes('malformed data'));
  assert.ok(!html.includes('[document: ]'));
  const md = renderMarkdown(model);
  assert.ok(md.includes('`` /review fix `foo()` now ``') || md.includes('``/review fix `foo()` now``'), 'backticks inside a command survive');
  assert.ok(md.includes('"k": 1'), 'json parts render as json');

  // a transcript pointing "saved output" at a file outside tool-results is not inlined
  const proj = path.join(config, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  const secretFile = path.join(tmp, 'not-a-tool-result.txt');
  fs.writeFileSync(secretFile, 'PRIVATE-KEY-MATERIAL');
  const sid2 = '99999999-2222-4333-8444-555555555555';
  fs.writeFileSync(
    path.join(proj, `${sid2}.jsonl`),
    [
      { type: 'user', uuid: 'x1', sessionId: sid2, cwd, timestamp: '2026-01-03T00:00:00Z', message: { role: 'user', content: 'read it' } },
      { type: 'assistant', uuid: 'x2', sessionId: sid2, timestamp: '2026-01-03T00:00:01Z', message: { id: 'msg_x', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_x', name: 'Read', input: { file_path: '/a' } }] } },
      { type: 'user', uuid: 'x3', sessionId: sid2, timestamp: '2026-01-03T00:00:02Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: `<persisted-output>\nFull output saved to: ${secretFile}\n</persisted-output>` }] } },
    ].map((l) => JSON.stringify(l)).join('\n'),
  );
  const dir = path.join(out, 'outside');
  assert.equal(cli([sid2, '-f', 'md', '--extended', '-o', dir]).status, 0);
  assert.ok(!outputs(dir).md.includes('PRIVATE-KEY-MATERIAL'));
  fs.rmSync(path.join(proj, `${sid2}.jsonl`));

  const { redactDeep, redactString } = await lib('redact.mjs');
  assert.match(JSON.stringify(redactDeep({ data: 'token=ghp_' + 'a'.repeat(36) })), /REDACTED/);
  const blob = 'QUJD'.repeat(100);
  assert.equal(redactDeep({ data: blob }).data, blob);
  assert.equal(redactString('C:\\Users\\Alice\\p c:/users/alice/q /c/Users/Alice/r C:\\Users\\Alicex', 'C:\\Users\\Alice'), '~\\p ~/q ~/r C:\\Users\\Alicex');
  assert.equal(redactString('/Users/bob/.claude/projects/-Users-bob-code-app/x.jsonl and -Users-bobby-z', '/Users/bob'), '~/.claude/projects/~-code-app/x.jsonl and -Users-bobby-z');

  // the slash command passes its arguments as one line; quotes and shell characters survive
  const r = cli(['--argline', 'Fixture -f json "-o" "' + path.join(out, 'argline dir') + '" --json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).files[0].format, 'json');
  const { splitArgs } = await lib('util.mjs');
  assert.deepEqual(splitArgs('Fixture -o "C:\\Users\\Me\\out dir" "say \\"hi\\"" plain\\path  “curly quotes”'), ['Fixture', '-o', 'C:\\Users\\Me\\out dir', 'say "hi"', 'plain\\path', 'curly quotes']);
  const amp = cli(['--argline', 'Q&A; $(whoami)']);
  assert.match(amp.stderr, /No session matches "Q&A; \$\(whoami\)"/);

  // hex-looking words are title searches, not id prefixes
  assert.match(cli(['cafe']).stderr, /No session matches "cafe"/);
});

test('the default export is only the conversation; --full brings everything back', () => {
  const dir = path.join(out, 'default-conv');
  const r = cli(['-f', 'md,html', '-o', dir]);
  assert.equal(r.status, 0, r.stderr);
  const { md, html } = outputs(dir);
  for (const text of [md, html]) {
    for (const said of ['Fix the bug please', 'TRACEBACK LINE', 'I will', 'check', 'Done. Key was', 'QUEUED-PROMPT', '/model opus', 'Thanks']) assert.ok(text.includes(said), `keeps ${said}`);
    for (const clutter of ['THINKING-TEXT', 'echo hi', '+b', 'SUBAGENT-REPLY', 'FULL-PERSISTED-OUTPUT', 'ENV-CONTEXT-TEXT', 'COMPACT-SUMMARY-TEXT', '529 Overloaded', 'Set model to opus', 'You are a test system prompt.', 'used 2 tools', 'Conversation compacted', 'data:image/png'])
      assert.ok(!text.includes(clutter), `drops ${clutter}`);
  }
  assert.ok(!md.includes('## Prompts') && !md.includes('Tokens'), 'lean header');
  const full = path.join(out, 'default-full');
  for (const flag of ['--full', '--extended', '-full', '-F']) {
    fs.rmSync(full, { recursive: true, force: true });
    assert.equal(cli(['-f', 'md', flag, '-o', full]).status, 0, flag);
    const fmd = outputs(full).md;
    assert.ok(fmd.includes('THINKING-TEXT') && fmd.includes('echo hi') && fmd.includes('SUBAGENT-REPLY') && fmd.includes('ENV-CONTEXT-TEXT'), `${flag} is full detail`);
  }
});

test('MCP server: initialize, list tools, call tools', async () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config, CODEX_HOME: codexHome };
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CODEX_THREAD_ID;
  const child = spawn(process.execPath, [SERVER], { cwd, env, stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = new Map();
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      replies.set(m.id, m);
    }
  });
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_sessions', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_session', arguments: { max_chars: 2000, detail: 'full' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'export_session', arguments: { formats: ['html'], output_dir: path.join(out, 'mcp') } } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'read_session', arguments: { session: 'nope-nope' } } },
  ];
  const exited = new Promise((r) => child.on('exit', r));
  for (const m of msgs) child.stdin.write(JSON.stringify(m) + '\n');
  child.stdin.end(); // the server must still answer everything, then exit by itself
  await Promise.race([exited, new Promise((r) => setTimeout(r, 15000))]);
  assert.equal(replies.get(1).result.serverInfo.name, 'cc-exporter');
  assert.deepEqual(replies.get(2).result.tools.map((t) => t.name), ['list_sessions', 'read_session', 'export_session']);
  assert.match(replies.get(3).result.content[0].text, new RegExp(SID));
  assert.match(replies.get(4).result.content[0].text, /# Fixture session/);
  assert.match(replies.get(4).result.content[0].text, /offset=2000/);
  assert.match(replies.get(5).result.content[0].text, /HTML\s+.*\.html/);
  assert.equal(replies.get(6).result.isError, true);
});
