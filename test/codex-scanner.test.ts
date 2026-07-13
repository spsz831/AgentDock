import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { scanCodex } from '../src/scanners/codex-scanner';
import { runScan } from '../src/core/scan';
import { exportFromScan } from '../src/core/scan-export';
import { installPackage } from '../src/core/installer';
import { parse as parseToml } from 'smol-toml';

const CONFIG_TOML = `# Codex config
model = "gpt-5"

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "ghp_REALTOKEN1234567890" }

[mcp_servers.internal]
command = "uvx"
env = { API_KEY = "sk-ant-REALKEY0000000000" }
`;

async function makeCodexHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), 'agentdock-codex-'));
  const codexDir = path.join(home, '.codex');
  await fs.mkdir(codexDir, { recursive: true });
  await fs.writeFile(path.join(codexDir, 'config.toml'), CONFIG_TOML, 'utf8');
  await fs.writeFile(path.join(codexDir, 'AGENTS.md'), '# codex project memory\n', 'utf8');
  // run-state that must NEVER be scanned
  await fs.writeFile(path.join(codexDir, 'auth.json'), '{"access_token":"live-secret"}', 'utf8');
  await fs.writeFile(path.join(codexDir, 'logs.sqlite'), 'binary-run-state', 'utf8');
  return home;
}

describe('scanCodex', () => {
  it('captures config.toml as a settings entry and AGENTS.md as memory', async () => {
    const home = await makeCodexHome();
    const result = await scanCodex(home);

    expect(result.domain.settings).toHaveLength(1);
    expect(result.domain.settings[0].ref).toBe('config.toml');
    expect(result.domain.settings[0].path.replace(/\\/g, '/').endsWith('.codex/config.toml')).toBe(true);

    expect(result.domain.memory).toHaveLength(1);
    expect(result.domain.memory[0].ref).toBe('AGENTS.md');

    await fs.rm(home, { recursive: true, force: true });
  });

  it('isolates secrets from mcp_servers env maps (Codex-namespaced keys)', async () => {
    const home = await makeCodexHome();
    const result = await scanCodex(home);

    const keys = result.secrets.map((s) => s.key);
    expect(keys).toContain('AGENTDOCK_CODEX_GITHUB_TOKEN');
    expect(keys).toContain('AGENTDOCK_CODEX_API_KEY');

    await fs.rm(home, { recursive: true, force: true });
  });

  it('skips run-state files (auth.json / logs.sqlite) and never captures them', async () => {
    const home = await makeCodexHome();
    const result = await scanCodex(home);

    // run-state must appear in the skipped list
    const skippedNames = result.skipped.map((p) => path.basename(p));
    expect(skippedNames).toContain('auth.json');
    expect(skippedNames).toContain('logs.sqlite');

    // and must NOT appear as any captured entry path
    const entryPaths = result.domain.settings
      .concat(result.domain.memory)
      .map((e) => e.path);
    for (const p of entryPaths) {
      expect(path.basename(p)).not.toBe('auth.json');
      expect(path.basename(p)).not.toBe('logs.sqlite');
    }

    await fs.rm(home, { recursive: true, force: true });
  });

  it('reports enumerated mcp_servers in notes', async () => {
    const home = await makeCodexHome();
    const result = await scanCodex(home);
    const note = result.notes.find((n) => n.indexOf('mcp_servers') !== -1);
    expect(note).toBeDefined();
    expect(note).toContain('github');
    expect(note).toContain('internal');

    await fs.rm(home, { recursive: true, force: true });
  });
});

describe('scan -> export --from-scan -> install (Codex loop)', () => {
  it('masks secrets in config.toml and restores them as placeholders, then re-injects via --env', async () => {
    const home = await makeCodexHome();
    const scanDir = await mkdtemp(path.join(os.tmpdir(), 'agentdock-codex-scan-'));
    const pkgDir = await mkdtemp(path.join(os.tmpdir(), 'agentdock-codex-pkg-'));
    const targetDir = await mkdtemp(path.join(os.tmpdir(), 'agentdock-codex-target-'));

    // 1. scan
    await runScan({ agent: 'codex', root: home, out: scanDir });
    const manifestPath = path.join(scanDir, 'agentdock.scan.yml');
    expect((await fs.readFile(manifestPath, 'utf8')).length).toBeGreaterThan(0);

    // 2. export (masked)
    await exportFromScan({ scanManifestPath: manifestPath, out: pkgDir });
    const restoredToml = await fs.readFile(
      path.join(pkgDir, 'payload', 'sources', '.codex', 'config.toml'),
      'utf8',
    );
    const parsedRestored = parseToml(restoredToml) as {
      mcp_servers: { github: { env: { GITHUB_TOKEN: string } }; internal: { env: { API_KEY: string } } };
    };
    // real tokens must NOT survive; masked placeholders must
    expect(parsedRestored.mcp_servers.github.env.GITHUB_TOKEN).toBe('{{AGENTDOCK_CODEX_GITHUB_TOKEN}}');
    expect(parsedRestored.mcp_servers.internal.env.API_KEY).toBe('{{AGENTDOCK_CODEX_API_KEY}}');

    // 3. install -> target
    await installPackage(pkgDir, targetDir, true);
    const installedToml = await fs.readFile(
      path.join(targetDir, '.codex', 'config.toml'),
      'utf8',
    );
    const parsedInstalled = parseToml(installedToml) as {
      mcp_servers: { github: { env: { GITHUB_TOKEN: string } } };
    };
    expect(parsedInstalled.mcp_servers.github.env.GITHUB_TOKEN).toBe('{{AGENTDOCK_CODEX_GITHUB_TOKEN}}');

    // 4. re-inject via --env
    const envPath = path.join(scanDir, '.env');
    await fs.writeFile(envPath, 'AGENTDOCK_CODEX_GITHUB_TOKEN=ghp_INJECTED0000000000\n', 'utf8');
    const pkgDir2 = await mkdtemp(path.join(os.tmpdir(), 'agentdock-codex-pkg2-'));
    await exportFromScan({ scanManifestPath: manifestPath, out: pkgDir2, env: envPath });
    const reinjected = parseToml(
      await fs.readFile(path.join(pkgDir2, 'payload', 'sources', '.codex', 'config.toml'), 'utf8'),
    ) as { mcp_servers: { github: { env: { GITHUB_TOKEN: string } } } };
    expect(reinjected.mcp_servers.github.env.GITHUB_TOKEN).toBe('ghp_INJECTED0000000000');

    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(scanDir, { recursive: true, force: true });
    await fs.rm(pkgDir, { recursive: true, force: true });
    await fs.rm(pkgDir2, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
  });
});
