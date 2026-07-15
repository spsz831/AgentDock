import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';

let tempFile: string;

beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-config-'));
  tempFile = path.join(dir, 'config.json');
  process.env.AGENTDOCK_CONFIG = tempFile;
});

afterEach(() => {
  delete process.env.AGENTDOCK_CONFIG;
});

describe('cli config command', () => {
  it('lists unset defaults when no config file exists', async () => {
    const result = await runCli(['config', 'list']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((l) => l.includes('agent = (unset)'))).toBe(true);
  });

  it('sets and gets a value, persisting to disk', async () => {
    const setRes = await runCli(['config', 'set', 'agent', 'codex']);
    expect(setRes.exitCode).toBe(0);
    expect(setRes.stdout.join(' ')).toContain('agent = codex');

    const getRes = await runCli(['config', 'get', 'agent']);
    expect(getRes.exitCode).toBe(0);
    expect(getRes.stdout.join(' ')).toContain('codex');

    const onDisk = JSON.parse(await fs.readFile(tempFile, 'utf8')) as { agent: string };
    expect(onDisk.agent).toBe('codex');
  });

  it('rejects an invalid agent value', async () => {
    const result = await runCli(['config', 'set', 'agent', 'bogus']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join(' ')).toContain('must be one of');
  });

  it('rejects an unknown key', async () => {
    const result = await runCli(['config', 'set', 'nope', 'x']);
    expect(result.exitCode).toBe(1);
  });

  it('returns structured json for list', async () => {
    await runCli(['config', 'set', 'out', '/tmp/x']);
    const res = await runCli(['config', 'list', '--json']);
    expect(res.exitCode).toBe(0);
    const payload = JSON.parse(res.stdout[0] ?? '{}');
    expect(payload.data.config.out).toBe('/tmp/x');
  });

  it('scan honors the configured default agent', async () => {
    await runCli(['config', 'set', 'agent', 'codex']);
    const out = path.join(path.dirname(tempFile), 'scan-out');
    const result = await runCli(['scan', '--root', path.dirname(tempFile), '--out', out]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((l) => l.includes('agent=codex'))).toBe(true);
  });
});
