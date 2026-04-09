import fs from 'node:fs/promises';
import path from 'node:path';
import { diffLines } from 'diff';
import YAML from 'yaml';
import { resolveSourceDestination } from '../core/source-destination';
import type { AgentDockManifest, CommandResult, ParsedCliOptions } from '../manifest/types';

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

function toJsonLine(
  manifestPath: string,
  fromVersion: number,
  toVersion: number,
  changed: boolean,
  dryRun: boolean,
  diffOutput: string[],
  sourceCount: number,
  templateCount: number,
  outputPath?: string,
): string {
  const changedLineCount = diffOutput.filter((line) => line.startsWith('+') || line.startsWith('-')).length;
  return JSON.stringify({
    command: 'upgrade',
    manifestPath,
    outputPath,
    fromVersion,
    toVersion,
    changed,
    dryRun,
    diff: diffOutput,
    summary: {
      addedDestinationCount: countAddedDestinations(diffOutput),
      changedLineCount,
      sourceCount,
      templateCount,
    },
  });
}

export async function runUpgradeCommand(manifestPath?: string, options: ParsedCliOptions = {}): Promise<CommandResult> {
  if (!manifestPath) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: ['Usage: agentdock upgrade <manifestPath> [--dry-run] [--json] [--write <path>] [--backup] [--force]'],
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
        return {
          exitCode: 0,
          stdout: [toJsonLine(
            absolutePath,
            2,
            2,
            false,
            options.dryRun === true,
            [],
            manifest.sources.length,
            manifest.templates?.length ?? 0,
            requestedOutputPath,
          )],
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
        return {
          exitCode: 0,
          stdout: [toJsonLine(
            absolutePath,
            fromVersion,
            2,
            diffOutput.length > 0,
            true,
            diffOutput,
            upgraded.sources.length,
            upgraded.templates?.length ?? 0,
            requestedOutputPath,
          )],
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
      return {
        exitCode: 0,
        stdout: [toJsonLine(
          absolutePath,
          fromVersion,
          2,
          diffOutput.length > 0,
          false,
          diffOutput,
          upgraded.sources.length,
          upgraded.templates?.length ?? 0,
          outputPath,
        )],
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
    return {
      exitCode: 1,
      stdout: [],
      stderr: [error instanceof Error ? error.message : String(error)],
    };
  }
}
