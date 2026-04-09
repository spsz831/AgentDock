import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';

describe('cli upgrade command', () => {
  it('shows diff and does not write file when dry-run is enabled', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-upgrade-'));
    const manifestPath = path.join(tempRoot, 'agentdock.yml');
    const original = [
      'version: 1',
      'project:',
      '  name: legacy-demo',
      'sources:',
      '  - id: workspace',
      '    type: directory',
      '    path: ./workspace',
      'outputs:',
      '  type: directory',
      '  path: ./dist/out',
    ].join('\n');

    await fs.writeFile(manifestPath, original, 'utf8');
    const result = await runCli(['upgrade', manifestPath, '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((line) => line.includes('Dry run'))).toBe(true);
    expect(result.stdout.some((line) => line.includes('+version: 2'))).toBe(true);
    const after = await fs.readFile(manifestPath, 'utf8');
    expect(after).toBe(original);
  });

  it('upgrades a v1 manifest into v2 with source destinations', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-upgrade-'));
    const manifestPath = path.join(tempRoot, 'agentdock.yml');

    await fs.writeFile(
      manifestPath,
      [
        'version: 1',
        'project:',
        '  name: legacy-demo',
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

    const result = await runCli(['upgrade', manifestPath]);

    expect(result.exitCode).toBe(0);
    const upgraded = await fs.readFile(manifestPath, 'utf8');
    expect(upgraded).toContain('version: 2');
    expect(upgraded).toContain('destination: ./workspace');
    expect(upgraded).toContain('destination: ./settings.json');
  });
});
