import { loadManifest } from '../manifest/load';
import { validateManifest } from '../manifest/validate';

export interface CommandResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

export async function runValidateCommand(manifestPath?: string): Promise<CommandResult> {
  try {
    const loaded = await loadManifest(manifestPath ?? 'agentdock.yml');
    const result = validateManifest(loaded.data);

    if (!result.valid) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: result.errors,
      };
    }

    return {
      exitCode: 0,
      stdout: [`Manifest is valid: ${loaded.path}`],
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
