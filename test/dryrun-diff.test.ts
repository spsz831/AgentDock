import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';

async function createDiffFixture() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-dryrun-'));
  const packageRoot = path.join(tempRoot, 'package');
  await fs.mkdir(path.join(packageRoot, 'payload', 'sources', 'workspace'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'payload', 'sources', 'settings'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'payload', 'sources', 'claude-json'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'meta'), { recursive: true });

  await fs.writeFile(path.join(packageRoot, 'payload', 'sources', 'workspace', 'note.txt'), 'hello', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'payload', 'sources', 'settings', 'settings.json'), '{"ok":true}', 'utf8');
  await fs.writeFile(
    path.join(packageRoot, 'payload', 'sources', 'claude-json', '.claude.json'),
    JSON.stringify({ mcpServers: { github: { type: 'stdio' } } }),
    'utf8',
  );
  await fs.writeFile(
    path.join(packageRoot, 'manifest.resolved.json'),
    JSON.stringify({ project: { name: 'pkg-demo' }, install: { overwrite: false } }, null, 2),
    'utf8',
  );
  await fs.writeFile(
    path.join(packageRoot, 'meta', 'install-plan.json'),
    JSON.stringify({
      targetPath: './restored',
      overwrite: false,
      sources: [
        { id: 'workspace', kind: 'directory', from: 'payload/sources/workspace', to: 'workspace' },
        { id: 'settings', kind: 'file', from: 'payload/sources/settings/settings.json', to: 'settings.json' },
        { id: 'claude-json', kind: 'file', from: 'payload/sources/claude-json/.claude.json', to: '.claude.json', merge: true },
      ],
      templates: [],
    }, null, 2),
    'utf8',
  );

  return { tempRoot, packageRoot };
}

describe('cli install --dry-run', () => {
  it('previews actions without writing any files', async () => {
    const { tempRoot, packageRoot } = await createDiffFixture();
    const targetRoot = path.join(tempRoot, 'target');

    const result = await runCli(['install', packageRoot, targetRoot, '--dry-run']);

    expect(result.exitCode).toBe(0);
    // Nothing should be written to the target.
    await expect(fs.access(path.join(targetRoot, 'settings.json'))).rejects.toBeTruthy();
    await expect(fs.access(path.join(targetRoot, 'workspace'))).rejects.toBeTruthy();
    expect(result.stdout.some((l) => l.includes('CREATE') && l.includes('settings.json'))).toBe(true);
    expect(result.stdout.some((l) => l.includes('MERGE') && l.includes('.claude.json'))).toBe(true);
  });

  it('marks a differing existing file as CONFLICT and never throws or writes', async () => {
    const { tempRoot, packageRoot } = await createDiffFixture();
    const targetRoot = path.join(tempRoot, 'conflict-target');
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'settings.json'), '{"changed":true}', 'utf8');

    const result = await runCli(['install', packageRoot, targetRoot, '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((l) => l.includes('CONFLICT') && l.includes('settings.json'))).toBe(true);
    // Target is untouched by a dry-run.
    await expect(fs.readFile(path.join(targetRoot, 'settings.json'), 'utf8')).resolves.toBe('{"changed":true}');
  });

  it('shows OVERWRITE (not CONFLICT) when --overwrite is supplied, still no write', async () => {
    const { tempRoot, packageRoot } = await createDiffFixture();
    const targetRoot = path.join(tempRoot, 'overwrite-target');
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'settings.json'), '{"changed":true}', 'utf8');

    const result = await runCli(['install', packageRoot, targetRoot, '--dry-run', '--overwrite']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((l) => l.includes('OVERWRITE') && l.includes('settings.json'))).toBe(true);
    await expect(fs.readFile(path.join(targetRoot, 'settings.json'), 'utf8')).resolves.toBe('{"changed":true}');
  });

  it('describes which mcpServers a merge entry would add when the target exists', async () => {
    const { tempRoot, packageRoot } = await createDiffFixture();
    const targetRoot = path.join(tempRoot, 'merge-target');
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(
      path.join(targetRoot, '.claude.json'),
      JSON.stringify({ mcpServers: { oldServer: { type: 'stdio' } } }),
      'utf8',
    );

    const result = await runCli(['install', packageRoot, targetRoot, '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((l) => l.includes('adds mcpServers [github]'))).toBe(true);
  });
});

describe('cli diff command', () => {
  it('shows NEW / MERGE for a fresh target and writes nothing', async () => {
    const { tempRoot, packageRoot } = await createDiffFixture();
    const targetRoot = path.join(tempRoot, 'diff-target');

    const result = await runCli(['diff', packageRoot, targetRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((l) => l.includes('NEW') && l.includes('settings.json'))).toBe(true);
    expect(result.stdout.some((l) => l.includes('MERGE') && l.includes('.claude.json'))).toBe(true);
    await expect(fs.access(path.join(targetRoot, 'settings.json'))).rejects.toBeTruthy();
  });

  it('flags a differing existing file as CONFLICT', async () => {
    const { tempRoot, packageRoot } = await createDiffFixture();
    const targetRoot = path.join(tempRoot, 'diff-conflict');
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'settings.json'), '{"changed":true}', 'utf8');

    const result = await runCli(['diff', packageRoot, targetRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((l) => l.includes('CONFLICT') && l.includes('settings.json'))).toBe(true);
  });

  it('returns a structured plan in --json mode', async () => {
    const { tempRoot, packageRoot } = await createDiffFixture();
    const targetRoot = path.join(tempRoot, 'diff-json');

    const result = await runCli(['diff', packageRoot, targetRoot, '--json']);

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout[0] ?? '{}');
    expect(payload.command).toBe('diff');
    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.data.entries)).toBe(true);
    expect(payload.data.entries.length).toBe(3);
    expect(payload.data.conflicts).toBe(0);
  });

  it('--json reports conflicts when the target diverges', async () => {
    const { tempRoot, packageRoot } = await createDiffFixture();
    const targetRoot = path.join(tempRoot, 'diff-json-conflict');
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'settings.json'), '{"changed":true}', 'utf8');

    const result = await runCli(['diff', packageRoot, targetRoot, '--json']);

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout[0] ?? '{}');
    expect(payload.data.conflicts).toBeGreaterThanOrEqual(1);
  });
});
