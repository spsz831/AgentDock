import fs from 'node:fs/promises';
import path from 'node:path';
import {
  collectSecrets,
  maskSecret,
  secretKeyName,
  type FoundSecret,
} from './sensitive';
import type { AgentDomain, DomainEntry, SecretEntry } from '../manifest/types';

export interface ScanResult {
  domain: AgentDomain;
  secrets: SecretEntry[];
  /** Run-state paths that were deliberately skipped (never exported). */
  skipped: string[];
  notes: string[];
}

/**
 * Directories/files that are runtime state, not definitions. They are never
 * scanned or exported — even with `--include-secrets`.
 */
export const RUN_STATE_NAMES = new Set([
  'auth.json',
  '.credentials.json',
  'logs.sqlite',
  'history.sqlite',
  'cache',
  'goals',
  'projects',
]);

const HOOK_EXTENSIONS = ['.ps1', '.sh', '.js', '.ts', '.py'];

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function recordSecrets(
  node: unknown,
  basePath: string,
  agent: string,
  secrets: SecretEntry[],
): void {
  const found: FoundSecret[] = [];
  collectSecrets(node, basePath, found);
  const seen = new Set<string>();
  for (const item of found) {
    if (seen.has(item.jsonPath)) {
      continue;
    }
    seen.add(item.jsonPath);
    secrets.push({
      key: secretKeyName(agent, item.jsonPath),
      source: item.jsonPath,
      sample: maskSecret(item.value),
    });
  }
}

async function collectHookScripts(hooksDir: string, skipped: string[]): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (RUN_STATE_NAMES.has(entry.name)) {
          skipped.push(full);
          continue;
        }
        await walk(full);
      } else if (HOOK_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        out.push(full);
      }
    }
  }
  await walk(hooksDir);
  return out;
}

type DomainKey = keyof AgentDomain;

function pushEntry(domain: AgentDomain, key: DomainKey, entry: DomainEntry): void {
  domain[key].push(entry);
}

/**
 * Scan a Claude Code environment rooted at `homeDir` (~).
 * Discovers mcp / skills / agents / plugins / hooks / memory / settings,
 * isolates secrets, and skips run-state.
 */
export async function scanClaude(homeDir: string): Promise<ScanResult> {
  const claudeDir = path.join(homeDir, '.claude');
  const claudeJsonPath = path.join(homeDir, '.claude.json');
  const domain: AgentDomain = {
    mcp: [],
    skills: [],
    agents: [],
    plugins: [],
    hooks: [],
    memory: [],
    settings: [],
  };
  const secrets: SecretEntry[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];

  // settings.json (mixed definitions + possibly tokens in `env`)
  const settingsPath = path.join(claudeDir, 'settings.json');
  if (await exists(settingsPath)) {
    pushEntry(domain, 'settings', {
      id: 'claude-settings',
      kind: 'settings',
      path: settingsPath,
      ref: 'settings.json',
    });
    try {
      const obj = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
      recordSecrets(obj, settingsPath, 'claude', secrets);
    } catch {
      notes.push('settings.json 解析失败，仅记录路径');
    }
  }

  // .claude.json → mcpServers
  if (await exists(claudeJsonPath)) {
    try {
      const obj = JSON.parse(await fs.readFile(claudeJsonPath, 'utf8')) as {
        mcpServers?: Record<string, unknown>;
      };
      const mcpServers = obj.mcpServers ?? {};
      for (const [name, definition] of Object.entries(mcpServers)) {
        pushEntry(domain, 'mcp', {
          id: `mcp-${name}`,
          kind: 'mcp',
          path: claudeJsonPath,
          ref: `.claude.json#mcpServers.${name}`,
        });
        recordSecrets(definition, `${claudeJsonPath}#mcpServers.${name}`, 'claude', secrets);
      }
    } catch {
      notes.push('.claude.json 解析失败，跳过 MCP 提取');
    }
  }

  // skills/* (directories containing SKILL.md)
  const skillsDir = path.join(claudeDir, 'skills');
  if (await exists(skillsDir)) {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        pushEntry(domain, 'skills', {
          id: `skill-${entry.name}`,
          kind: 'skill',
          path: path.join(skillsDir, entry.name),
        });
      }
    }
  }

  // agents/*.md
  const agentsDir = path.join(claudeDir, 'agents');
  if (await exists(agentsDir)) {
    const files = await fs.readdir(agentsDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        pushEntry(domain, 'agents', {
          id: `agent-${file.replace(/\.md$/, '')}`,
          kind: 'agent',
          path: path.join(agentsDir, file),
        });
      }
    }
  }

  // plugins (registry files only)
  const pluginsDir = path.join(claudeDir, 'plugins');
  if (await exists(pluginsDir)) {
    for (const file of ['installed_plugins.json', 'known_marketplaces.json']) {
      const pluginPath = path.join(pluginsDir, file);
      if (await exists(pluginPath)) {
        pushEntry(domain, 'plugins', {
          id: `plugin-${file.replace(/\.json$/, '')}`,
          kind: 'plugin',
          path: pluginPath,
        });
      }
    }
  }

  // hooks/* (scripts)
  const hooksDir = path.join(claudeDir, 'hooks');
  if (await exists(hooksDir)) {
    const scripts = await collectHookScripts(hooksDir, skipped);
    for (const script of scripts) {
      pushEntry(domain, 'hooks', {
        id: `hook-${path.basename(script)}`,
        kind: 'hook',
        path: script,
      });
    }
  }

  // memory (CLAUDE.md family)
  for (const file of ['CLAUDE.md', 'CLAUDE.local.md']) {
    const memoryPath = path.join(claudeDir, file);
    if (await exists(memoryPath)) {
      pushEntry(domain, 'memory', {
        id: `memory-${file.replace(/\.md$/, '')}`,
        kind: 'memory',
        path: memoryPath,
      });
    }
  }

  return { domain, secrets, skipped, notes };
}
