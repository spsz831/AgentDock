import fs from 'node:fs/promises';
import path from 'node:path';
import type { CommandResult } from './validate';

export async function runInitCommand(targetDirectory?: string): Promise<CommandResult> {
  const projectRoot = path.resolve(targetDirectory ?? process.cwd());
  const manifestPath = path.join(projectRoot, 'agentdock.yml');
  const examplePath = path.resolve(__dirname, '../../examples/agentdock.example.yml');

  try {
    await fs.access(manifestPath);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Manifest already exists: ${manifestPath}`],
    };
  } catch {
    // continue
  }

  try {
    const template = await fs.readFile(examplePath, 'utf8');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(manifestPath, template, 'utf8');

    return {
      exitCode: 0,
      stdout: [`Created manifest: ${manifestPath}`],
      stderr: [],
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [error instanceof Error ? error.message : String(error)],
    };
  }
}
