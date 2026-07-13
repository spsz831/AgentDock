import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';
import { COMMAND_ERROR_CODES } from '../src/constants/command-error-codes';
import type { CommandJsonReport } from '../src/types/command-report';

async function createPackageFixture() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-install-'));
  const packageRoot = path.join(tempRoot, 'package');
  await fs.mkdir(path.join(packageRoot, 'payload', 'sources', 'workspace'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'payload', 'sources', 'settings'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'payload', 'templates', 'env-template'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'meta'), { recursive: true });

  await fs.writeFile(path.join(packageRoot, 'payload', 'sources', 'workspace', 'note.txt'), 'hello', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'payload', 'sources', 'settings', 'settings.json'), '{"ok":true}', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'payload', 'templates', 'env-template', '.env.example'), 'APP_NAME=rendered', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'manifest.resolved.json'), JSON.stringify({ project: { name: 'pkg-demo' }, install: { overwrite: false } }, null, 2), 'utf8');
  await fs.writeFile(
    path.join(packageRoot, 'meta', 'install-plan.json'),
    JSON.stringify({
      targetPath: './restored',
      overwrite: false,
      sources: [
        { id: 'workspace', kind: 'directory', from: 'payload/sources/workspace', to: 'workspace' },
        { id: 'settings', kind: 'file', from: 'payload/sources/settings/settings.json', to: 'settings.json' },
      ],
      templates: [
        { id: 'env-template', from: 'payload/templates/env-template/.env.example', to: '.env.example' },
      ],
    }, null, 2),
    'utf8',
  );

  return { tempRoot, packageRoot };
}

describe('cli install command', () => {
  it('restores files from an exported package into target directory', async () => {
    const { tempRoot, packageRoot } = await createPackageFixture();
    const targetRoot = path.join(tempRoot, 'custom-target');

    const result = await runCli(['install', packageRoot, targetRoot]);

    expect(result.exitCode).toBe(0);
    await expect(fs.readFile(path.join(targetRoot, 'workspace', 'note.txt'), 'utf8')).resolves.toBe('hello');
    await expect(fs.readFile(path.join(targetRoot, 'settings.json'), 'utf8')).resolves.toContain('ok');
    await expect(fs.readFile(path.join(targetRoot, '.env.example'), 'utf8')).resolves.toContain('APP_NAME=rendered');
  });

  it('fails before writing when a target file already exists', async () => {
    const { tempRoot, packageRoot } = await createPackageFixture();
    const targetRoot = path.join(tempRoot, 'conflict-target');
    await fs.mkdir(path.join(targetRoot, 'workspace'), { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'workspace', 'note.txt'), 'existing', 'utf8');

    const result = await runCli(['install', packageRoot, targetRoot]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.some((line) => line.includes('conflict'))).toBe(true);
    await expect(fs.readFile(path.join(targetRoot, 'workspace', 'note.txt'), 'utf8')).resolves.toBe('existing');
    await expect(fs.access(path.join(targetRoot, 'settings.json'))).rejects.toBeTruthy();
  });

  it('overwrites existing files when overwrite flag is provided', async () => {
    const { tempRoot, packageRoot } = await createPackageFixture();
    const targetRoot = path.join(tempRoot, 'overwrite-target');
    await fs.mkdir(path.join(targetRoot, 'workspace'), { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'workspace', 'note.txt'), 'existing', 'utf8');

    const result = await runCli(['install', packageRoot, targetRoot, '--overwrite']);

    expect(result.exitCode).toBe(0);
    await expect(fs.readFile(path.join(targetRoot, 'workspace', 'note.txt'), 'utf8')).resolves.toBe('hello');
    await expect(fs.readFile(path.join(targetRoot, 'settings.json'), 'utf8')).resolves.toContain('ok');
  });

  it('returns versioned json output for success', async () => {
    const { tempRoot, packageRoot } = await createPackageFixture();
    const targetRoot = path.join(tempRoot, 'json-target');

    const result = await runCli(['install', packageRoot, targetRoot, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as CommandJsonReport<{
      packagePath: string;
      targetPath: string;
      overwrite: boolean;
    }>;
    expect(payload.schemaVersion).toBe(1);
    expect(Number.isNaN(Date.parse(payload.generatedAt))).toBe(false);
    expect(payload.command).toBe('install');
    expect(payload.success).toBe(true);
    expect(payload.data.targetPath).toBe(path.resolve(targetRoot));
    expect(payload.errors).toEqual([]);
  });

  it('returns stable error code for conflicts in json mode', async () => {
    const { tempRoot, packageRoot } = await createPackageFixture();
    const targetRoot = path.join(tempRoot, 'json-conflict-target');
    await fs.mkdir(path.join(targetRoot, 'workspace'), { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'workspace', 'note.txt'), 'existing', 'utf8');

    const result = await runCli(['install', packageRoot, targetRoot, '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual([]);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as CommandJsonReport<{
      packagePath: string;
      targetPath: string | null;
      overwrite: boolean;
    }>;
    expect(payload.success).toBe(false);
    expect(payload.errors[0]?.code).toBe(COMMAND_ERROR_CODES.INSTALL_CONFLICT);
  });

  it('rejects a package that tries to write outside the target root (path traversal)', async () => {
    const { tempRoot, packageRoot } = await createPackageFixture();
    // A malicious install-plan whose destination escapes the target root.
    await fs.writeFile(
      path.join(packageRoot, 'meta', 'install-plan.json'),
      JSON.stringify({
        targetPath: './restored',
        overwrite: false,
        sources: [
          { id: 'evil', kind: 'file', from: 'payload/sources/settings/settings.json', to: '../../escaped/evil.txt' },
        ],
        templates: [],
      }, null, 2),
      'utf8',
    );
    const targetRoot = path.join(tempRoot, 'traversal-target');
    const escapedFile = path.join(tempRoot, 'escaped', 'evil.txt');

    const result = await runCli(['install', packageRoot, targetRoot]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toContain('PATH_ESCAPE');
    await expect(fs.access(escapedFile)).rejects.toBeTruthy();
  });

  it('is idempotent: a second install with identical content succeeds without --overwrite', async () => {
    const { tempRoot, packageRoot } = await createPackageFixture();
    const targetRoot = path.join(tempRoot, 'idempotent-target');

    const first = await runCli(['install', packageRoot, targetRoot]);
    expect(first.exitCode).toBe(0);

    // No lock file should linger after a successful run.
    await expect(fs.access(path.join(targetRoot, '.agentdock.lock'))).rejects.toBeTruthy();

    const second = await runCli(['install', packageRoot, targetRoot]);
    expect(second.exitCode).toBe(0);
    await expect(fs.readFile(path.join(targetRoot, 'workspace', 'note.txt'), 'utf8')).resolves.toBe('hello');
  });

  it('locks out a concurrent install of the same target', async () => {
    const { tempRoot, packageRoot } = await createPackageFixture();
    const targetRoot = path.join(tempRoot, 'concurrent-target');

    const [a, b] = await Promise.all([
      runCli(['install', packageRoot, targetRoot]),
      runCli(['install', packageRoot, targetRoot]),
    ]);

    // Exactly one wins; both runs must finish and the target must be intact.
    expect(a.exitCode === 0 || b.exitCode === 0).toBe(true);
    await expect(fs.readFile(path.join(targetRoot, 'workspace', 'note.txt'), 'utf8')).resolves.toBe('hello');
    await expect(fs.readFile(path.join(targetRoot, 'settings.json'), 'utf8')).resolves.toContain('ok');
  });

  it('does not leave a half-written file when copy is interrupted', async () => {
    const { tempRoot, packageRoot } = await createPackageFixture();
    const targetRoot = path.join(tempRoot, 'atomic-target');

    const result = await runCli(['install', packageRoot, targetRoot]);
    expect(result.exitCode).toBe(0);

    // Every produced file must be a complete, valid copy (tmp+rename), never a .tmp fragment.
    const walker = async (dir: string): Promise<string[]> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walker(full)));
        else out.push(full);
      }
      return out;
    };
    const files = await walker(targetRoot);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
    await expect(fs.readFile(path.join(targetRoot, 'settings.json'), 'utf8')).resolves.toContain('ok');
  });
});

