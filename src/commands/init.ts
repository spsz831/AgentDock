import fs from 'node:fs/promises';
import path from 'node:path';
import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import type { ParsedCliOptions } from '../manifest/types';
import { toJsonError, toJsonLine } from '../utils/command-json';
import type { CommandResult } from './validate';

export async function runInitCommand(targetDirectory?: string, options: ParsedCliOptions = {}): Promise<CommandResult> {
  const projectRoot = path.resolve(targetDirectory ?? process.cwd());
  const manifestPath = path.join(projectRoot, 'agentdock.yml');
  const examplePath = path.resolve(__dirname, '../../examples/agentdock.example.yml');

  try {
    await fs.access(manifestPath);
    if (options.json === true) {
      return {
        exitCode: 1,
        stdout: [toJsonLine(
          'init',
          false,
          { targetDirectory: projectRoot, manifestPath },
          [toJsonError(COMMAND_ERROR_CODES.MANIFEST_ALREADY_EXISTS, `Manifest already exists: ${manifestPath}`)],
        )],
        stderr: [],
      };
    }

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

    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine(
          'init',
          true,
          { targetDirectory: projectRoot, manifestPath },
          [],
        )],
        stderr: [],
      };
    }

    return {
      exitCode: 0,
      stdout: [`Created manifest: ${manifestPath}`],
      stderr: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json === true) {
      return {
        exitCode: 1,
        stdout: [toJsonLine(
          'init',
          false,
          { targetDirectory: projectRoot, manifestPath },
          [toJsonError(COMMAND_ERROR_CODES.UNKNOWN_ERROR, message)],
        )],
        stderr: [],
      };
    }

    return {
      exitCode: 1,
      stdout: [],
      stderr: [message],
    };
  }
}
