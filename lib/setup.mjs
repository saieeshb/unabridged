// `unabridged setup`: register the MCP server and the export skill with the
// coding agents installed on this computer.
//
// Agents with their own plugin system (Claude Code, Codex, Gemini CLI) get the
// plugin or extension through their CLI. The rest get an MCP entry in their
// config file and the skill in their skills folder. Every file we change is
// backed up first (<file>.unabridged.bak), and --remove undoes it all.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from './util.mjs';

export const NAME = 'unabridged';
export const REPO = 'saieeshb/unabridged';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_NAME = 'export-transcripts';
const MARKER = '.unabridged';

export const tarballUrl = (v = VERSION) => `https://github.com/${REPO}/archive/refs/tags/v${v}.tar.gz`;

/** Find an executable on PATH (with PATHEXT on Windows). */
export function which(cmd, { pathEnv = process.env.PATH ?? '', platform = process.platform } = {}) {
  const exts = platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase()) : [''];
  for (const dir of pathEnv.split(platform === 'win32' ? ';' : ':')) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, cmd + ext);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

/**
 * How agents should start unabridged. A stable install (git checkout, curl or
 * PowerShell installer, Homebrew) is launched in place with an absolute node
 * path, since GUI apps often lack the shell's PATH. A throwaway npx copy is
 * replaced by a pinned npx command.
 */
export function launchSpec({ root = ROOT, pathEnv = process.env.PATH, tmpdir = os.tmpdir() } = {}) {
  // Homebrew installs into a versioned Cellar folder that the next upgrade deletes; its opt/ link is stable.
  const cellar = root.match(/^(.*)[\\/]Cellar[\\/]([^\\/]+)[\\/][^\\/]+[\\/]libexec$/);
  if (cellar && exists(path.join(cellar[1], 'opt', cellar[2]))) root = path.join(cellar[1], 'opt', cellar[2], 'libexec');
  const ephemeral = /[\\/](_npx|_cacache|npm-cache)[\\/]/.test(root) || root.startsWith(path.resolve(tmpdir) + path.sep);
  if (!ephemeral) {
    const node = which('node', { pathEnv }) ?? process.execPath;
    const entry = path.join(root, 'bin', 'unabridged.mjs');
    return { command: node, args: [entry, 'mcp'], cli: `"${node}" "${entry}"` };
  }
  return { command: 'npx', args: ['-y', tarballUrl(), 'mcp'], cli: `npx -y ${tarballUrl()}` };
}

/** Every agent we know how to set up, with paths for this computer. */
export function agentTable({ home = os.homedir(), env = process.env, platform = process.platform } = {}) {
  const win = platform === 'win32';
  const mac = platform === 'darwin';
  const p = (...x) => path.join(home, ...x);
  const appData = env.APPDATA || p('AppData', 'Roaming');
  const xdg = env.XDG_CONFIG_HOME || p('.config');
  const vscodeUser = mac ? p('Library', 'Application Support', 'Code', 'User') : win ? path.join(appData, 'Code', 'User') : path.join(xdg, 'Code', 'User');
  const claudeDesktop = mac ? p('Library', 'Application Support', 'Claude') : win ? path.join(appData, 'Claude') : path.join(xdg, 'Claude');
  const codexHome = env.CODEX_HOME || p('.codex');
  const copilotHome = env.COPILOT_HOME || p('.copilot');
  const zedDir = mac ? p('Library', 'Application Support', 'Zed') : win ? path.join(appData, 'Zed') : path.join(xdg, 'zed');
  const opencodeDir = path.join(xdg, 'opencode');
  const opencodeFile = fs.existsSync(path.join(opencodeDir, 'opencode.jsonc')) && !fs.existsSync(path.join(opencodeDir, 'opencode.json')) ? path.join(opencodeDir, 'opencode.jsonc') : path.join(opencodeDir, 'opencode.json');
  const cline = path.join(vscodeUser, 'globalStorage', 'saoudrizwan.claude-dev');
  return [
    { id: 'claude-code', name: 'Claude Code', cli: 'claude', detect: [p('.claude')], plugin: 'claude', skills: p('.claude', 'skills') },
    { id: 'codex', name: 'Codex', cli: 'codex', detect: [codexHome], plugin: 'codex', mcp: { file: path.join(codexHome, 'config.toml'), style: 'codex-toml' }, skills: p('.agents', 'skills') },
    { id: 'gemini-cli', name: 'Gemini CLI', cli: 'gemini', detect: [p('.gemini', 'settings.json')], plugin: 'gemini', mcp: { file: p('.gemini', 'settings.json'), style: 'mcpServers' }, skills: p('.gemini', 'skills') },
    { id: 'cursor', name: 'Cursor', detect: [p('.cursor')], mcp: { file: p('.cursor', 'mcp.json'), style: 'mcpServers' }, skills: p('.cursor', 'skills') },
    { id: 'vscode', name: 'VS Code (Copilot)', detect: [vscodeUser], mcp: { file: path.join(vscodeUser, 'mcp.json'), style: 'vscode' }, skills: path.join(copilotHome, 'skills') },
    { id: 'copilot-cli', name: 'GitHub Copilot CLI', cli: 'copilot', detect: [copilotHome], mcp: { file: path.join(copilotHome, 'mcp-config.json'), style: 'copilot' }, skills: path.join(copilotHome, 'skills') },
    { id: 'windsurf', name: 'Windsurf', detect: [p('.codeium', 'windsurf')], mcp: { file: p('.codeium', 'windsurf', 'mcp_config.json'), style: 'mcpServers' }, skills: p('.codeium', 'windsurf', 'skills') },
    { id: 'claude-desktop', name: 'Claude Desktop', detect: [claudeDesktop], mcp: { file: path.join(claudeDesktop, 'claude_desktop_config.json'), style: 'mcpServers' } },
    { id: 'antigravity', name: 'Antigravity', detect: [p('.gemini', 'antigravity')], mcp: { file: p('.gemini', 'config', 'mcp_config.json'), style: 'mcpServers' }, skills: p('.gemini', 'antigravity', 'skills') },
    { id: 'opencode', name: 'OpenCode', cli: 'opencode', detect: [opencodeDir], mcp: { file: opencodeFile, style: 'opencode' }, skills: path.join(opencodeDir, 'skills') },
    { id: 'kiro', name: 'Kiro', detect: [p('.kiro')], mcp: { file: p('.kiro', 'settings', 'mcp.json'), style: 'mcpServers' }, skills: p('.kiro', 'skills') },
    { id: 'qwen-code', name: 'Qwen Code', cli: 'qwen', detect: [p('.qwen')], mcp: { file: p('.qwen', 'settings.json'), style: 'mcpServers' }, skills: p('.qwen', 'skills') },
    { id: 'droid', name: 'Factory Droid', detect: [p('.factory')], mcp: { file: p('.factory', 'mcp.json'), style: 'mcpServers-stdio' }, skills: p('.factory', 'skills') },
    { id: 'cline', name: 'Cline', detect: [cline], mcp: { file: path.join(cline, 'settings', 'cline_mcp_settings.json'), style: 'mcpServers' }, skills: p('.agents', 'skills') },
    { id: 'goose', name: 'Goose', cli: 'goose', detect: [path.join(xdg, 'goose')], manual: 'goose', skills: path.join(xdg, 'goose', 'skills') },
    { id: 'zed', name: 'Zed', detect: [zedDir], manual: 'zed' },
    { id: 'agents', name: 'Other agents (~/.agents/skills)', detect: [p('.agents')], skills: p('.agents', 'skills') },
  ];
}

const exists = (f) => {
  try {
    fs.accessSync(f);
    return true;
  } catch {
    return false;
  }
};

export function detectAgents(table, { pathEnv } = {}) {
  return table.map((a) => ({ ...a, found: a.detect.some(exists) || !!(a.cli && which(a.cli, { pathEnv })), cliPath: a.cli ? which(a.cli, { pathEnv }) : null }));
}

// ── config file writers ───────────────────────────────────────────────

function readJson(file) {
  if (!exists(file)) return { data: {}, existed: false };
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return { data: {}, existed: true };
  try {
    return { data: JSON.parse(text), existed: true };
  } catch {
    throw new Error(`${file} isn't plain JSON (comments or trailing commas), so it was left alone.`);
  }
}

function backup(file, done) {
  if (!exists(file) || done.has(file)) return;
  fs.copyFileSync(file, `${file}.unabridged.bak`);
  done.add(file);
}

function writeFile(file, text, backups) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  backup(file, backups);
  fs.writeFileSync(file, text);
}

function entryFor(style, spec) {
  switch (style) {
    case 'vscode':
    case 'mcpServers-stdio':
      return { type: 'stdio', command: spec.command, args: spec.args };
    case 'copilot':
      return { type: 'local', command: spec.command, args: spec.args, tools: ['*'] };
    case 'opencode':
      return { type: 'local', command: [spec.command, ...spec.args], enabled: true };
    default:
      return { command: spec.command, args: spec.args };
  }
}

function serverMap(data, style) {
  if (style === 'vscode') return (data.servers ??= {});
  if (style === 'opencode') {
    data.mcp ??= {};
    return data.mcp.servers && typeof data.mcp.servers === 'object' ? data.mcp.servers : data.mcp;
  }
  return (data.mcpServers ??= {});
}

const tomlStr = (s) => JSON.stringify(String(s));
const TOML_BLOCK = new RegExp(`^\\[mcp_servers\\.${NAME}\\][^\\n]*\\n(?:(?!\\[)[^\\n]*(?:\\n|$))*`, 'm');

export function writeMcp(mcp, spec, { remove = false, backups = new Set() } = {}) {
  if (mcp.style === 'codex-toml') {
    const text = exists(mcp.file) ? fs.readFileSync(mcp.file, 'utf8') : '';
    let next = text.replace(TOML_BLOCK, '').replace(/\n{3,}/g, '\n\n');
    if (!remove) next = `${next.replace(/\s*$/, '')}${next.trim() ? '\n\n' : ''}[mcp_servers.${NAME}]\ncommand = ${tomlStr(spec.command)}\nargs = [${spec.args.map(tomlStr).join(', ')}]\n`;
    if (next === text) return 'unchanged';
    writeFile(mcp.file, next, backups);
    return remove ? 'removed' : 'written';
  }
  const { data, existed } = readJson(mcp.file);
  if (remove && !existed) return 'unchanged';
  const map = serverMap(data, mcp.style);
  const before = JSON.stringify(map[NAME] ?? null);
  if (remove) delete map[NAME];
  else map[NAME] = entryFor(mcp.style, spec);
  if (JSON.stringify(map[NAME] ?? null) === before) return 'unchanged';
  writeFile(mcp.file, JSON.stringify(data, null, 2) + '\n', backups);
  return remove ? 'removed' : 'written';
}

/** The skill, with its "how to run" block pointing at this install. */
export function skillText(spec, { root = ROOT } = {}) {
  const src = fs.readFileSync(path.join(root, 'skills', SKILL_NAME, 'SKILL.md'), 'utf8');
  return src.replace(/<!-- unabridged:run -->[\s\S]*?<!-- \/unabridged:run -->/, `<!-- unabridged:run -->\nRun it with:\n\n\`\`\`bash\n${spec.cli}\n\`\`\`\n<!-- /unabridged:run -->`);
}

export function writeSkill(dir, spec, { remove = false } = {}) {
  const target = path.join(dir, SKILL_NAME);
  const ours = exists(path.join(target, MARKER));
  if (remove) {
    if (!ours) return 'unchanged';
    fs.rmSync(target, { recursive: true, force: true });
    return 'removed';
  }
  if (exists(target) && !ours) return 'skipped: a different export-transcripts skill is already there';
  fs.mkdirSync(target, { recursive: true });
  const text = skillText(spec);
  const file = path.join(target, 'SKILL.md');
  if (exists(file) && fs.readFileSync(file, 'utf8') === text) return 'unchanged';
  fs.writeFileSync(file, text);
  fs.writeFileSync(path.join(target, MARKER), `Installed by unabridged ${VERSION}. \`unabridged setup --remove\` deletes this folder.\n`);
  return 'written';
}

// ── plans ─────────────────────────────────────────────────────────────

function pluginCommands(agent, remove) {
  const bin = agent.cliPath ?? agent.cli;
  if (agent.plugin === 'claude')
    return remove
      ? [[bin, 'plugin', 'uninstall', `${NAME}@${NAME}`]]
      : [[bin, 'plugin', 'marketplace', 'add', REPO], [bin, 'plugin', 'marketplace', 'update', NAME], [bin, 'plugin', 'install', `${NAME}@${NAME}`]];
  if (agent.plugin === 'codex')
    return remove
      ? [[bin, 'plugin', 'remove', `${NAME}@${NAME}`]]
      : [[bin, 'plugin', 'marketplace', 'add', REPO], [bin, 'plugin', 'marketplace', 'upgrade', NAME], [bin, 'plugin', 'add', `${NAME}@${NAME}`]];
  if (agent.plugin === 'gemini') return remove ? [[bin, 'extensions', 'uninstall', NAME]] : [[bin, 'extensions', 'install', `https://github.com/${REPO}`, '--consent']];
  return [];
}

export function manualSnippet(agent, spec) {
  if (agent.manual === 'goose')
    return `Add to ~/.config/goose/config.yaml:\n\nextensions:\n  ${NAME}:\n    type: stdio\n    cmd: ${JSON.stringify(spec.command)}\n    args: [${spec.args.map((a) => JSON.stringify(a)).join(', ')}]\n    enabled: true`;
  if (agent.manual === 'zed') return `Add to Zed's settings.json:\n\n"context_servers": {\n  "${NAME}": { "command": ${JSON.stringify(spec.command)}, "args": ${JSON.stringify(spec.args)} }\n}`;
  return '';
}

/**
 * What setup would do for each chosen agent.
 * @returns {{agent, steps: {kind: 'cli'|'mcp'|'skill'|'manual', label: string, run?: string[], file?: string, dir?: string, text?: string}[]}[]}
 */
export function planSetup(agents, spec, { remove = false, skills = true, plugins = true } = {}) {
  return agents.map((agent) => {
    const steps = [];
    const usePlugin = plugins && agent.plugin && agent.cliPath;
    if (usePlugin) {
      for (const run of pluginCommands(agent, remove)) steps.push({ kind: 'cli', label: run.slice(1).join(' '), run, optional: run.includes('update') || run.includes('upgrade') || (run.includes('add') && run.includes(REPO)) });
    } else if (agent.plugin === 'claude') {
      steps.push({ kind: 'manual', label: 'Claude Code CLI not found', text: `In Claude Code, run:\n/plugin marketplace add ${REPO}\n/plugin install ${NAME}@${NAME}` });
    }
    if (!usePlugin && agent.mcp) steps.push({ kind: 'mcp', label: `MCP server in ${agent.mcp.file}`, file: agent.mcp.file });
    if (!usePlugin && skills && agent.skills) steps.push({ kind: 'skill', label: `skill in ${path.join(agent.skills, SKILL_NAME)}`, dir: agent.skills });
    if (agent.manual && !remove) steps.push({ kind: 'manual', label: 'add by hand', text: manualSnippet(agent, spec) });
    return { agent, steps };
  });
}

function runCli(run) {
  const r = spawnSync(run[0], run.slice(1), { encoding: 'utf8', shell: process.platform === 'win32', timeout: 180000 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  return { ok: r.status === 0 || /already (installed|added|exists|configured)/i.test(out), out: out.split('\n').slice(-2).join(' ') || `exit code ${r.status ?? r.error?.code ?? '?'}` };
}

/** Carry out a plan. Returns one line per step. */
export function applyPlan(plan, spec, { remove = false } = {}) {
  const backups = new Set();
  const results = [];
  const skillDirsDone = new Set();
  for (const { agent, steps } of plan) {
    for (const s of steps) {
      let status;
      try {
        if (s.kind === 'cli') {
          const r = runCli(s.run);
          status = r.ok ? 'done' : s.optional ? 'skipped (already set up)' : `failed: ${r.out}`;
        } else if (s.kind === 'mcp') status = writeMcp(agent.mcp, spec, { remove, backups });
        else if (s.kind === 'skill') {
          if (skillDirsDone.has(s.dir)) status = 'shared with another agent';
          else {
            status = writeSkill(s.dir, spec, { remove });
            skillDirsDone.add(s.dir);
          }
        } else status = 'manual';
      } catch (e) {
        status = `failed: ${e.message}`;
      }
      results.push({ agent: agent.name, step: s.label, status, text: s.text });
    }
  }
  return results;
}
