import { exportManifest } from '../core/exporter';
import { loadManifest } from '../manifest/load';
import { validateManifest } from '../manifest/validate';
import type { CommandResult } from './validate';

export async function runExportCommand(manifestPath?: string): Promise<CommandResult> {
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

    const exportResult = await exportManifest(loaded.data, loaded.directory);

    return {
      exitCode: 0,
      stdout: [`Export completed: ${exportResult.outputPath}`],
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
