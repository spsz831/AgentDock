import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli';

const MANIFEST = `version: 2
project:
  name: agentdock-demo
sources:
  - id: workspace
    type: directory
    path: ./workspace
    destination: ./restored/workspace
    include:
      - '**/*.json'
      - '**/*.txt'
    exclude:
      - '**/*.bak'
  - id: settings
    type: file
    path: ./workspace/settings.json
    destination: ./restored/config/settings.json
templates:
  - id: env-template
    source: ./templates/.env.example
    destination: ./restored/.env
    variables:
      APP_NAME: agentdock-demo
      MODE: production
outputs:
  type: directory
  path: ./dist/exported
install:
  mode: package
  targetPath: ./dist/restored
  overwrite: false
`;

async function scaffold(prefix: string): Promise<{ root: string; manifestPath: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.mkdir(path.join(root, 'workspace'), { recursive: true });
  await fs.mkdir(path.join(root, 'templates'), { recursive: true });
  await fs.writeFile(path.join(root, 'workspace', 'settings.json'), '{"ok":true}', 'utf8');
  await fs.writeFile(path.join(root, 'workspace', 'note.txt'), 'hello-e2e', 'utf8');
  await fs.writeFile(path.join(root, 'workspace', 'skip.bak'), 'do-not-export', 'utf8');
  await fs.writeFile(path.join(root, 'templates', '.env.example'), 'APP_NAME={{APP_NAME}}\nMODE={{MODE}}', 'utf8');
  const manifestPath = path.join(root, 'agentdock.yml');
  await fs.writeFile(manifestPath, MANIFEST, 'utf8');
  return { root, manifestPath };
}

describe('e2e cli workflow', () => {
  it('runs validate -> export -> install successfully', async () => {
    const { root, manifestPath } = await scaffold('agentdock-e2e-ok-');

    const validateResult = await runCli(['validate', manifestPath]);
    expect(validateResult.exitCode).toBe(0);

    const exportResult = await runCli(['export', manifestPath]);
    expect(exportResult.exitCode).toBe(0);

    const packageRoot = path.join(root, 'dist', 'exported');
    const installTarget = path.join(root, 'restored-target');
    const installResult = await runCli(['install', packageRoot, installTarget]);
    expect(installResult.exitCode).toBe(0);

    await expect(fs.readFile(path.join(installTarget, 'restored', 'workspace', 'note.txt'), 'utf8')).resolves.toBe('hello-e2e');
    await expect(fs.readFile(path.join(installTarget, 'restored', 'config', 'settings.json'), 'utf8')).resolves.toContain('"ok":true');
    await expect(fs.readFile(path.join(installTarget, 'restored', '.env'), 'utf8')).resolves.toContain('APP_NAME=agentdock-demo');
    await expect(fs.access(path.join(installTarget, 'restored', 'workspace', 'skip.bak'))).rejects.toBeTruthy();
  });

  it('fails export when template variables are missing', async () => {
    const { manifestPath } = await scaffold('agentdock-e2e-fail-');
    await fs.writeFile(
      path.join(path.dirname(manifestPath), 'templates', '.env.example'),
      'APP_NAME={{APP_NAME}}\nMODE={{MODE}}\nSECRET={{SECRET}}',
      'utf8',
    );

    const exportResult = await runCli(['export', manifestPath]);
    expect(exportResult.exitCode).toBe(1);
    expect(exportResult.stderr.some((line) => line.includes('Missing template variable(s)'))).toBe(true);
  });
});
