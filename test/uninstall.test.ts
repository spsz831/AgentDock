import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';

async function createUninstallFixture() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-uninstall-'));
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

describe('cli uninstall command', () => {
  it('removes installed files and reverses merges after a real install', async () => {
    const { tempRoot, packageRoot } = await createUninstallFixture();
    const targetRoot = path.join(tempRoot, 'target');
    await runCli(['install', packageRoot, targetRoot]);

    const result = await runCli(['uninstall', packageRoot, targetRoot]);

    expect(result.exitCode).toBe(0);
    await expect(fs.access(path.join(targetRoot, 'settings.json'))).rejects.toBeTruthy();
    await expect(fs.access(path.join(targetRoot, 'workspace'))).rejects.toBeTruthy();
    // The package's mcpServer must be gone, even though the .claude.json file remains.
    const claude = JSON.parse(await fs.readFile(path.join(targetRoot, '.claude.json'), 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(claude.mcpServers.github).toBeUndefined();
  });

  it('does not delete anything under --dry-run', async () => {
    const { tempRoot, packageRoot } = await createUninstallFixture();
    const targetRoot = path.join(tempRoot, 'target');
    await runCli(['install', packageRoot, targetRoot]);

    const result = await runCli(['uninstall', packageRoot, targetRoot, '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((l) => l.includes('REMOVE') && l.includes('settings.json'))).toBe(true);
    // Nothing was actually removed.
    await expect(fs.access(path.join(targetRoot, 'settings.json'))).resolves.toBeUndefined();
  });

  it('skips a modified file without --force, removes it with --force', async () => {
    const { tempRoot, packageRoot } = await createUninstallFixture();
    const targetRoot = path.join(tempRoot, 'target');
    await runCli(['install', packageRoot, targetRoot]);
    await fs.writeFile(path.join(targetRoot, 'settings.json'), '{"changed":true}', 'utf8');

    const skip = await runCli(['uninstall', packageRoot, targetRoot]);
    expect(skip.exitCode).toBe(0);
    expect(skip.stdout.some((l) => l.includes('SKIP(modified)') && l.includes('settings.json'))).toBe(true);
    await expect(fs.readFile(path.join(targetRoot, 'settings.json'), 'utf8')).resolves.toContain('changed');

    const force = await runCli(['uninstall', packageRoot, targetRoot, '--force']);
    expect(force.stdout.some((l) => l.includes('REMOVE') && l.includes('settings.json'))).toBe(true);
    await expect(fs.access(path.join(targetRoot, 'settings.json'))).rejects.toBeTruthy();
  });

  it('keeps the user\'s own mcpServers while removing the package\'s', async () => {
    const { tempRoot, packageRoot } = await createUninstallFixture();
    const targetRoot = path.join(tempRoot, 'target');
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(
      path.join(targetRoot, '.claude.json'),
      JSON.stringify({ mcpServers: { userServer: { type: 'stdio' } } }),
      'utf8',
    );

    await runCli(['install', packageRoot, targetRoot]);
    const result = await runCli(['uninstall', packageRoot, targetRoot]);

    expect(result.exitCode).toBe(0);
    const claude = JSON.parse(await fs.readFile(path.join(targetRoot, '.claude.json'), 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(claude.mcpServers.github).toBeUndefined();
    expect(claude.mcpServers.userServer).toBeDefined();
  });

  it('reports skip-missing and stays clean when the target is empty', async () => {
    const { tempRoot, packageRoot } = await createUninstallFixture();
    const targetRoot = path.join(tempRoot, 'empty-target');

    const result = await runCli(['uninstall', packageRoot, targetRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((l) => l.includes('SKIP(missing)'))).toBe(true);
  });
});
