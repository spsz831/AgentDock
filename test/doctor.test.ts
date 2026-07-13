import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { runDoctor, doctorExitCode } from '../src/core/doctor';
import type { DoctorReportData, DoctorCheck } from '../src/manifest/types';

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

describe('doctor', () => {
  it('live: healthy env (real tokens only in masked JSON) passes', async () => {
    const home = await makeTempDir('doc-live-');
    await writeFile(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({ env: { GITHUB_TOKEN: 'ghp_REALVALUE1234567890', theme: 'dark' } }),
    );
    await writeFile(
      path.join(home, '.claude.json'),
      JSON.stringify({ mcpServers: { github: { env: { GITHUB_TOKEN: 'xoxb_REALOTHER99887766' } } } }),
    );
    await writeFile(path.join(home, '.claude', 'skills', 'my-skill', 'SKILL.md'), '# my skill\n');
    await writeFile(path.join(home, '.claude', 'CLAUDE.md'), '# memory\n');

    const report = await runDoctor({ agent: 'claude', root: home });
    expect(report.mode).toBe('live');
    expect(report.healthy).toBe(true);
    // tokens in JSON settings/mcpServers are masked on export → info, not error
    expect(report.checks.find((c) => c.id === 'secret-leak')?.status).toBe('pass');
    expect(report.checks.find((c) => c.id === 'config-valid')?.status).toBe('pass');
  });

  it('live: real token inside a free-text skill file FAILS (reverse case)', async () => {
    const home = await makeTempDir('doc-leak-');
    await writeFile(
      path.join(home, '.claude', 'skills', 'my-skill', 'SKILL.md'),
      'use token ghp_REALVALUE1234567890 here\n',
    );

    const report = await runDoctor({ agent: 'claude', root: home });
    expect(report.healthy).toBe(false);
    const leak = report.checks.find((c) => c.id === 'secret-leak');
    expect(leak?.status).toBe('fail');
    expect(leak?.findings.some((f) => f.severity === 'error')).toBe(true);
  });

  it('from-scan: run-state file in artifact FAILS (reverse case)', async () => {
    const dir = await makeTempDir('doc-scan-');
    await writeFile(
      path.join(dir, 'agentdock.scan.yml'),
      [
        'version: 3',
        'project:',
        '  name: test',
        'agents:',
        '  claude:',
        '    mcp: []',
        '    skills: []',
        '    agents: []',
        '    plugins: []',
        '    hooks: []',
        '    memory: []',
        '    settings: []',
        'secrets: []',
        'outputs:',
        '  type: directory',
        `  path: ${dir}`,
      ].join('\n'),
    );
    // scan must never contain run-state files
    await writeFile(path.join(dir, 'auth.json'), '{"token":"x"}');

    const report = await runDoctor({ agent: 'claude', fromScan: path.join(dir, 'agentdock.scan.yml') });
    expect(report.mode).toBe('scan');
    expect(report.healthy).toBe(false);
    expect(report.checks.find((c) => c.id === 'artifact-runstate')?.status).toBe('fail');
  });

  it('from-scan: valid artifact with .env.example passes and writes report', async () => {
    const dir = await makeTempDir('doc-scan-ok-');
    await writeFile(
      path.join(dir, 'agentdock.scan.yml'),
      [
        'version: 3',
        'project:',
        '  name: test',
        'agents:',
        '  claude:',
        '    mcp: []',
        '    skills: []',
        '    agents: []',
        '    plugins: []',
        '    hooks: []',
        '    memory: []',
        '    settings: []',
        'secrets:',
        '  - key: AGENTDOCK_CLUDE_GITHUB_TOKEN',
        '    source: .claude.json#mcpServers.github.env.GITHUB_TOKEN',
        'outputs:',
        '  type: directory',
        `  path: ${dir}`,
      ].join('\n'),
    );
    await writeFile(path.join(dir, '.env.example'), 'AGENTDOCK_CLAUDE_GITHUB_TOKEN=\n');

    const report = await runDoctor({ agent: 'claude', fromScan: path.join(dir, 'agentdock.scan.yml'), out: dir });
    expect(report.healthy).toBe(true);
    expect(report.checks.find((c) => c.id === 'placeholder-consistency')?.status).toBe('pass');
    expect(report.reportPath).toBeDefined();
    await expect(fs.access(path.join(dir, 'doctor-report.md'))).resolves.toBeUndefined();
  });

  it('package: real token in payload FAILS (reverse case)', async () => {
    const pkg = await makeTempDir('doc-pkg-');
    await writeFile(
      path.join(pkg, 'payload', 'sources', '.claude', 'CLAUDE.md'),
      'token xoxb-REALOTHER99887766\n',
    );

    const report = await runDoctor({ agent: 'claude', package: pkg });
    expect(report.mode).toBe('package');
    expect(report.healthy).toBe(false);
    expect(report.checks.find((c) => c.id === 'pkg-leak')?.status).toBe('fail');
  });

  it('live codex: healthy env passes', async () => {
    const home = await makeTempDir('doc-codex-ok-');
    await writeFile(
      path.join(home, '.codex', 'config.toml'),
      'model = "gpt-5"\n\n[mcp_servers.github]\ncommand = "npx"\nenv = { GITHUB_TOKEN = "ghp_REALVALUE1234567890" }\n',
    );
    await writeFile(path.join(home, '.codex', 'AGENTS.md'), '# project memory\n');

    const report = await runDoctor({ agent: 'codex', root: home });
    expect(report.mode).toBe('live');
    expect(report.healthy).toBe(true);
    expect(report.checks.find((c) => c.id === 'config-valid')?.status).toBe('pass');
    expect(report.checks.find((c) => c.id === 'secret-leak')?.status).toBe('pass');
  });

  it('live codex: leaked token in AGENTS.md FAILS (reverse case)', async () => {
    const home = await makeTempDir('doc-codex-leak-');
    await writeFile(path.join(home, '.codex', 'config.toml'), 'model = "gpt-5"\n');
    await writeFile(path.join(home, '.codex', 'AGENTS.md'), 'use ghp_REALVALUE1234567890 now\n');

    const report = await runDoctor({ agent: 'codex', root: home });
    expect(report.healthy).toBe(false);
    const leak = report.checks.find((c) => c.id === 'secret-leak');
    expect(leak?.status).toBe('fail');
  });

  it('actionable: fail/warn checks carry a non-empty remediation', async () => {
    // live + a plaintext token in a skill file → secret-leak FAILS
    const home = await makeTempDir('doc-action-');
    await writeFile(
      path.join(home, '.claude', 'skills', 'bad', 'SKILL.md'),
      'token ghp_REALVALUE1234567890\n',
    );
    const report = await runDoctor({ agent: 'claude', root: home });
    const leak = report.checks.find((c) => c.id === 'secret-leak');
    expect(leak?.status).toBe('fail');
    expect(leak?.remediation && leak.remediation.length).toBeGreaterThan(0);
    // the remediation should tell the user what to DO (mention placeholder or .env)
    expect(leak?.remediation).toMatch(/占位符|\.env/);
  });

  describe('doctorExitCode (quantized)', () => {
    const mk = (status: DoctorCheck['status']): DoctorReportData => ({
      mode: 'live',
      target: '/tmp/x',
      healthy: status !== 'fail',
      summary: '',
      checks: [{ id: 'c', label: 'L', status, detail: 'd', findings: [] }],
    });

    it('all pass → 0', () => {
      expect(doctorExitCode(mk('pass'))).toBe(0);
    });
    it('contains warn only → 1', () => {
      expect(doctorExitCode(mk('warn'))).toBe(1);
    });
    it('contains fail → 2', () => {
      expect(doctorExitCode(mk('fail'))).toBe(2);
    });
    it('mixed warn+pass → 1 (worst non-fail)', () => {
      const report: DoctorReportData = {
        mode: 'live',
        target: '/tmp/x',
        healthy: true,
        summary: '',
        checks: [
          { id: 'a', label: 'A', status: 'pass', detail: 'd', findings: [] },
          { id: 'b', label: 'B', status: 'warn', detail: 'd', findings: [] },
        ],
      };
      expect(doctorExitCode(report)).toBe(1);
    });
  });
});
