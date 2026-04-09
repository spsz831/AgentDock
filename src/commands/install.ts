import { installPackage } from '../core/installer';
import type { CommandResult, ParsedCliOptions } from '../manifest/types';

export async function runInstallCommand(packagePath?: string, targetPath?: string, options: ParsedCliOptions = {}): Promise<CommandResult> {
  if (!packagePath) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: ['Usage: agentdock install <packagePath> [targetPath] [--overwrite]'],
    };
  }

  try {
    const result = await installPackage(packagePath, targetPath, options.overwrite === true);
    return {
      exitCode: 0,
      stdout: [`Install completed: ${result.targetPath}`],
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
