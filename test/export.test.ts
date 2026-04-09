import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';

async function createTempManifest() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-export-'));
  const workspaceDir = path.join(tempRoot, 'workspace');
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(path.join(workspaceDir, 'settings.json'), '{"ok":true}', 'utf8');
  await fs.writeFile(path.join(workspaceDir, 'note.txt'), 'hello', 'utf8');

  const manifestPath = path.join(tempRoot, 'agentdock.yml');
  await fs.writeFile(
    manifestPath,
    [
      'version: 1',
      'project:',
      '  name: export-demo',
      'sources:',
      '  - id: workspace',
      '    type: directory',
      '    path: ./workspace',
      '  - id: settings',
      '    type: file',
      '    path: ./workspace/settings.json',
      'outputs:',
      '  type: directory',
      '  path: ./dist/out',
    ].join('\n'),
    'utf8',
  );

  return { tempRoot, manifestPath };
}

describe('cli export command', () => {
  it('exports declared sources and manifest snapshot', async () => {
    const { tempRoot, manifestPath } = await createTempManifest();

    const result = await runCli(['export', manifestPath]);

    expect(result.exitCode).toBe(0);

    const outputRoot = path.join(tempRoot, 'dist', 'out');
    await expect(fs.readFile(path.join(outputRoot, 'workspace', 'note.txt'), 'utf8')).resolves.toBe('hello');
    await expect(fs.readFile(path.join(outputRoot, 'settings.json'), 'utf8')).resolves.toContain('ok');
    await expect(fs.readFile(path.join(outputRoot, 'manifest.resolved.json'), 'utf8')).resolves.toContain('export-demo');
  });
});
