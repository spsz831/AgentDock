import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';

async function createTempManifest() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-export-'));
  const workspaceDir = path.join(tempRoot, 'workspace');
  const templatesDir = path.join(tempRoot, 'templates');
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(templatesDir, { recursive: true });
  await fs.writeFile(path.join(workspaceDir, 'settings.json'), '{"ok":true}', 'utf8');
  await fs.writeFile(path.join(workspaceDir, 'note.txt'), 'hello', 'utf8');
  await fs.writeFile(path.join(workspaceDir, 'secret.bak'), 'ignore-me', 'utf8');
  await fs.writeFile(path.join(templatesDir, '.env.example'), 'APP_NAME={{APP_NAME}}\nMODE={{MODE}}', 'utf8');

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
      '    include:',
      '      - "**/*.json"',
      '      - "**/*.txt"',
      '    exclude:',
      '      - "**/*.bak"',
      '  - id: settings',
      '    type: file',
      '    path: ./workspace/settings.json',
      'templates:',
      '  - id: env-template',
      '    source: ./templates/.env.example',
      '    destination: ./.env',
      '    variables:',
      '      APP_NAME: export-demo',
      '      MODE: production',
      'outputs:',
      '  type: directory',
      '  path: ./dist/out',
      'install:',
      '  mode: package',
      '  targetPath: ./restore-target',
    ].join('\n'),
    'utf8',
  );

  return { tempRoot, manifestPath };
}

describe('cli export command', () => {
  it('exports payload by source/template id and writes install plan', async () => {
    const { tempRoot, manifestPath } = await createTempManifest();

    const result = await runCli(['export', manifestPath]);

    expect(result.exitCode).toBe(0);

    const outputRoot = path.join(tempRoot, 'dist', 'out');
    await expect(fs.readFile(path.join(outputRoot, 'payload', 'sources', 'workspace', 'note.txt'), 'utf8')).resolves.toBe('hello');
    await expect(fs.readFile(path.join(outputRoot, 'payload', 'sources', 'workspace', 'settings.json'), 'utf8')).resolves.toContain('ok');
    await expect(fs.access(path.join(outputRoot, 'payload', 'sources', 'workspace', 'secret.bak'))).rejects.toBeTruthy();
    await expect(fs.readFile(path.join(outputRoot, 'payload', 'sources', 'settings', 'settings.json'), 'utf8')).resolves.toContain('ok');
    await expect(fs.readFile(path.join(outputRoot, 'payload', 'templates', 'env-template', '.env.example'), 'utf8')).resolves.toContain('APP_NAME=export-demo');
    await expect(fs.readFile(path.join(outputRoot, 'payload', 'templates', 'env-template', '.env.example'), 'utf8')).resolves.toContain('MODE=production');
    await expect(fs.readFile(path.join(outputRoot, 'manifest.resolved.json'), 'utf8')).resolves.toContain('export-demo');
    await expect(fs.readFile(path.join(outputRoot, 'meta', 'install-plan.json'), 'utf8')).resolves.toContain('restore-target');
    await expect(fs.readFile(path.join(outputRoot, 'package.json'), 'utf8')).resolves.toContain('agentdock-package');
  });

  it('fails export when a template variable is missing', async () => {
    const { tempRoot } = await createTempManifest();
    const brokenManifestPath = path.join(tempRoot, 'agentdock-missing-var.yml');

    await fs.writeFile(
      brokenManifestPath,
      [
        'version: 1',
        'project:',
        '  name: export-demo',
        'sources:',
        '  - id: workspace',
        '    type: directory',
        '    path: ./workspace',
        'templates:',
        '  - id: env-template',
        '    source: ./templates/.env.example',
        '    destination: ./.env',
        '    variables:',
        '      APP_NAME: export-demo',
        'outputs:',
        '  type: directory',
        '  path: ./dist/out-broken',
      ].join('\n'),
      'utf8',
    );

    const result = await runCli(['export', brokenManifestPath]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.some((line) => line.includes('Missing template variable'))).toBe(true);
  });
});
