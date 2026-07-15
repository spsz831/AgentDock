import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { runScan } from '../src/core/scan';
import { exportFromScan } from '../src/core/scan-export';
import { installPackage } from '../src/core/installer';
import { uninstallPackage } from '../src/core/uninstall';
import { parse as parseToml } from 'smol-toml';

// Source machine: a Codex home with two MCP servers + its own model/provider.
const SOURCE_CONFIG = `# Codex config (source machine)
model = "gpt-5"
provider = "openai"

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "ghp_REALTOKEN1234567890" }

[mcp_servers.internal]
command = "uvx"
env = { API_KEY = "sk-ant-REALKEY0000000000" }
`;

// Target machine: ALREADY has its own config.toml with a different model/provider
// and its OWN mcp server. This is the parity scenario — install must NOT clobber it.
const TARGET_CONFIG = `# Codex config (target machine — pre-existing)
model = "o3"
provider = "azure"

[mcp_servers.local]
command = "/usr/local/bin/local-mcp"
`;

async function makeCodexHome(config: string): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), 'agentdock-codex-merge-'));
  const codexDir = path.join(home, '.codex');
  await fs.mkdir(codexDir, { recursive: true });
  await fs.writeFile(path.join(codexDir, 'config.toml'), config, 'utf8');
  await fs.writeFile(path.join(codexDir, 'AGENTS.md'), '# codex memory\n', 'utf8');
  return home;
}

async function installedConfig(targetDir: string): Promise<Record<string, unknown>> {
  const toml = await fs.readFile(path.join(targetDir, '.codex', 'config.toml'), 'utf8');
  return parseToml(toml) as Record<string, unknown>;
}

describe('Codex config.toml merge parity', () => {
  it('merges onto an existing config.toml: adds mcp_servers, preserves model/provider + target MCP', async () => {
    const sourceHome = await makeCodexHome(SOURCE_CONFIG);
    const targetHome = await makeCodexHome(TARGET_CONFIG);

    const scanDir = await mkdtemp(path.join(os.tmpdir(), 'agentdock-cm-scan-'));
    const pkgDir = await mkdtemp(path.join(os.tmpdir(), 'agentdock-cm-pkg-'));

    await runScan({ agent: 'codex', root: sourceHome, out: scanDir });
    const manifestPath = path.join(scanDir, 'agentdock.scan.yml');
    await exportFromScan({ scanManifestPath: manifestPath, out: pkgDir });

    // Install the package onto the machine that already has a config.toml.
    await installPackage(pkgDir, targetHome, true);

    const installed = await installedConfig(targetHome);
    const mcp = installed.mcp_servers as Record<string, unknown>;

    // Package's servers were added.
    expect(Object.keys(mcp).sort()).toEqual(['github', 'internal', 'local']);
    // Target's own model/provider were preserved (NOT overwritten by the package).
    expect(installed.model).toBe('o3');
    expect(installed.provider).toBe('azure');
    // Target's own MCP server is still present.
    expect(mcp.local).toBeDefined();
    // Secrets stay masked (no --env used).
    const github = mcp.github as { env: { GITHUB_TOKEN: string } };
    expect(github.env.GITHUB_TOKEN).toBe('{{AGENTDOCK_CODEX_GITHUB_TOKEN}}');

    await fs.rm(sourceHome, { recursive: true, force: true });
    await fs.rm(targetHome, { recursive: true, force: true });
    await fs.rm(scanDir, { recursive: true, force: true });
    await fs.rm(pkgDir, { recursive: true, force: true });
  });

  it('fresh install restores the full config (model/provider included)', async () => {
    const sourceHome = await makeCodexHome(SOURCE_CONFIG);
    const targetHome = await mkdtemp(path.join(os.tmpdir(), 'agentdock-cm-fresh-'));

    const scanDir = await mkdtemp(path.join(os.tmpdir(), 'agentdock-cm-scan2-'));
    const pkgDir = await mkdtemp(path.join(os.tmpdir(), 'agentdock-cm-pkg2-'));

    await runScan({ agent: 'codex', root: sourceHome, out: scanDir });
    await exportFromScan({ scanManifestPath: path.join(scanDir, 'agentdock.scan.yml'), out: pkgDir });
    await installPackage(pkgDir, targetHome, true);

    const installed = await installedConfig(targetHome);
    // On a fresh target the whole payload is restored, so model/provider travel too.
    expect(installed.model).toBe('gpt-5');
    expect(installed.provider).toBe('openai');
    expect(Object.keys(installed.mcp_servers as Record<string, unknown>).sort()).toEqual(['github', 'internal']);

    await fs.rm(sourceHome, { recursive: true, force: true });
    await fs.rm(targetHome, { recursive: true, force: true });
    await fs.rm(scanDir, { recursive: true, force: true });
    await fs.rm(pkgDir, { recursive: true, force: true });
  });

  it('uninstall reverses only the package mcp_servers, keeping model/provider + target MCP', async () => {
    const sourceHome = await makeCodexHome(SOURCE_CONFIG);
    const targetHome = await makeCodexHome(TARGET_CONFIG);
    const scanDir = await mkdtemp(path.join(os.tmpdir(), 'agentdock-cm-scan3-'));
    const pkgDir = await mkdtemp(path.join(os.tmpdir(), 'agentdock-cm-pkg3-'));

    await runScan({ agent: 'codex', root: sourceHome, out: scanDir });
    await exportFromScan({ scanManifestPath: path.join(scanDir, 'agentdock.scan.yml'), out: pkgDir });
    await installPackage(pkgDir, targetHome, true);

    const result = await uninstallPackage(pkgDir, targetHome);
    expect(result.removed.some((e) => e.action === 'unmerge')).toBe(true);

    const after = await installedConfig(targetHome);
    const mcp = after.mcp_servers as Record<string, unknown>;
    // Package's servers are gone; target's own survives.
    expect(mcp.github).toBeUndefined();
    expect(mcp.internal).toBeUndefined();
    expect(mcp.local).toBeDefined();
    // Target's model/provider untouched by uninstall.
    expect(after.model).toBe('o3');
    expect(after.provider).toBe('azure');

    await fs.rm(sourceHome, { recursive: true, force: true });
    await fs.rm(targetHome, { recursive: true, force: true });
    await fs.rm(scanDir, { recursive: true, force: true });
    await fs.rm(pkgDir, { recursive: true, force: true });
  });
});
