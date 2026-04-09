import { installPackage } from '../core/installer';
import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import type { CommandErrorCode } from '../constants/command-error-codes';
import type { CommandResult, ParsedCliOptions } from '../manifest/types';
import { toJsonError, toJsonLine } from '../utils/command-json';

export async function runInstallCommand(packagePath?: string, targetPath?: string, options: ParsedCliOptions = {}): Promise<CommandResult> {
  if (!packagePath) {
    if (options.json === true) {
      return {
        exitCode: 1,
        stdout: [toJsonLine(
          'install',
          false,
          { packagePath, targetPath: targetPath ?? null, overwrite: options.overwrite === true },
          [toJsonError(COMMAND_ERROR_CODES.UNKNOWN_ERROR, 'Usage: agentdock install <packagePath> [targetPath] [--overwrite]')],
        )],
        stderr: [],
      };
    }

    return {
      exitCode: 1,
      stdout: [],
      stderr: ['Usage: agentdock install <packagePath> [targetPath] [--overwrite]'],
    };
  }

  try {
    const result = await installPackage(packagePath, targetPath, options.overwrite === true);
    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine(
          'install',
          true,
          {
            packagePath,
            targetPath: result.targetPath,
            overwrite: options.overwrite === true,
          },
          [],
        )],
        stderr: [],
      };
    }

    return {
      exitCode: 0,
      stdout: [`Install completed: ${result.targetPath}`],
      stderr: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json === true) {
      let code: CommandErrorCode = COMMAND_ERROR_CODES.UNKNOWN_ERROR;
      if (message.includes('Missing package manifest snapshot')) {
        code = COMMAND_ERROR_CODES.MISSING_PACKAGE_MANIFEST;
      } else if (message.includes('Missing install plan')) {
        code = COMMAND_ERROR_CODES.MISSING_INSTALL_PLAN;
      } else if (message.includes('Install conflict detected')) {
        code = COMMAND_ERROR_CODES.INSTALL_CONFLICT;
      }

      return {
        exitCode: 1,
        stdout: [toJsonLine(
          'install',
          false,
          {
            packagePath,
            targetPath: targetPath ?? null,
            overwrite: options.overwrite === true,
          },
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
