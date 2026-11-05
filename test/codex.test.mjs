// Codex sessions: a synthetic CODEX_HOME with one thread, a spawned subagent and an
// approval review, exported through the CLI and the MCP server.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin', 'unabridged.mjs');
const MAIN = '01a20000-1111-7222-8333-444455556666';
const CHILD = '01a20000-2222-7222-8333-444455556666';
const GUARD = '01a20000-3333-7222-8333-444455556666';
let tmp, codexHome, claudeHome, cwd, out;

const rec = (ordinal, type, payload, extra = {}) => JSON.stringify({ timestamp: `2026-01-02T10:00:${String(ordinal).padStart(2, '0')}.000Z`, ordinal, type, payload, ...extra });
const msg = (role, text, provenance, kind) => ({
  type: 'message',
  role,
  content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }],
  internal_chat_message_metadata_passthrough: provenance ? { content_item_kinds: [kind ?? 'user.text'], content_item_metadata: [{ provenance: { type: provenance } }] } : {},
});

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unabridged-codex-'));
  codexHome = path.join(tmp, 'codex');
  claudeHome = path.join(tmp, 'claude');
  cwd = path.join(tmp, 'work');
  out = path.join(tmp, 'out');
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(path.join(claudeHome, 'projects'), { recursive: true });
  const day = path.join(codexHome, 'sessions', '2026', '01', '02');
  fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'session_index.jsonl'), JSON.stringify({ id: MAIN, thread_name: 'Codex fixture thread', updated_at: '2026-01-02T10:01:00Z' }) + '\n');

  const main = [
    rec(0, 'session_meta', { id: MAIN, cwd, cli_version: '9.9.9', originator: 'codex_cli_rs', thread_source: 'user', source: 'cli', base_instructions: 'CODEX-BASE-INSTRUCTIONS' }),
    rec(1, 'turn_context', { model: 'gpt-test', cwd, approval_policy: 'never', sandbox_policy: { type: 'workspace-write' }, collaboration_mode: { settings: { reasoning_effort: 'high' } } }),
    rec(2, 'response_item', msg('user', '<environment_context><cwd>/x</cwd></environment_context>', 'harness', 'environments.environment_context')),
    rec(3, 'response_item', msg('user', 'Please add a README', 'user')),
    rec(4, 'response_item', { type: 'reasoning', summary: [{ type: 'summary_text', text: 'CODEX-REASONING-SUMMARY' }], encrypted_content: 'gAAAA' }),
    rec(5, 'response_item', { type: 'reasoning', summary: [], encrypted_content: 'gAAAA' }),
    rec(6, 'response_item', { ...msg('assistant', 'Looking at the repo first.'), phase: 'commentary' }),
    rec(7, 'response_item', { type: 'custom_tool_call', name: 'exec', call_id: 'c1', input: 'text(await tools.exec_command({cmd:"ls"}))' }),
    rec(8, 'response_item', { type: 'custom_tool_call_output', call_id: 'c1', output: [{ type: 'input_text', text: 'README-MISSING-OUTPUT' }] }),
    rec(9, 'response_item', { type: 'custom_tool_call', name: 'exec', call_id: 'c2', input: 'boom()' }),
    rec(10, 'response_item', { type: 'custom_tool_call_output', call_id: 'c2', output: [{ type: 'input_text', text: 'Script failed\nboom is not defined' }] }),
    rec(11, 'response_item', { type: 'function_call', namespace: 'collaboration', name: 'spawn_agent', call_id: 'c3', arguments: JSON.stringify({ task_name: 'helper', message: 'gAAAA' }) }),
    rec(12, 'response_item', { type: 'function_call_output', call_id: 'c3', output: '{"agent_path":"/root/helper"}' }),
    rec(13, 'token_usage_record', { response_id: 'resp_1', usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 70, cache_write_input_tokens: 5 } }),
    rec(14, 'compacted', { message: 'CODEX-COMPACT-SUMMARY', replacement_history: [] }),
    rec(15, 'response_item', { ...msg('assistant', 'Added README.md with setup steps.'), phase: 'final_answer' }),
    rec(16, 'token_usage_record', { response_id: 'resp_2', usage: { input_tokens: 500, cached_input_tokens: 0, output_tokens: 30 } }),
    rec(17, 'event_msg', { type: 'task_complete', duration_ms: 4200 }),
    rec(18, 'event_msg', { type: 'turn_aborted', reason: 'interrupted' }),
  ];
  fs.writeFileSync(path.join(day, `rollout-2026-01-02T10-00-00-${MAIN}.jsonl`), main.join('\n') + '\n');

  const child = [
    rec(0, 'session_meta', { id: MAIN, cwd }), // a fork copies its parent's meta first
    rec(1, 'session_meta', { id: CHILD, cwd, thread_source: 'subagent', agent_nickname: 'Hume', agent_path: '/root/helper', source: { subagent: { thread_spawn: { parent_thread_id: MAIN, depth: 1, agent_path: '/root/helper', agent_nickname: 'Hume' } } } }),
    rec(2, 'response_item', msg('user', 'Please add a README', 'user'), { metadata: { inherited_user_message: true } }),
    rec(3, 'response_item', { ...msg('assistant', 'CHILD-AGENT-REPLY'), phase: 'final_answer' }),
  ];
  fs.writeFileSync(path.join(day, `rollout-2026-01-02T10-00-05-${CHILD}.jsonl`), child.join('\n') + '\n');

  const guard = [
    rec(0, 'session_meta', { id: GUARD, cwd, thread_source: 'guardian_review', parent_thread_id: MAIN, source: { subagent: { other: 'guardian' } } }),
    rec(1, 'response_item', msg('user', 'Assess this action', 'user')),
    rec(2, 'response_item', { ...msg('assistant', 'GUARDIAN-VERDICT'), phase: 'final_answer' }),
  ];
  fs.writeFileSync(path.join(day, `rollout-2026-01-02T10-00-06-${GUARD}.jsonl`), guard.join('\n') + '\n');
});

after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

function run(args, extra = {}) {
  const env = { ...process.env, CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome, ...extra };
  for (const k of ['CLAUDE_CODE_SESSION_ID', 'CODEX_THREAD_ID']) if (!(k in extra)) delete env[k];
  return spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
}
const read = (dir, ext) => fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(ext))), 'utf8');

test('lists only threads a person started, with their titles', () => {
  const r = run(['--list', '--from', 'codex']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Codex fixture thread/);
  assert.ok(!r.stdout.includes(CHILD) && !r.stdout.includes(GUARD), 'subagents and reviews are not listed');
});

test('default export is the conversation only', () => {
  const dir = path.join(out, 'conv');
  const r = run([MAIN.slice(0, 8), '-f', 'md,html', '-o', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Codex session/);
  for (const text of [read(dir, '.md'), read(dir, '.html')]) {
    assert.ok(text.includes('Please add a README') && text.includes('Looking at the repo first.') && text.includes('Added README.md with setup steps.'));
    for (const clutter of ['environment_context', 'CODEX-REASONING-SUMMARY', 'README-MISSING-OUTPUT', 'CHILD-AGENT-REPLY', 'GUARDIAN-VERDICT', 'CODEX-COMPACT-SUMMARY', 'CODEX-BASE-INSTRUCTIONS'])
      assert.ok(!text.includes(clutter), `drops ${clutter}`);
  }
  assert.match(read(dir, '.md'), /🤖 Codex/);
});

test('--full keeps reasoning, tools, subagents, reviews and context', () => {
  const dir = path.join(out, 'full');
  const r = run([MAIN, '--full', '-f', 'md,json', '-o', dir]);
  assert.equal(r.status, 0, r.stderr);
  const md = read(dir, '.md');
  for (const want of ['CODEX-REASONING-SUMMARY', 'README-MISSING-OUTPUT', 'boom is not defined', 'CHILD-AGENT-REPLY', 'GUARDIAN-VERDICT', 'CODEX-COMPACT-SUMMARY', 'Environment', 'model_reasoning_summary'])
    assert.ok(md.includes(want), `has ${want}`);
  assert.equal(md.split('Please add a README').length - 1, 1, "the subagent's inherited copy of the prompt is skipped");
  const data = JSON.parse(read(dir, '.json'));
  assert.equal(data.meta.source, 'codex');
  assert.equal(data.meta.title, 'Codex fixture thread');
  assert.equal(data.stats.toolCalls, 3);
  assert.equal(data.stats.toolErrors, 1);
  assert.equal(data.stats.subagents, 1);
  assert.equal(data.stats.thinking, 2);
  assert.equal(data.stats.thinkingRedacted, 1);
  assert.equal(data.stats.usage.output, 100);
  assert.equal(data.stats.usage.input, 700);
  assert.equal(data.stats.usage.cacheRead, 800);
  assert.equal(data.otherAgents.length, 1, 'approval review kept separately');
});

test('CODEX_THREAD_ID makes "current" the Codex thread', () => {
  const r = run(['-f', 'json', '-o', path.join(out, 'cur'), '--json'], { CODEX_THREAD_ID: MAIN });
  assert.equal(r.status, 0, r.stderr);
  const res = JSON.parse(r.stdout);
  assert.equal(res.session.id, MAIN);
  assert.equal(res.session.source, 'codex');
});

test('MCP server: a Codex client sees Codex sessions', async () => {
  const env = { ...process.env, CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome };
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CODEX_THREAD_ID;
  const child = spawn(process.execPath, [BIN, 'mcp'], { cwd, env, stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = new Map();
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (m.id != null) replies.set(m.id, m);
    }
  });
  const exited = new Promise((r) => child.on('exit', r));
  for (const m of [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex-mcp-client', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_sessions', arguments: {} } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_session', arguments: { session: 'latest' } } },
  ])
    child.stdin.write(JSON.stringify(m) + '\n');
  child.stdin.end();
  await Promise.race([exited, new Promise((r) => setTimeout(r, 15000))]);
  assert.match(replies.get(2).result.content[0].text, /Codex — Codex fixture thread/);
  assert.match(replies.get(3).result.content[0].text, /Added README\.md with setup steps\./);
});
