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

  it('emits json diff payload in dry-run json mode', async () => {
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
    const result = await runCli(['upgrade', manifestPath, '--dry-run', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBe(1);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as {
      dryRun: boolean;
      changed: boolean;
      fromVersion: number;
      toVersion: number;
      diff: string[];
      summary?: {
        addedDestinationCount: number;
        changedLineCount: number;
      };
    };
    expect(payload.dryRun).toBe(true);
    expect(payload.changed).toBe(true);
    expect(payload.fromVersion).toBe(1);
    expect(payload.toVersion).toBe(2);
    expect(payload.diff.some((line) => line.includes('+version: 2'))).toBe(true);
    expect(payload.summary?.addedDestinationCount).toBe(1);
    expect((payload.summary?.changedLineCount ?? 0) > 0).toBe(true);

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

  it('writes upgraded manifest to a new file with --write and keeps original unchanged', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-upgrade-'));
    const sourceManifestPath = path.join(tempRoot, 'agentdock.v1.yml');
    const targetManifestPath = path.join(tempRoot, 'agentdock.v2.yml');
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

    await fs.writeFile(sourceManifestPath, original, 'utf8');
    const result = await runCli(['upgrade', sourceManifestPath, '--write', targetManifestPath, '--json']);

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as { changed: boolean; outputPath?: string };
    expect(payload.changed).toBe(true);
    expect(payload.outputPath).toBe(path.resolve(targetManifestPath));

    const sourceAfter = await fs.readFile(sourceManifestPath, 'utf8');
    const targetAfter = await fs.readFile(targetManifestPath, 'utf8');
    expect(sourceAfter).toBe(original);
    expect(targetAfter).toContain('version: 2');
    expect(targetAfter).toContain('destination: ./workspace');
  });

  it('creates backup file before in-place upgrade when --backup is enabled', async () => {
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
    const result = await runCli(['upgrade', manifestPath, '--backup']);

    expect(result.exitCode).toBe(0);
    const files = await fs.readdir(tempRoot);
    const backupName = files.find((file) => file.startsWith('agentdock.yml.bak.'));
    expect(backupName).toBeTruthy();
    const backupContent = await fs.readFile(path.join(tempRoot, backupName ?? ''), 'utf8');
    const upgradedContent = await fs.readFile(manifestPath, 'utf8');
    expect(backupContent).toBe(original);
    expect(upgradedContent).toContain('version: 2');
  });

  it('reprocesses v2 manifest with --force and fills missing destinations', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-upgrade-'));
    const manifestPath = path.join(tempRoot, 'agentdock.v2.yml');

    await fs.writeFile(
      manifestPath,
      [
        'version: 2',
        'project:',
        '  name: v2-demo',
        'sources:',
        '  - id: workspace',
        '    type: directory',
        '    path: ./workspace',
        'outputs:',
        '  type: directory',
        '  path: ./dist/out',
      ].join('\n'),
      'utf8',
    );

    const result = await runCli(['upgrade', manifestPath, '--force', '--json']);

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as { changed: boolean; diff: string[] };
    expect(payload.changed).toBe(true);
    expect(payload.diff.some((line) => line.includes('+    destination: ./workspace'))).toBe(true);
    const upgraded = await fs.readFile(manifestPath, 'utf8');
    expect(upgraded).toContain('destination: ./workspace');
  });
});
