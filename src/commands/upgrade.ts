import fs from 'node:fs/promises';
import path from 'node:path';
import { diffLines } from 'diff';
import YAML from 'yaml';
import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import {
  UPGRADE_WARNING_CODES,
  UPGRADE_WARNING_MESSAGES,
} from '../constants/upgrade-warning-codes';
import { resolveSourceDestination } from '../core/source-destination';
import type { AgentDockManifest, CommandResult, ParsedCliOptions } from '../manifest/types';
import type { UpgradeCommandData, UpgradeWarning } from '../types/upgrade-report';
import { toJsonError, toJsonLine } from '../utils/command-json';

function renderDiff(beforeText: string, afterText: string): string[] {
  const lines: string[] = [];
  for (const part of diffLines(beforeText, afterText)) {
    const prefix = part.added ? '+' : part.removed ? '-' : ' ';
    for (const line of part.value.split('\n')) {
      if (line.length === 0) {
        continue;
      }
      lines.push(`${prefix}${line}`);
    }
  }
  return lines;
}

function countAddedDestinations(diffOutput: string[]): number {
  return diffOutput.filter((line) => line.startsWith('+') && line.includes('destination: ')).length;
}

function buildWarnings(changed: boolean, addedDestinationCount: number): UpgradeWarning[] {
  if (!changed) {
    return [];
  }
  if (addedDestinationCount === 0) {
    return [
      {
        code: UPGRADE_WARNING_CODES.FORMAT_ONLY_CHANGE,
        message: UPGRADE_WARNING_MESSAGES[UPGRADE_WARNING_CODES.FORMAT_ONLY_CHANGE],
      },
    ];
  }
  return [];
}

function toUpgradeData(
  manifestPath: string,
  fromVersion: number,
  toVersion: number,
  changed: boolean,
  dryRun: boolean,
  diffOutput: string[],
  sourceCount: number,
  templateCount: number,
  outputPath?: string): UpgradeCommandData {
  const changedLineCount = diffOutput.filter((line) => line.startsWith('+') || line.startsWith('-')).length;
  const addedDestinationCount = countAddedDestinations(diffOutput);
  const warnings = buildWarnings(changed, addedDestinationCount);

  return {
    manifestPath,
    outputPath,
    fromVersion,
    toVersion,
    changed,
    dryRun,
    diff: diffOutput,
    summary: {
      addedDestinationCount,
      changedLineCount,
      sourceCount,
      templateCount,
      warningCount: warnings.length,
      warnings,
    },
  };
}

export async function runUpgradeCommand(manifestPath?: string, options: ParsedCliOptions = {}): Promise<CommandResult> {
  const usage = 'Usage: agentdock upgrade <manifestPath> [--dry-run] [--json] [--write <path>] [--backup] [--force]';

  if (!manifestPath) {
    if (options.json === true) {
      return {
        exitCode: 1,
        stdout: [toJsonLine(
          'upgrade',
          false,
          {
            manifestPath: '',
            fromVersion: 0,
            toVersion: 0,
            changed: false,
            dryRun: options.dryRun === true,
            diff: [],
            summary: {
              addedDestinationCount: 0,
              changedLineCount: 0,
              sourceCount: 0,
              templateCount: 0,
              warningCount: 0,
              warnings: [],
            },
          } satisfies UpgradeCommandData,
          [toJsonError(COMMAND_ERROR_CODES.MISSING_ARGUMENT, usage)],
        )],
        stderr: [],
      };
    }

    return {
      exitCode: 1,
      stdout: [],
      stderr: [usage],
    };
  }

  try {
    const absolutePath = path.resolve(manifestPath);
    const requestedOutputPath = options.writePath ? path.resolve(options.writePath) : undefined;
    const raw = await fs.readFile(absolutePath, 'utf8');
    const manifest = YAML.parse(raw) as AgentDockManifest;
    const fromVersion = manifest.version;

    if (manifest.version === 2 && options.force !== true) {
      if (options.json === true) {
        const data = toUpgradeData(
          absolutePath,
          2,
          2,
          false,
          options.dryRun === true,
          [],
          manifest.sources.length,
          manifest.templates?.length ?? 0,
          requestedOutputPath,
        );

        return {
          exitCode: 0,
          stdout: [toJsonLine('upgrade', true, data, [])],
          stderr: [],
        };
      }
      return {
        exitCode: 0,
        stdout: [`Manifest already at version 2: ${absolutePath}`],
        stderr: [],
      };
    }

    if (manifest.version !== 1 && manifest.version !== 2) {
      if (options.json === true) {
        const data = toUpgradeData(
          absolutePath,
          fromVersion,
          2,
          false,
          options.dryRun === true,
          [],
          manifest.sources?.length ?? 0,
          manifest.templates?.length ?? 0,
          requestedOutputPath,
        );

        return {
          exitCode: 1,
          stdout: [toJsonLine(
            'upgrade',
            false,
            data,
            [toJsonError(COMMAND_ERROR_CODES.UNSUPPORTED_MANIFEST_VERSION, `Unsupported manifest version: ${manifest.version}`)],
          )],
          stderr: [],
        };
      }

      return {
        exitCode: 1,
        stdout: [],
        stderr: [`Unsupported manifest version: ${manifest.version}`],
      };
    }

    const upgraded: AgentDockManifest = {
      ...manifest,
      version: 2,
      sources: manifest.sources.map((source) => ({
        ...source,
        destination: resolveSourceDestination(source),
      })),
    };

    const output = YAML.stringify(upgraded);
    const diffOutput = renderDiff(raw, output);

    if (options.dryRun === true) {
      if (options.json === true) {
        const data = toUpgradeData(
          absolutePath,
          fromVersion,
          2,
          diffOutput.length > 0,
          true,
          diffOutput,
          upgraded.sources.length,
          upgraded.templates?.length ?? 0,
          requestedOutputPath,
        );

        return {
          exitCode: 0,
          stdout: [toJsonLine('upgrade', true, data, [])],
          stderr: [],
        };
      }
      return {
        exitCode: 0,
        stdout: [
          `Dry run: manifest upgrade preview for ${absolutePath}`,
          ...diffOutput,
        ],
        stderr: [],
      };
    }

    const outputPath = requestedOutputPath ?? absolutePath;
    if (options.backup === true && outputPath === absolutePath) {
      const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
      const backupPath = `${absolutePath}.bak.${timestamp}`;
      await fs.copyFile(absolutePath, backupPath);
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output, 'utf8');

    if (options.json === true) {
      const data = toUpgradeData(
        absolutePath,
        fromVersion,
        2,
        diffOutput.length > 0,
        false,
        diffOutput,
        upgraded.sources.length,
        upgraded.templates?.length ?? 0,
        outputPath,
      );

      return {
        exitCode: 0,
        stdout: [toJsonLine('upgrade', true, data, [])],
        stderr: [],
      };
    }

    return {
      exitCode: 0,
      stdout: [
        `Upgraded manifest to version 2: ${outputPath}`,
        ...diffOutput,
      ],
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
          'upgrade',
          false,
          {
            manifestPath: path.resolve(manifestPath),
            fromVersion: 0,
            toVersion: 2,
            changed: false,
            dryRun: options.dryRun === true,
            diff: [],
            summary: {
              addedDestinationCount: 0,
              changedLineCount: 0,
              sourceCount: 0,
              templateCount: 0,
              warningCount: 0,
              warnings: [],
            },
          } satisfies UpgradeCommandData,
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
