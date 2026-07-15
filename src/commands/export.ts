import path from 'node:path';
import { exportManifest } from '../core/exporter';
import { exportFromScan } from '../core/scan-export';
import { loadConfig } from '../core/config';
import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import type { CommandErrorCode } from '../constants/command-error-codes';
import { loadManifest } from '../manifest/load';
import type { ParsedCliOptions } from '../manifest/types';
import { validateManifest } from '../manifest/validate';
import { toJsonError, toJsonLine } from '../utils/command-json';
import type { CommandResult } from './validate';

export async function runExportCommand(manifestPath?: string, options: ParsedCliOptions = {}): Promise<CommandResult> {
  const config = await loadConfig();
  // `scan` → package bridge: build an installable package from a v3 scan manifest.
  if (options.fromScan) {
    const out = options.out
      ? path.resolve(options.out)
      : path.resolve(path.join(path.dirname(path.resolve(options.fromScan)), 'package'));
    try {
      const exportResult = await exportFromScan({
        scanManifestPath: options.fromScan,
        out,
        env: options.env ? path.resolve(options.env) : (config.env ? path.resolve(config.env) : undefined),
        overwrite: options.overwrite,
      });

      if (options.json === true) {
        return {
          exitCode: 0,
          stdout: [toJsonLine(
            'export',
            true,
            {
              manifestPath: path.resolve(options.fromScan),
              outputPath: exportResult.outputPath,
              snapshotPath: exportResult.snapshotPath,
              installPlanPath: exportResult.installPlanPath,
            },
            [],
          )],
          stderr: [],
        };
      }

      return {
        exitCode: 0,
        stdout: [`Export (from scan) completed: ${exportResult.outputPath}`],
        stderr: [],
      };
    } catch (error) {
      return scanExportError(error, options, path.resolve(options.fromScan));
    }
  }

  const effectiveManifestPath = manifestPath ?? 'agentdock.yml';

  try {
    const loaded = await loadManifest(effectiveManifestPath);
    const result = validateManifest(loaded.data);

    if (!result.valid) {
      if (options.json === true) {
        return {
          exitCode: 1,
          stdout: [toJsonLine(
            'export',
            false,
            { manifestPath: loaded.path },
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

    const exportResult = await exportManifest(loaded.data, loaded.directory);

    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine(
          'export',
          true,
          {
            manifestPath: loaded.path,
            outputPath: exportResult.outputPath,
            snapshotPath: exportResult.snapshotPath,
            installPlanPath: exportResult.installPlanPath,
          },
          [],
        )],
        stderr: [],
      };
    }

    return {
      exitCode: 0,
      stdout: [`Export completed: ${exportResult.outputPath}`],
      stderr: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json === true) {
      let code: CommandErrorCode = COMMAND_ERROR_CODES.UNKNOWN_ERROR;
      if (message.includes('ENOENT')) {
        code = COMMAND_ERROR_CODES.MANIFEST_NOT_FOUND;
      }
      if (message.includes('Missing template variable(s)')) {
        code = COMMAND_ERROR_CODES.TEMPLATE_VARIABLE_MISSING;
      }
      if (message.includes('LOCK_TIMEOUT')) {
        code = COMMAND_ERROR_CODES.LOCK_TIMEOUT;
      }

      return {
        exitCode: 1,
        stdout: [toJsonLine(
          'export',
          false,
          { manifestPath: effectiveManifestPath },
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

function scanExportError(error: unknown, options: ParsedCliOptions, manifestPath: string): CommandResult {
  const message = error instanceof Error ? error.message : String(error);
  if (options.json === true) {
    let code: CommandErrorCode = COMMAND_ERROR_CODES.UNKNOWN_ERROR;
    if (message.includes('SCAN_EXPORT_UNSUPPORTED')) {
      code = COMMAND_ERROR_CODES.MANIFEST_INVALID;
    }
    if (message.includes('LOCK_TIMEOUT')) {
      code = COMMAND_ERROR_CODES.LOCK_TIMEOUT;
    }
    return {
      exitCode: 1,
      stdout: [toJsonLine('export', false, { manifestPath }, [toJsonError(code, message)])],
      stderr: [],
    };
  }
  return {
    exitCode: 1,
    stdout: [],
    stderr: [message],
  };
}
