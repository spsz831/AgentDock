import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDirectory } from '../utils/fs';

export type ConfigKey = 'agent' | 'out' | 'env' | 'lang';
export type ConfigAgent = 'claude' | 'codex' | 'all';

export interface AgentDockConfig {
  /** Default `--agent` for `scan`. */
  agent?: ConfigAgent;
  /** Default `--out` for `scan` (and a fallback for other commands). */
  out?: string;
  /** Default `--env` file for `install` / `export --from-scan`. */
  env?: string;
  /** UI language for human-readable CLI output (`en` | `zh-CN`). */
  lang?: string;
}

const CONFIG_KEYS: ConfigKey[] = ['agent', 'out', 'env', 'lang'];
const AGENT_VALUES: ConfigAgent[] = ['claude', 'codex', 'all'];
const LANG_VALUES = ['en', 'zh-CN'];

function configPath(): string {
  const override = process.env.AGENTDOCK_CONFIG;
  if (override && override.length > 0) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), '.agentdock', 'config.json');
}

function configDir(): string {
  return path.dirname(configPath());
}

export function getConfigPath(): string {
  return configPath();
}

export function listConfigKeys(): ConfigKey[] {
  return [...CONFIG_KEYS];
}

export function isConfigKey(value: string): value is ConfigKey {
  return (CONFIG_KEYS as string[]).includes(value);
}

function sanitizeConfig(parsed: Partial<AgentDockConfig>): AgentDockConfig {
  const out: AgentDockConfig = {};
  if (parsed.agent && AGENT_VALUES.includes(parsed.agent)) {
    out.agent = parsed.agent;
  }
  if (typeof parsed.out === 'string' && parsed.out.length > 0) {
    out.out = parsed.out;
  }
  if (typeof parsed.env === 'string' && parsed.env.length > 0) {
    out.env = parsed.env;
  }
  if (typeof parsed.lang === 'string' && LANG_VALUES.includes(parsed.lang)) {
    out.lang = parsed.lang;
  }
  return out;
}

/** Read AgentDock's own config. Missing/unreadable file → empty object (defaults apply). */
export async function loadConfig(): Promise<AgentDockConfig> {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    return sanitizeConfig(JSON.parse(raw) as Partial<AgentDockConfig>);
  } catch {
    return {};
  }
}

/** Validate a value for a given key; returns an error message or null if valid. */
export function validateConfigValue(key: ConfigKey, value: string): string | null {
  if (key === 'agent') {
    return AGENT_VALUES.includes(value as ConfigAgent)
      ? null
      : `agent must be one of: ${AGENT_VALUES.join(', ')}`;
  }
  if (key === 'lang') {
    return LANG_VALUES.includes(value) ? null : `lang must be one of: ${LANG_VALUES.join(', ')}`;
  }
  // out / env are filesystem paths — accept any non-empty string.
  return value.length > 0 ? null : `${key} must be a non-empty string`;
}

export async function setConfig(key: ConfigKey, value: string): Promise<AgentDockConfig> {
  const current = await loadConfig();
  const next: AgentDockConfig = { ...current, [key]: value };
  await ensureDirectory(configDir());
  await fs.writeFile(configPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}
