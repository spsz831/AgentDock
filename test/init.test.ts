import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';
import { COMMAND_ERROR_CODES } from '../src/constants/command-error-codes';
import type { CommandJsonReport } from '../src/types/command-report';

describe('cli init command', () => {
  it('creates agentdock.yml in an empty directory', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-init-'));

    const result = await runCli(['init', tempRoot]);

    expect(result.exitCode).toBe(0);
    await expect(fs.readFile(path.join(tempRoot, 'agentdock.yml'), 'utf8')).resolves.toContain('version: 2');
  });

  it('does not overwrite an existing manifest by default', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-init-'));
    const manifestPath = path.join(tempRoot, 'agentdock.yml');
    await fs.writeFile(manifestPath, 'custom: true\n', 'utf8');

    const result = await runCli(['init', tempRoot]);

    expect(result.exitCode).toBe(1);
    await expect(fs.readFile(manifestPath, 'utf8')).resolves.toBe('custom: true\n');
  });

  it('returns versioned json output for success', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-init-json-'));

    const result = await runCli(['init', tempRoot, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as CommandJsonReport<{
      targetDirectory: string;
      manifestPath: string;
    }>;
    expect(payload.schemaVersion).toBe(1);
    expect(Number.isNaN(Date.parse(payload.generatedAt))).toBe(false);
    expect(payload.command).toBe('init');
    expect(payload.success).toBe(true);
    expect(payload.data.manifestPath).toBe(path.join(path.resolve(tempRoot), 'agentdock.yml'));
    expect(payload.errors).toEqual([]);
  });

  it('returns stable error code when manifest already exists in json mode', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-init-json-'));
    await fs.writeFile(path.join(tempRoot, 'agentdock.yml'), 'version: 2\n', 'utf8');

    const result = await runCli(['init', tempRoot, '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual([]);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as CommandJsonReport<{
      targetDirectory: string;
      manifestPath: string;
    }>;
    expect(payload.success).toBe(false);
    expect(payload.errors[0]?.code).toBe(COMMAND_ERROR_CODES.MANIFEST_ALREADY_EXISTS);
  });
});
