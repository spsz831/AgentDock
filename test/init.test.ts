import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';

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
});
