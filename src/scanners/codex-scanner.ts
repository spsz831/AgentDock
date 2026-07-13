import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import {
  collectSecrets,
  maskSecret,
  secretKeyName,
  type FoundSecret,
} from './sensitive';
import { RUN_STATE_NAMES } from './claude-scanner';
import type { AgentDomain, DomainEntry, SecretEntry } from '../manifest/types';

export interface ScanResult {
  domain: AgentDomain;
  secrets: SecretEntry[];
  /** Run-state paths that were deliberately skipped (never exported). */
  skipped: string[];
  notes: string[];
}

/**
 * Codex-specific run-state artifacts. `auth.json` holds live credentials and
 * `logs.sqlite` / `history.sqlite` are per-machine runtime state — none of
 * these should ever be scanned or exported.
 */
const CODEX_RUN_STATE_NAMES = new Set([
  'auth.json',
  'logs.sqlite',
  'history.sqlite',
  'cache',
  'projects',
  'goals',
  'todos',
  'sessions',
  'ephemeral',
]);

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

function pushEntry(domain: AgentDomain, key: keyof AgentDomain, entry: DomainEntry): void {
  domain[key].push(entry);
}

/**
 * Scan a Codex (OpenAI) environment rooted at `homeDir` (~/.codex).
 *
 * Codex stores its configuration in a single TOML file (`config.toml`) that
 * mixes definitions (mcp_servers, model, provider) with secrets (env maps inside
 * mcp_servers, provider tokens). We capture `config.toml` wholesale as a
 * `settings` entry (the scan→export bridge masks secrets in it at the object
 * level and restores it as TOML), and `AGENTS.md` as a memory entry.
 *
 * Live credentials live in `auth.json` and runtime state in `logs.sqlite` /
 * `history.sqlite` — those are never scanned or exported.
 */
export async function scanCodex(homeDir: string): Promise<ScanResult> {
  const codexDir = path.join(homeDir, '.codex');
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

  // config.toml (the whole configuration, including mcp_servers + secrets)
  const configPath = path.join(codexDir, 'config.toml');
  if (await exists(configPath)) {
    pushEntry(domain, 'settings', {
      id: 'codex-config',
      kind: 'settings',
      path: configPath,
      ref: 'config.toml',
    });
    try {
      const parsed = parseToml(await fs.readFile(configPath, 'utf8'));
      recordSecrets(parsed, configPath, 'codex', secrets);
      const mcpServers = (parsed as { mcp_servers?: Record<string, unknown> }).mcp_servers;
      if (mcpServers && typeof mcpServers === 'object') {
        const names = Object.keys(mcpServers);
        if (names.length > 0) {
          // mcp_servers live inside config.toml, so they are captured as part
          // of the `settings` entry above (not as separate `mcp` entries, which
          // the bridge would otherwise aggregate into a Claude-style .claude.json)
          notes.push(`Codex mcp_servers (captured in config.toml): ${names.join(', ')}`);
        }
      }
    } catch (error) {
      notes.push(`.codex/config.toml 解析失败（${(error as Error).message}），仅记录路径`);
    }
  } else {
    notes.push('未找到 .codex/config.toml');
  }

  // AGENTS.md (project/user instructions — memory)
  const agentsMdPath = path.join(codexDir, 'AGENTS.md');
  if (await exists(agentsMdPath)) {
    pushEntry(domain, 'memory', {
      id: 'codex-agents-md',
      kind: 'memory',
      path: agentsMdPath,
      ref: 'AGENTS.md',
    });
  }

  // Run-state artifacts that must never be exported (note + skip)
  for (const name of CODEX_RUN_STATE_NAMES) {
    const candidate = path.join(codexDir, name);
    if (await exists(candidate)) {
      skipped.push(candidate);
    }
  }
  // also honor the shared run-state names for parity
  for (const name of RUN_STATE_NAMES) {
    if (CODEX_RUN_STATE_NAMES.has(name)) {
      continue;
    }
    const candidate = path.join(codexDir, name);
    if (await exists(candidate)) {
      skipped.push(candidate);
    }
  }

  return { domain, secrets, skipped, notes };
}
