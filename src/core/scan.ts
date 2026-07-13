import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { scanClaude } from '../scanners/claude-scanner';
import { scanCodex } from '../scanners/codex-scanner';
import { renderEnvExample } from '../scanners/sensitive';
import type { AgentDockManifestV3, AgentDomain, SecretEntry } from '../manifest/types';
import { ensureDirectory, writeTextFile } from '../utils/fs';

export type ScanAgent = 'claude' | 'codex' | 'all';

export interface ScanOptions {
  agent: ScanAgent;
  /** Home directory to scan (defaults to os.homedir()). */
  root: string;
  /** Output directory for generated artifacts. */
  out: string;
}

export interface ScanReportData {
  agent: ScanAgent;
  manifestPath: string;
  envExamplePath: string;
  reportPath: string;
  counts: {
    claude?: Record<string, number>;
    codex?: Record<string, number>;
  };
  secretsCount: number;
  skipped: string[];
  notes: string[];
}

function countDomain(domain: AgentDomain): Record<string, number> {
  return {
    mcp: domain.mcp.length,
    skills: domain.skills.length,
    agents: domain.agents.length,
    plugins: domain.plugins.length,
    hooks: domain.hooks.length,
    memory: domain.memory.length,
    settings: domain.settings.length,
  };
}

function renderReport(
  manifest: AgentDockManifestV3,
  reportData: ScanReportData,
): string {
  const lines: string[] = ['# AgentDock Scan Report', ''];
  lines.push(`- Agent: \`${reportData.agent}\``);
  lines.push(`- Secrets isolated: **${reportData.secretsCount}**`);
  lines.push('');

  const claude = manifest.agents.claude;
  if (claude) {
    lines.push('## Claude Code', '');
    lines.push(`- MCP servers: ${claude.mcp.length}`);
    lines.push(`- Skills: ${claude.skills.length}`);
    lines.push(`- Agents: ${claude.agents.length}`);
    lines.push(`- Plugins: ${claude.plugins.length}`);
    lines.push(`- Hooks: ${claude.hooks.length}`);
    lines.push(`- Memory files: ${claude.memory.length}`);
    lines.push(`- settings.json: ${claude.settings.length ? 'yes' : 'no'}`);
    lines.push('');
  }

  const codex = manifest.agents.codex;
  if (codex) {
    lines.push('## Codex (OpenAI)', '');
    lines.push(`- MCP servers: ${codex.mcp.length} (captured inside config.toml)`);
    lines.push(`- Skills: ${codex.skills.length}`);
    lines.push(`- Agents: ${codex.agents.length}`);
    lines.push(`- Plugins: ${codex.plugins.length}`);
    lines.push(`- Hooks: ${codex.hooks.length}`);
    lines.push(`- Memory files: ${codex.memory.length}`);
    lines.push(`- config.toml: ${codex.settings.length ? 'yes' : 'no'}`);
    lines.push('');
  }

  if (reportData.secretsCount > 0) {
    lines.push('## Isolated secrets', '');
    for (const secret of manifest.secrets) {
      lines.push(`- \`${secret.key}\` — from \`${secret.source}\`${secret.sample ? ` (sample ${secret.sample})` : ''}`);
    }
    lines.push('');
    lines.push('> These values were NOT written to disk. Fill `.env.example` on the target machine.');
    lines.push('');
  }

  if (reportData.skipped.length > 0) {
    lines.push('## Run-state skipped (never exported)', '');
    for (const item of reportData.skipped) {
      lines.push(`- \`${item}\``);
    }
    lines.push('');
  }

  if (reportData.notes.length > 0) {
    lines.push('## Notes', '');
    for (const note of reportData.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export interface ScanOutput {
  manifest: AgentDockManifestV3;
  report: ScanReportData;
}

export async function runScan(options: ScanOptions): Promise<ScanOutput> {
  const agents: { claude?: AgentDomain; codex?: AgentDomain } = {};
  const secrets: SecretEntry[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];
  const counts: ScanReportData['counts'] = {};

  if (options.agent === 'claude' || options.agent === 'all') {
    const result = await scanClaude(options.root);
    agents.claude = result.domain;
    secrets.push(...result.secrets);
    skipped.push(...result.skipped);
    notes.push(...result.notes);
    counts.claude = countDomain(result.domain);
  }

  if (options.agent === 'codex' || options.agent === 'all') {
    const result = await scanCodex(options.root);
    agents.codex = result.domain;
    secrets.push(...result.secrets);
    skipped.push(...result.skipped);
    notes.push(...result.notes);
    counts.codex = countDomain(result.domain);
  }

  const manifest: AgentDockManifestV3 = {
    version: 3,
    project: { name: `${path.basename(options.root) || 'local'}-ai-env` },
    agents,
    secrets,
    outputs: { type: 'directory', path: options.out },
  };

  await ensureDirectory(options.out);
  const manifestPath = path.join(options.out, 'agentdock.scan.yml');
  await writeTextFile(manifestPath, YAML.stringify(manifest, null, 2));

  const envExamplePath = path.join(options.out, '.env.example');
  await writeTextFile(envExamplePath, renderEnvExample(secrets));

  const report: ScanReportData = {
    agent: options.agent,
    manifestPath,
    envExamplePath,
    reportPath: path.join(options.out, 'scan-report.md'),
    counts,
    secretsCount: secrets.length,
    skipped,
    notes,
  };

  await writeTextFile(report.reportPath, renderReport(manifest, report));

  return { manifest, report };
}

export function defaultScanRoot(): string {
  return os.homedir();
}
