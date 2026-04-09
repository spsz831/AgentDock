import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { runCli } from '../src/cli';

const manifestPath = path.resolve(__dirname, '../agentdock.yml');

describe('cli validate command', () => {
  it('returns success for a valid manifest', async () => {
    const result = await runCli(['validate', manifestPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some((line) => line.includes('Manifest is valid'))).toBe(true);
  });
});
