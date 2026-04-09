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

function toJsonLine(
  manifestPath: string,
  fromVersion: number,
  toVersion: number,
  changed: boolean,
  dryRun: boolean,
  diffOutput: string[],
): string {
  return JSON.stringify({
    command: 'upgrade',
    manifestPath,
    fromVersion,
    toVersion,
    changed,
    dryRun,
    diff: diffOutput,
  });
}

export async function runUpgradeCommand(manifestPath?: string, options: ParsedCliOptions = {}): Promise<CommandResult> {
  if (!manifestPath) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: ['Usage: agentdock upgrade <manifestPath>'],
    };
  }

  try {
    const absolutePath = path.resolve(manifestPath);
    const raw = await fs.readFile(absolutePath, 'utf8');
    const manifest = YAML.parse(raw) as AgentDockManifest;

    if (manifest.version === 2) {
      if (options.json === true) {
        return {
          exitCode: 0,
          stdout: [toJsonLine(absolutePath, 2, 2, false, options.dryRun === true, [])],
          stderr: [],
        };
      }
      return {
        exitCode: 0,
        stdout: [`Manifest already at version 2: ${absolutePath}`],
        stderr: [],
      };
    }

    if (manifest.version !== 1) {
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
          stdout: [toJsonLine(absolutePath, 1, 2, true, true, diffOutput)],
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

    await fs.writeFile(absolutePath, output, 'utf8');

    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine(absolutePath, 1, 2, true, false, diffOutput)],
        stderr: [],
      };
    }

    return {
      exitCode: 0,
      stdout: [
        `Upgraded manifest to version 2: ${absolutePath}`,
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
