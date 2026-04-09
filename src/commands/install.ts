import { installPackage } from '../core/installer';
import type { CommandResult } from './validate';

export async function runInstallCommand(packagePath?: string, targetPath?: string): Promise<CommandResult> {
  if (!packagePath) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: ['Usage: agentdock install <packagePath> [targetPath]'],
    };
  }

  try {
    const result = await installPackage(packagePath, targetPath);
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
