// `unabridged setup` against a fake home folder: every config style it writes,
// backups, idempotence, files it must not touch, and --remove.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentTable, detectAgents, planSetup, applyPlan, writeMcp, skillText, launchSpec } from '../lib/setup.mjs';

let home;
const spec = { command: '/usr/bin/node', args: ['/opt/unabridged/bin/unabridged.mjs', 'mcp'], cli: '"/usr/bin/node" "/opt/unabridged/bin/unabridged.mjs"' };
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

before(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'unabridged-setup-'));
});
after(() => fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

for (const platform of ['darwin', 'linux', 'win32']) {
  test(`paths are platform-correct (${platform})`, () => {
    const t = agentTable({ home, env: { APPDATA: path.join(home, 'AppData', 'Roaming') }, platform });
    const vs = t.find((a) => a.id === 'vscode').mcp.file;
    const desk = t.find((a) => a.id === 'claude-desktop').mcp.file;
    if (platform === 'darwin') assert.ok(vs.includes(path.join('Library', 'Application Support', 'Code', 'User')) && desk.includes(path.join('Library', 'Application Support', 'Claude')));
    if (platform === 'linux') assert.ok(vs.includes(path.join('.config', 'Code', 'User')) && desk.includes(path.join('.config', 'Claude')));
    if (platform === 'win32') assert.ok(vs.includes(path.join('AppData', 'Roaming', 'Code', 'User')) && desk.includes(path.join('AppData', 'Roaming', 'Claude')));
    assert.equal(t.find((a) => a.id === 'codex').mcp.file, path.join(home, '.codex', 'config.toml'));
  });
}

test('writes each config style, keeps other servers, backs up once, and is idempotent', () => {
  const table = agentTable({ home, env: {}, platform: 'linux' });
  // pre-existing configs with someone else's server
  fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
  fs.writeFileSync(path.join(home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(home, '.codex', 'config.toml'), 'model = "gpt-x"\n\n[mcp_servers.other]\ncommand = "y"\n');
  fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
  fs.mkdirSync(path.join(home, '.copilot'), { recursive: true });
  fs.mkdirSync(path.join(home, '.config', 'Code', 'User'), { recursive: true });

  const agents = detectAgents(table, { pathEnv: '' }).filter((a) => ['cursor', 'codex', 'opencode', 'copilot-cli', 'vscode', 'claude-desktop', 'agents'].includes(a.id));
  const results = applyPlan(planSetup(agents, spec), spec);
  assert.ok(results.every((r) => !r.status.startsWith('failed')), JSON.stringify(results, null, 1));

  const cursor = readJson(path.join(home, '.cursor', 'mcp.json'));
  assert.deepEqual(cursor.mcpServers.unabridged, { command: spec.command, args: spec.args });
  assert.ok(cursor.mcpServers.other, 'other servers kept');
  assert.ok(fs.existsSync(path.join(home, '.cursor', 'mcp.json.unabridged.bak')), 'backup made');

  const toml = fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8');
  assert.match(toml, /model = "gpt-x"/);
  assert.match(toml, /\[mcp_servers\.other\]\ncommand = "y"/);
  assert.match(toml, /\[mcp_servers\.unabridged\]\ncommand = "\/usr\/bin\/node"\nargs = \["\/opt\/unabridged\/bin\/unabridged\.mjs", "mcp"\]/);

  assert.deepEqual(readJson(path.join(home, '.config', 'opencode', 'opencode.json')).mcp.unabridged, { type: 'local', command: [spec.command, ...spec.args], enabled: true });
  assert.deepEqual(readJson(path.join(home, '.copilot', 'mcp-config.json')).mcpServers.unabridged.tools, ['*']);
  assert.equal(readJson(path.join(home, '.config', 'Code', 'User', 'mcp.json')).servers.unabridged.type, 'stdio');
  assert.ok(readJson(path.join(home, '.config', 'Claude', 'claude_desktop_config.json')).mcpServers.unabridged);

  const skill = fs.readFileSync(path.join(home, '.agents', 'skills', 'export-transcripts', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: export-transcripts/);
  assert.ok(skill.includes(spec.cli), 'skill points at this install');
  assert.ok(!skill.includes('npx -y'), 'generic run instructions replaced');

  // second run changes nothing
  const again = applyPlan(planSetup(agents, spec), spec);
  assert.ok(again.filter((r) => r.step.startsWith('MCP')).every((r) => r.status === 'unchanged'), JSON.stringify(again, null, 1));
  // updating the command replaces the TOML block rather than adding a second one
  writeMcp(table.find((a) => a.id === 'codex').mcp, { ...spec, command: '/new/node' });
  const toml2 = fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8');
  assert.equal(toml2.split('[mcp_servers.unabridged]').length - 1, 1);
  assert.match(toml2, /command = "\/new\/node"/);
});

test('leaves JSONC files and foreign skills alone', () => {
  const t = agentTable({ home, env: {}, platform: 'linux' });
  const windsurf = t.find((a) => a.id === 'windsurf');
  fs.mkdirSync(path.dirname(windsurf.mcp.file), { recursive: true });
  const jsonc = '{\n  // my servers\n  "mcpServers": {}\n}\n';
  fs.writeFileSync(windsurf.mcp.file, jsonc);
  fs.mkdirSync(path.join(windsurf.skills, 'export-transcripts'), { recursive: true });
  fs.writeFileSync(path.join(windsurf.skills, 'export-transcripts', 'SKILL.md'), 'someone else');
  const results = applyPlan(planSetup(detectAgents([windsurf], { pathEnv: '' }), spec), spec);
  assert.match(results[0].status, /failed: .*isn't plain JSON/);
  assert.equal(fs.readFileSync(windsurf.mcp.file, 'utf8'), jsonc, 'commented file untouched');
  assert.match(results[1].status, /skipped/);
  assert.equal(fs.readFileSync(path.join(windsurf.skills, 'export-transcripts', 'SKILL.md'), 'utf8'), 'someone else');
});

test('--remove takes out only what setup added', () => {
  const table = agentTable({ home, env: {}, platform: 'linux' });
  const agents = detectAgents(table, { pathEnv: '' }).filter((a) => ['cursor', 'codex', 'agents'].includes(a.id));
  applyPlan(planSetup(agents, spec, { remove: true }), spec, { remove: true });
  const cursor = readJson(path.join(home, '.cursor', 'mcp.json'));
  assert.ok(!cursor.mcpServers.unabridged && cursor.mcpServers.other);
  const toml = fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8');
  assert.ok(!toml.includes('unabridged') && toml.includes('[mcp_servers.other]'));
  assert.ok(!fs.existsSync(path.join(home, '.agents', 'skills', 'export-transcripts')));
});

test('agents with a plugin system use their CLI when it is installed', () => {
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const c of ['claude', 'codex']) {
    const f = path.join(bin, process.platform === 'win32' ? `${c}.cmd` : c);
    fs.writeFileSync(f, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\nexit 0\n');
    fs.chmodSync(f, 0o755);
  }
  const t = detectAgents(agentTable({ home, env: {}, platform: process.platform }), { pathEnv: bin });
  const plan = planSetup(t.filter((a) => a.id === 'claude-code' || a.id === 'codex'), spec);
  const runs = plan.flatMap((p) => p.steps.map((s) => s.label));
  assert.ok(runs.includes('plugin install unabridged@unabridged'));
  assert.ok(runs.includes('plugin add unabridged@unabridged'));
  assert.ok(runs.includes('plugin marketplace add saieeshb/unabridged'));
  assert.ok(!plan.some((p) => p.steps.some((s) => s.kind === 'mcp')), 'no config edits when the plugin route is used');
  assert.ok(skillText(spec).includes(spec.cli));
});

test('launch paths survive upgrades: Homebrew opt link, npx copies pinned', () => {
  const prefix = path.join(home, 'brew');
  const cellar = path.join(prefix, 'Cellar', 'unabridged', '0.2.0', 'libexec');
  fs.mkdirSync(cellar, { recursive: true });
  fs.mkdirSync(path.join(prefix, 'opt', 'unabridged'), { recursive: true });
  const brew = launchSpec({ root: cellar, pathEnv: '', tmpdir: path.join(home, 'not-tmp') });
  assert.equal(brew.args[0], path.join(prefix, 'opt', 'unabridged', 'libexec', 'bin', 'unabridged.mjs'));
  const npx = launchSpec({ root: path.join(home, '.npm', '_npx', 'abc', 'node_modules', 'unabridged'), pathEnv: '' });
  assert.equal(npx.command, 'npx');
  assert.match(npx.args[1], /archive\/refs\/tags\/v\d+\.\d+\.\d+\.tar\.gz$/);
});
