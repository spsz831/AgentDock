import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli';
import { COMMAND_ERROR_CODES } from '../src/constants/command-error-codes';
import type { CommandJsonReport } from '../src/types/command-report';

const VALID_MANIFEST = `version: 2
project:
  name: agentdock-demo
sources:
  - id: settings
    type: file
    path: ./settings.json
    destination: ./restored/settings.json
outputs:
  type: directory
  path: ./dist/exported
`;

let manifestPath: string;

beforeAll(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-validate-'));
  manifestPath = path.join(dir, 'agentdock.yml');
  await fs.writeFile(manifestPath, VALID_MANIFEST, 'utf8');
});

describe('cli validate command', () => {
  it('returns success for a valid manifest', async () => {
    const result = await runCli(['validate', manifestPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((line) => line.includes('Manifest is valid'))).toBe(true);
  });

  it('returns versioned json output for success', async () => {
    const result = await runCli(['validate', manifestPath, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    expect(result.stdout.length).toBe(1);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as CommandJsonReport<{ manifestPath: string; valid: boolean }>;
    expect(payload.schemaVersion).toBe(1);
    expect(Number.isNaN(Date.parse(payload.generatedAt))).toBe(false);
    expect(payload.command).toBe('validate');
    expect(payload.success).toBe(true);
    expect(payload.data.valid).toBe(true);
    expect(payload.errors).toEqual([]);
  });

  it('returns stable error code when manifest path is missing in json mode', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-validate-json-'));
    const missingPath = path.join(tempRoot, 'missing.yml');

    const result = await runCli(['validate', missingPath, '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual([]);
    const payload = JSON.parse(result.stdout[0] ?? '{}') as CommandJsonReport<{ manifestPath: string; valid: boolean }>;
    expect(payload.success).toBe(false);
    expect(payload.errors[0]?.code).toBe(COMMAND_ERROR_CODES.MANIFEST_NOT_FOUND);
  });
});
