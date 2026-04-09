import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';
import { COMMAND_ERROR_CODES } from '../src/constants/command-error-codes';
import type { CommandJsonReport } from '../src/types/command-report';

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
      'version: 2',
      'project:',
      '  name: export-demo',
      'sources:',
      '  - id: workspace',
      '    type: directory',
      '    path: ./workspace',
      '    destination: ./restored/workspace',
      '    include:',
      '      - "**/*.json"',
      '      - "**/*.txt"',
      '    exclude:',
      '      - "**/*.bak"',
      '  - id: settings',
      '    type: file',
      '    path: ./workspace/settings.json',
      '    destination: ./restored/config/settings.json',
      'templates:',
      '  - id: env-template',
      '    source: ./templates/.env.example',
      '    destination: ./restored/.env',
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
  it('writes install plan using source destination mappings', async () => {
    const { tempRoot, manifestPath } = await createTempManifest();

    const result = await runCli(['export', manifestPath]);

    expect(result.exitCode).toBe(0);

    const outputRoot = path.join(tempRoot, 'dist', 'out');
    const installPlan = await fs.readFile(path.join(outputRoot, 'meta', 'install-plan.json'), 'utf8');

    expect(installPlan).toContain('restored/workspace');
    expect(installPlan).toContain('restored/config/settings.json');
    expect(installPlan).toContain('restored/.env');
  });

  it('returns versioned json output for success', async () => {
    const { manifestPath } = await createTempManifest();
    const result = await runCli(['export', manifestPath, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as CommandJsonReport<{
      manifestPath: string;
      outputPath: string;
      snapshotPath: string;
      installPlanPath: string;
    }>;
    expect(payload.schemaVersion).toBe(1);
    expect(Number.isNaN(Date.parse(payload.generatedAt))).toBe(false);
    expect(payload.command).toBe('export');
    expect(payload.success).toBe(true);
    expect(payload.data.outputPath.length).toBeGreaterThan(0);
    expect(payload.errors).toEqual([]);
  });

  it('returns stable error code when template variable is missing in json mode', async () => {
    const { tempRoot, manifestPath } = await createTempManifest();
    await fs.writeFile(path.join(tempRoot, 'templates', '.env.example'), 'APP_NAME={{APP_NAME}}\nSECRET={{SECRET}}', 'utf8');

    const result = await runCli(['export', manifestPath, '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual([]);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as CommandJsonReport<{ manifestPath: string }>;
    expect(payload.success).toBe(false);
    expect(payload.errors[0]?.code).toBe(COMMAND_ERROR_CODES.TEMPLATE_VARIABLE_MISSING);
  });
});
