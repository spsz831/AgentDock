import { uninstallPackage, type UninstallEntry, type UninstallAction } from '../core/uninstall';
import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import type { CommandErrorCode } from '../constants/command-error-codes';
import type { CommandResult, ParsedCliOptions } from '../manifest/types';
import { toJsonError, toJsonLine } from '../utils/command-json';
import { t } from '../i18n';

const ACTION_LABEL: Record<UninstallAction, string> = {
  'remove-file': 'REMOVE       ',
  'remove-dir': 'REMOVE       ',
  unmerge: 'UNMERGE      ',
  'skip-missing': 'SKIP(missing)',
  'skip-modified': 'SKIP(modified)',
};

function renderUninstall(targetPath: string, removed: UninstallEntry[], skipped: UninstallEntry[], dryRun: boolean): string[] {
  const lines: string[] = [
    dryRun ? t('uninstall.dryRunHeader', { path: targetPath }) : t('uninstall.complete', { path: targetPath }),
  ];
  for (const entry of [...removed, ...skipped]) {
    const label = ACTION_LABEL[entry.action];
    const note = entry.note ? `  (${entry.note})` : '';
    lines.push(`  ${label} ${entry.to}${note}`);
  }
  lines.push(`  ${removed.length} removed, ${skipped.length} skipped`);
  return lines;
}

export async function runUninstallCommand(
  packagePath?: string,
  targetPath?: string,
  options: ParsedCliOptions = {},
): Promise<CommandResult> {
  if (!packagePath) {
    if (options.json === true) {
      return {
        exitCode: 1,
        stdout: [toJsonLine(
          'uninstall',
          false,
          { packagePath: null, targetPath: targetPath ?? null, dryRun: options.dryRun === true, force: options.force === true },
          [toJsonError(COMMAND_ERROR_CODES.UNKNOWN_ERROR, 'Usage: agentdock uninstall <packagePath> [targetPath] [--force] [--dry-run]')],
        )],
        stderr: [],
      };
    }
    return {
      exitCode: 1,
      stdout: [],
      stderr: ['Usage: agentdock uninstall <packagePath> [targetPath] [--force] [--dry-run]'],
    };
  }

  try {
    const result = await uninstallPackage(
      packagePath,
      targetPath,
      options.dryRun === true,
      options.force === true,
    );

    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine(
          'uninstall',
          true,
          {
            packagePath,
            targetPath: result.targetPath,
            removed: result.removed,
            skipped: result.skipped,
            dryRun: result.dryRun,
          },
          [],
        )],
        stderr: [],
      };
    }

    return {
      exitCode: 0,
      stdout: renderUninstall(result.targetPath, result.removed, result.skipped, result.dryRun),
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
          'uninstall',
          false,
          { packagePath, targetPath: targetPath ?? null, dryRun: options.dryRun === true, force: options.force === true },
          [toJsonError(code, message)],
        )],
        stderr: [],
      };
    }
    return { exitCode: 1, stdout: [], stderr: [message] };
  }
}
