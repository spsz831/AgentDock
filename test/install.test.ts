import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';

async function createPackageFixture() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-install-'));
  const packageRoot = path.join(tempRoot, 'package');
  await fs.mkdir(path.join(packageRoot, 'payload', 'sources', 'workspace'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'payload', 'sources', 'settings'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'payload', 'templates', 'env-template'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'meta'), { recursive: true });

  await fs.writeFile(path.join(packageRoot, 'payload', 'sources', 'workspace', 'note.txt'), 'hello', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'payload', 'sources', 'settings', 'settings.json'), '{"ok":true}', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'payload', 'templates', 'env-template', '.env.example'), 'APP_NAME={{APP_NAME}}', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'manifest.resolved.json'), JSON.stringify({ project: { name: 'pkg-demo' } }, null, 2), 'utf8');
  await fs.writeFile(
    path.join(packageRoot, 'meta', 'install-plan.json'),
    JSON.stringify({
      targetPath: './restored',
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
    await expect(fs.readFile(path.join(targetRoot, '.env.example'), 'utf8')).resolves.toContain('APP_NAME');
  });
});
