import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';
import type { AgentDockManifestV3 } from '../src/manifest/types';
import type { ScanReportData } from '../src/core/scan';
import type { CommandJsonReport } from '../src/types/command-report';
import YAML from 'yaml';

const REAL_TOKEN = 'ghp_ABCDEFGHIJ1234567890';

async function createFakeHome(): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-scan-home-'));
  const claudeDir = path.join(home, '.claude');
  await fs.mkdir(path.join(claudeDir, 'skills', 'my-skill'), { recursive: true });
  await fs.mkdir(path.join(claudeDir, 'agents'), { recursive: true });
  await fs.mkdir(path.join(claudeDir, 'plugins'), { recursive: true });
  await fs.mkdir(path.join(claudeDir, 'hooks', 'cache'), { recursive: true });

  await fs.writeFile(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify({
      model: 'claude-opus-4',
      env: { GITHUB_TOKEN: REAL_TOKEN },
      permissions: { allow: ['Read'] },
    }),
    'utf8',
  );
  await fs.writeFile(
    path.join(home, '.claude.json'),
    JSON.stringify({
      mcpServers: {
        github: { type: 'stdio', env: { GITHUB_TOKEN: 'ghp_OTHERTOKENXYZ' } },
      },
    }),
    'utf8',
  );
  await fs.writeFile(path.join(claudeDir, 'skills', 'my-skill', 'SKILL.md'), '# my skill', 'utf8');
  await fs.writeFile(path.join(claudeDir, 'agents', 'planner.md'), '# planner', 'utf8');
  await fs.writeFile(path.join(claudeDir, 'plugins', 'installed_plugins.json'), '{}', 'utf8');
  await fs.writeFile(path.join(claudeDir, 'hooks', 'pre.ps1'), 'Write-Host hi', 'utf8');
  await fs.writeFile(path.join(claudeDir, 'hooks', 'cache', 'junk.txt'), 'should be skipped', 'utf8');
  await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# project memory', 'utf8');

  return home;
}

async function readAllFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(await fs.readFile(full, 'utf8'));
    }
  }
  await walk(dir);
  return out;
}

describe('cli scan command (Claude MVP)', () => {
  it('produces a v3 manifest with all artifact categories and isolated secrets', async () => {
    const home = await createFakeHome();
    const outDir = path.join(home, 'out');

    const result = await runCli(['scan', '--agent', 'claude', '--root', home, '--out', outDir]);

    expect(result.exitCode).toBe(0);

    const manifest = YAML.parse(
      await fs.readFile(path.join(outDir, 'agentdock.scan.yml'), 'utf8'),
    ) as AgentDockManifestV3;
    expect(manifest.version).toBe(3);
    const claude = manifest.agents.claude;
    expect(claude).toBeDefined();
    expect(claude?.mcp.length).toBe(1);
    expect(claude?.skills.length).toBe(1);
    expect(claude?.agents.length).toBe(1);
    expect(claude?.plugins.length).toBe(1);
    expect(claude?.hooks.length).toBe(1);
    expect(claude?.memory.length).toBe(1);
    expect(claude?.settings.length).toBe(1);

    // Secret isolated, not left in clear text
    expect(manifest.secrets.some((s) => s.key === 'AGENTDOCK_CLAUDE_GITHUB_TOKEN')).toBe(true);
    expect(manifest.secrets[0]?.sample).toContain('****');

    // Run-state cache skipped (not collected as a hook)
    expect(claude?.hooks.some((h) => h.path.includes('cache'))).toBe(false);
  });

  it('never writes the real token value to disk', async () => {
    const home = await createFakeHome();
    const outDir = path.join(home, 'out');

    await runCli(['scan', '--agent', 'claude', '--root', home, '--out', outDir]);

    const files = await readAllFiles(outDir);
    const concatenated = files.join('\n');
    expect(concatenated).not.toContain(REAL_TOKEN);
    expect(concatenated).not.toContain('ghp_OTHERTOKENXYZ');

    // .env.example only carries placeholder keys
    const envExample = await fs.readFile(path.join(outDir, '.env.example'), 'utf8');
    expect(envExample).toContain('AGENTDOCK_CLAUDE_GITHUB_TOKEN=');
  });

  it('returns a versioned json report in --json mode', async () => {
    const home = await createFakeHome();
    const outDir = path.join(home, 'out');

    const result = await runCli(['scan', '--agent', 'claude', '--root', home, '--out', outDir, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as CommandJsonReport<ScanReportData>;
    expect(payload.schemaVersion).toBe(1);
    expect(Number.isNaN(Date.parse(payload.generatedAt))).toBe(false);
    expect(payload.command).toBe('scan');
    expect(payload.success).toBe(true);
    expect(payload.data.agent).toBe('claude');
    expect(payload.data.secretsCount).toBeGreaterThan(0);
    expect(payload.errors).toEqual([]);
  });

  it('scans a Codex environment and populates the codex domain', async () => {
    const home = await createFakeHome();
    const codexDir = path.join(home, '.codex');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      path.join(codexDir, 'config.toml'),
      'model = "gpt-5"\n\n[mcp_servers.github]\ncommand = "npx"\nenv = { GITHUB_TOKEN = "ghp_REALTOKEN1234567890" }\n',
      'utf8',
    );
    const outDir = path.join(home, 'out');

    const result = await runCli(['scan', '--agent', 'codex', '--root', home, '--out', outDir]);

    expect(result.exitCode).toBe(0);
    const manifest = YAML.parse(
      await fs.readFile(path.join(outDir, 'agentdock.scan.yml'), 'utf8'),
    ) as AgentDockManifestV3;
    expect(manifest.version).toBe(3);
    expect(manifest.agents.codex).toBeDefined();
    expect(manifest.agents.codex?.settings).toHaveLength(1);
    expect(manifest.agents.codex?.settings[0].ref).toBe('config.toml');
    expect(manifest.secrets.some((s) => s.key === 'AGENTDOCK_CODEX_GITHUB_TOKEN')).toBe(true);
  });
});
