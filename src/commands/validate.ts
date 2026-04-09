import { loadManifest } from '../manifest/load';
import type { ParsedCliOptions } from '../manifest/types';
import { validateManifest } from '../manifest/validate';
import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import { toJsonError, toJsonLine } from '../utils/command-json';

export interface CommandResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

export async function runValidateCommand(manifestPath?: string, options: ParsedCliOptions = {}): Promise<CommandResult> {
  const effectiveManifestPath = manifestPath ?? 'agentdock.yml';

  try {
    const loaded = await loadManifest(effectiveManifestPath);
    const result = validateManifest(loaded.data);

    if (!result.valid) {
      if (options.json === true) {
        return {
          exitCode: 1,
          stdout: [toJsonLine(
            'validate',
            false,
            { manifestPath: loaded.path, valid: false },
            result.errors.map((message) => toJsonError(COMMAND_ERROR_CODES.MANIFEST_INVALID, message)),
          )],
          stderr: [],
        };
      }

      return {
        exitCode: 1,
        stdout: [],
        stderr: result.errors,
      };
    }

    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine(
          'validate',
          true,
          { manifestPath: loaded.path, valid: true },
          [],
        )],
        stderr: [],
      };
    }

    return {
      exitCode: 0,
      stdout: [`Manifest is valid: ${loaded.path}`],
      stderr: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json === true) {
      const code = message.includes('ENOENT')
        ? COMMAND_ERROR_CODES.MANIFEST_NOT_FOUND
        : COMMAND_ERROR_CODES.UNKNOWN_ERROR;
      return {
        exitCode: 1,
        stdout: [toJsonLine(
          'validate',
          false,
          { manifestPath: effectiveManifestPath, valid: false },
          [toJsonError(code, message)],
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
