import { planInstall } from '../core/installer';
import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import type { CommandErrorCode } from '../constants/command-error-codes';
import type { CommandResult, ParsedCliOptions } from '../manifest/types';
import { toJsonError, toJsonLine } from '../utils/command-json';
import { renderPlan } from '../utils/plan-render';

export async function runDiffCommand(
  packagePath?: string,
  targetPath?: string,
  options: ParsedCliOptions = {},
): Promise<CommandResult> {
  if (!packagePath) {
    if (options.json === true) {
      return {
        exitCode: 1,
        stdout: [toJsonLine(
          'diff',
          false,
          { packagePath: null, targetPath: targetPath ?? null, overwrite: options.overwrite === true },
          [toJsonError(COMMAND_ERROR_CODES.UNKNOWN_ERROR, 'Usage: agentdock diff <packagePath> [targetPath] [--overwrite]')],
        )],
        stderr: [],
      };
    }
    return {
      exitCode: 1,
      stdout: [],
      stderr: ['Usage: agentdock diff <packagePath> [targetPath] [--overwrite]'],
    };
  }

  try {
    const plan = await planInstall(packagePath, targetPath, options.overwrite === true);

    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine(
          'diff',
          true,
          {
            packagePath,
            targetPath: plan.targetPath,
            overwrite: options.overwrite === true,
            entries: plan.entries,
            conflicts: plan.conflicts.length,
          },
          [],
        )],
        stderr: [],
      };
    }

    return {
      exitCode: 0,
      stdout: renderPlan(plan, 'diff'),
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
      }

      return {
        exitCode: 1,
        stdout: [toJsonLine(
          'diff',
          false,
          { packagePath, targetPath: targetPath ?? null, overwrite: options.overwrite === true },
          [toJsonError(code, message)],
        )],
        stderr: [],
      };
    }
    return { exitCode: 1, stdout: [], stderr: [message] };
  }
}
