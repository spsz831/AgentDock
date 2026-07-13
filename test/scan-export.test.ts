import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runScan } from '../src/core/scan';
import { exportFromScan } from '../src/core/scan-export';
import { installPackage } from '../src/core/installer';
import YAML from 'yaml';

const REAL_TOKEN = 'ghp_REALVALUE1234567890';
const OTHER_TOKEN = 'xoxb_REALOTHER99887766';
const INJECTED = 'ghp_INJECTEDSECRET0000';

async function makeFakeHome(): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-home-'));
  const claudeDir = path.join(home, '.claude');
  await fs.mkdir(path.join(claudeDir, 'skills', 'my-skill'), { recursive: true });
  await fs.mkdir(path.join(claudeDir, 'agents'), { recursive: true });
  await fs.mkdir(path.join(claudeDir, 'plugins'), { recursive: true });
  await fs.mkdir(path.join(claudeDir, 'hooks'), { recursive: true });

  await fs.writeFile(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify({ env: { GITHUB_TOKEN: REAL_TOKEN, theme: 'dark' } }, null, 2),
    'utf8',
  );
  await fs.writeFile(
    path.join(home, '.claude.json'),
    JSON.stringify({ mcpServers: { github: { type: 'stdio', env: { GITHUB_TOKEN: OTHER_TOKEN } } } }, null, 2),
    'utf8',
  );
  await fs.writeFile(path.join(claudeDir, 'skills', 'my-skill', 'SKILL.md'), '# my skill\n', 'utf8');
  await fs.writeFile(path.join(claudeDir, 'agents', 'reviewer.md'), '# reviewer\n', 'utf8');
  await fs.writeFile(path.join(claudeDir, 'plugins', 'installed_plugins.json'), '[]', 'utf8');
  await fs.writeFile(path.join(claudeDir, 'hooks', 'pre-commit.sh'), '#!/bin/sh\n', 'utf8');
  await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# project memory\n', 'utf8');
  return home;
}

async function readJson(p: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

describe('scan → export → install closed loop', () => {
  it('produces a secret-safe package and restores it (masked) without a real token', async () => {
    const home = await makeFakeHome();
    const scanDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-scan-'));
    const pkgDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-pkg-'));

    await runScan({ agent: 'claude', root: home, out: scanDir });
    const exportResult = await exportFromScan({ scanManifestPath: path.join(scanDir, 'agentdock.scan.yml'), out: pkgDir });

    // package shape matches what `install` consumes
    expect(await fs.readFile(path.join(pkgDir, 'manifest.resolved.json'), 'utf8')).toBeTruthy();
    const plan = (await readJson(path.join(pkgDir, 'meta', 'install-plan.json'))) as {
      sources: { id: string; kind: string; from: string; to: string }[];
    };
    expect(plan.sources.length).toBeGreaterThanOrEqual(7);

    // secrets are masked in the package, never the real value
    const settingsPayload = await readJson(path.join(pkgDir, 'payload', 'sources', '.claude', 'settings.json')) as {
      env: Record<string, string>;
    };
    expect(settingsPayload.env.GITHUB_TOKEN).toBe('{{AGENTDOCK_CLAUDE_GITHUB_TOKEN}}');
    expect(settingsPayload.env.theme).toBe('dark');

    const mcpPayload = await readJson(path.join(pkgDir, 'payload', 'sources', '.agentdock-mcp.json')) as {
      mcpServers: Record<string, { env: Record<string, string> }>;
    };
    expect(mcpPayload.mcpServers.github.env.GITHUB_TOKEN).toBe('{{AGENTDOCK_CLAUDE_GITHUB_TOKEN}}');

    const allFiles = await dumpFiles(pkgDir);
    expect(allFiles.some((f) => f.includes(REAL_TOKEN))).toBe(false);
    expect(allFiles.some((f) => f.includes(OTHER_TOKEN))).toBe(false);

    // restore into a fresh target home
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-target-'));
    const install = await installPackage(pkgDir, target);
    expect(install.targetPath).toBe(path.resolve(target));

    const restoredSettings = (await readJson(path.join(target, '.claude', 'settings.json'))) as {
      env: Record<string, string>;
    };
    expect(restoredSettings.env.GITHUB_TOKEN).toBe('{{AGENTDOCK_CLAUDE_GITHUB_TOKEN}}');

    const restoredClaudeJson = (await readJson(path.join(target, '.claude.json'))) as {
      mcpServers: Record<string, unknown>;
    };
    expect(restoredClaudeJson.mcpServers.github).toBeTruthy();

    expect(await fs.readFile(path.join(target, '.claude', 'skills', 'my-skill', 'SKILL.md'), 'utf8')).toBe('# my skill\n');
    expect(await fs.readFile(path.join(target, '.claude', 'CLAUDE.md'), 'utf8')).toBe('# project memory\n');

    // idempotent re-run without --overwrite must succeed (no conflict)
    await expect(installPackage(pkgDir, target)).resolves.toBeTruthy();

    await cleanup([home, scanDir, pkgDir, target]);
  });

  it('re-injects real secrets when --env is supplied', async () => {
    const home = await makeFakeHome();
    const scanDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-scan-'));
    const pkgDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-pkg-'));

    await runScan({ agent: 'claude', root: home, out: scanDir });

    const envPath = path.join(scanDir, '.env');
    await fs.writeFile(envPath, `AGENTDOCK_CLAUDE_GITHUB_TOKEN=${INJECTED}\n`, 'utf8');

    await exportFromScan({ scanManifestPath: path.join(scanDir, 'agentdock.scan.yml'), out: pkgDir, env: envPath });

    const settingsPayload = await readJson(path.join(pkgDir, 'payload', 'sources', '.claude', 'settings.json')) as {
      env: Record<string, string>;
    };
    expect(settingsPayload.env.GITHUB_TOKEN).toBe(INJECTED);

    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-target-'));
    await installPackage(pkgDir, target);
    const restored = (await readJson(path.join(target, '.claude', 'settings.json'))) as {
      env: Record<string, string>;
    };
    expect(restored.env.GITHUB_TOKEN).toBe(INJECTED);

    await cleanup([home, scanDir, pkgDir, target]);
  });

  it('exposes the v3 manifest as valid YAML at the scan output', async () => {
    const home = await makeFakeHome();
    const scanDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-scan-'));
    await runScan({ agent: 'claude', root: home, out: scanDir });
    const m = YAML.parse(await fs.readFile(path.join(scanDir, 'agentdock.scan.yml'), 'utf8')) as {
      version: number;
      secrets: { key: string }[];
    };
    expect(m.version).toBe(3);
    expect(m.secrets.some((s) => s.key === 'AGENTDOCK_CLAUDE_GITHUB_TOKEN')).toBe(true);
    await cleanup([home, scanDir]);
  });
});

async function dumpFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        out.push(await fs.readFile(full, 'utf8'));
      }
    }
  }
  await walk(root);
  return out;
}

async function cleanup(dirs: string[]): Promise<void> {
  await Promise.all(dirs.map((d) => fs.rm(d, { recursive: true, force: true })));
}
