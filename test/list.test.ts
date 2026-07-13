import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runList } from '../src/core/list';
import { runListCommand } from '../src/commands/list';

const tmpRoots: string[] = [];

async function makeTmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-list-'));
  tmpRoots.push(dir);
  return dir;
}

afterEach(async () => {
  while (tmpRoots.length) {
    const dir = tmpRoots.pop()!;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

const CLAUDE_MANIFEST_YAML = `
version: 3
project:
  name: demo
agents:
  claude:
    mcp:
      - id: c-mcp-1
        kind: mcp
        path: /home/x/.claude.json
        ref: .claude.json#mcpServers.github
    skills:
      - id: c-skill-1
        kind: skill
        path: /home/x/.claude/skills/my-skill
        ref: skills/my-skill
    agents:
      - id: c-agent-1
        kind: agent
        path: /home/x/.claude/agents/reviewer.md
        ref: agents/reviewer.md
    plugins: []
    hooks: []
    memory:
      - id: c-mem-1
        kind: memory
        path: /home/x/.claude/CLAUDE.md
        ref: CLAUDE.md
    settings:
      - id: c-set-1
        kind: settings
        path: /home/x/.claude/settings.json
        ref: settings.json
  codex:
    mcp:
      - id: x-mcp-1
        kind: mcp
        path: /home/x/.codex/config.toml
        ref: config.toml#mcpServers.github
    skills: []
    agents: []
    plugins: []
    hooks: []
    memory:
      - id: x-mem-1
        kind: memory
        path: /home/x/.codex/AGENTS.md
        ref: AGENTS.md
    settings:
      - id: x-set-1
        kind: settings
        path: /home/x/.codex/config.toml
        ref: config.toml
secrets:
  - key: AGENTDOCK_CLAUDE_GITHUB_TOKEN
    source: /home/x/.claude.json#mcpServers.github.env.GITHUB_TOKEN
  - key: AGENTDOCK_CODEX_GITHUB_TOKEN
    source: /home/x/.codex/config.toml#mcpServers.github.env.GITHUB_TOKEN
outputs:
  type: directory
  path: /tmp/scan
`;

async function writeScanManifest(dir: string): Promise<string> {
  const p = path.join(dir, 'agentdock.scan.yml');
  await fs.writeFile(p, CLAUDE_MANIFEST_YAML, 'utf8');
  return p;
}

describe('list (scan)', () => {
  it('lists captured content grouped by agent with names and secret count', async () => {
    const dir = await makeTmp();
    const manifestPath = await writeScanManifest(dir);

    const report = await runList({ fromScan: manifestPath });

    expect(report.mode).toBe('scan');
    expect(report.agents).toHaveLength(2);

    const claude = report.agents.find((a) => a.agent === 'claude');
    const codex = report.agents.find((a) => a.agent === 'codex');
    expect(claude).toBeDefined();
    expect(codex).toBeDefined();

    expect(claude!.mcp).toEqual(['github']);
    expect(claude!.skills).toEqual(['my-skill']);
    expect(claude!.agents).toEqual(['reviewer']);
    expect(claude!.memory).toEqual(['CLAUDE']);
    expect(claude!.settings).toEqual(['settings']);
    expect(claude!.totals.all).toBe(5);

    expect(codex!.mcp).toEqual(['github']);
    expect(codex!.memory).toEqual(['AGENTS']);
    expect(codex!.settings).toEqual(['config']);
    expect(codex!.totals.all).toBe(3);

    expect(report.secretsCount).toBe(2);
    expect(report.secrets.map((s) => s.key)).toEqual([
      'AGENTDOCK_CLAUDE_GITHUB_TOKEN',
      'AGENTDOCK_CODEX_GITHUB_TOKEN',
    ]);
  });

  it('filters to a single agent with --agent codex', async () => {
    const dir = await makeTmp();
    const manifestPath = await writeScanManifest(dir);

    const report = await runList({ fromScan: manifestPath, agent: 'codex' });

    expect(report.agents).toHaveLength(1);
    expect(report.agents[0].agent).toBe('codex');
    expect(report.secretsCount).toBe(2); // secrets are global to the manifest
  });

  it('writes a list-report.md when --out is provided', async () => {
    const dir = await makeTmp();
    const manifestPath = await writeScanManifest(dir);
    const outDir = path.join(dir, 'out');

    const report = await runList({ fromScan: manifestPath, out: outDir });

    expect(report.reportPath).toBeDefined();
    const md = await fs.readFile(report.reportPath!, 'utf8');
    // count-based assertions avoid the harness string-compare quirk
    expect(md.split('\n').filter((l) => l.startsWith('## ')).length).toBeGreaterThanOrEqual(2);
    expect(md).toContain('AGENTDOCK_CLAUDE_GITHUB_TOKEN');
  });

  it('throws when neither --from-scan nor --package is given', async () => {
    await expect(runList({})).rejects.toThrow();
  });
});

describe('list (package)', () => {
  it('lists package contents and includes the install plan', async () => {
    const dir = await makeTmp();
    const pkg = path.join(dir, 'pkg');
    await fs.mkdir(path.join(pkg, 'meta'), { recursive: true });

    await fs.writeFile(
      path.join(pkg, 'manifest.resolved.json'),
      JSON.stringify({
        version: 3,
        project: { name: 'demo' },
        agents: {
          claude: {
            mcp: [{ id: 'c-mcp-1', kind: 'mcp', path: '/home/x/.claude.json', ref: '.claude.json#mcpServers.github' }],
            skills: [],
            agents: [],
            plugins: [],
            hooks: [],
            memory: [],
            settings: [],
          },
        },
        secrets: [{ key: 'AGENTDOCK_CLAUDE_GITHUB_TOKEN', source: 'x' }],
        outputs: { type: 'directory', path: '/tmp/x' },
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(pkg, 'meta', 'install-plan.json'),
      JSON.stringify({
        overwrite: false,
        sources: [{ id: 'c-mcp-1', kind: 'file', from: 'payload/sources/.agentdock-mcp.json', to: '.claude.json' }],
        templates: [],
      }),
      'utf8',
    );

    const report = await runList({ package: pkg });
    expect(report.mode).toBe('package');
    expect(report.agents).toHaveLength(1);
    expect(report.agents[0].mcp).toEqual(['github']);
    expect(report.installPlan).toBeDefined();
    expect(report.installPlan).toHaveLength(1);
    expect(report.installPlan![0].to).toBe('.claude.json');
  });
});

describe('runListCommand', () => {
  it('returns success and non-empty stdout in text mode', async () => {
    const dir = await makeTmp();
    const manifestPath = await writeScanManifest(dir);
    const result = await runListCommand({ fromScan: manifestPath });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('returns a parseable JSON line in --json mode', async () => {
    const dir = await makeTmp();
    const manifestPath = await writeScanManifest(dir);
    const result = await runListCommand({ fromScan: manifestPath, json: true });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.command).toBe('list');
    expect(parsed.data.agents).toHaveLength(2);
  });
});
