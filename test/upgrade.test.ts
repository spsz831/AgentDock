import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';
import { COMMAND_ERROR_CODES } from '../src/constants/command-error-codes';
import { UPGRADE_WARNING_CODES } from '../src/constants/upgrade-warning-codes';
import type { UpgradeJsonReport } from '../src/types/upgrade-report';

describe('cli upgrade command', () => {
  it('prints stable summary without diff and does not write file in dry-run mode', async () => {
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
    expect(result.stdout.some((line) => line === 'Upgrade summary:')).toBe(true);
    expect(result.stdout.some((line) => line.includes('mode: dry-run'))).toBe(true);
    expect(result.stdout.some((line) => line.includes('version: 1 -> 2'))).toBe(true);
    expect(result.stdout.some((line) => line.includes('+version: 2'))).toBe(false);
    const after = await fs.readFile(manifestPath, 'utf8');
    expect(after).toBe(original);
  });

  it('prints diff only when --verbose is enabled', async () => {
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
    const result = await runCli(['upgrade', manifestPath, '--dry-run', '--verbose']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((line) => line === 'diff:')).toBe(true);
    expect(result.stdout.some((line) => line.includes('+version: 2'))).toBe(true);
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
    const payload = JSON.parse(result.stdout[0] ?? '{}') as UpgradeJsonReport;
    expect(payload.command).toBe('upgrade');
    expect(payload.schemaVersion).toBe(1);
    expect(Number.isNaN(Date.parse(payload.generatedAt))).toBe(false);
    expect(payload.success).toBe(true);
    expect(payload.data.dryRun).toBe(true);
    expect(payload.data.changed).toBe(true);
    expect(payload.data.fromVersion).toBe(1);
    expect(payload.data.toVersion).toBe(2);
    expect(payload.data.diff.some((line) => line.includes('+version: 2'))).toBe(true);
    expect(payload.data.summary.addedDestinationCount).toBe(1);
    expect(payload.data.summary.changedLineCount > 0).toBe(true);
    expect(payload.data.summary.sourceCount).toBe(1);
    expect(payload.data.summary.templateCount).toBe(0);
    expect(payload.data.summary.warningCount).toBe(0);
    expect(payload.data.summary.warnings).toEqual([]);
    expect(payload.errors).toEqual([]);

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
    expect(result.stdout.some((line) => line === 'Upgrade summary:')).toBe(true);
    expect(result.stdout.some((line) => line.includes('mode: write'))).toBe(true);
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
    const payload = JSON.parse(result.stdout[0] ?? '{}') as UpgradeJsonReport;
    expect(payload.success).toBe(true);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.data.changed).toBe(true);
    expect(payload.data.outputPath).toBe(path.resolve(targetManifestPath));

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
    const payload = JSON.parse(result.stdout[0] ?? '{}') as UpgradeJsonReport;
    expect(payload.success).toBe(true);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.data.changed).toBe(true);
    expect(payload.data.diff.some((line) => line.includes('+    destination: ./workspace'))).toBe(true);
    expect(payload.data.summary.warningCount).toBe(0);
    expect(payload.data.summary.warnings).toEqual([]);
    const upgraded = await fs.readFile(manifestPath, 'utf8');
    expect(upgraded).toContain('destination: ./workspace');
  });

  it('reports warningCount for formatting-only force changes', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-upgrade-'));
    const manifestPath = path.join(tempRoot, 'agentdock.v2.format.yml');

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
        '    destination: ./workspace',
        '    include:',
        "      - '**/*.json'",
        'outputs:',
        '  type: directory',
        '  path: ./dist/out',
      ].join('\n'),
      'utf8',
    );

    const result = await runCli(['upgrade', manifestPath, '--force', '--dry-run', '--json']);

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as UpgradeJsonReport;
    expect(payload.success).toBe(true);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.data.changed).toBe(true);
    expect(payload.data.summary.addedDestinationCount).toBe(0);
    expect(payload.data.summary.warningCount).toBe(1);
    expect(payload.data.summary.warnings[0]?.code).toBe(UPGRADE_WARNING_CODES.FORMAT_ONLY_CHANGE);
    expect(payload.data.summary.warnings[0]?.message?.length).toBeGreaterThan(0);
  });

  it('returns stable error code when manifest path is missing in json mode', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-upgrade-json-'));
    const missingPath = path.join(tempRoot, 'missing.yml');

    const result = await runCli(['upgrade', missingPath, '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual([]);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as UpgradeJsonReport;
    expect(payload.success).toBe(false);
    expect(payload.errors[0]?.code).toBe(COMMAND_ERROR_CODES.MANIFEST_NOT_FOUND);
  });
});
