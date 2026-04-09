import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { resolveSourceDestination } from '../core/source-destination';
import type { AgentDockManifest, CommandResult } from '../manifest/types';

export async function runUpgradeCommand(manifestPath?: string): Promise<CommandResult> {
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
    await fs.writeFile(absolutePath, output, 'utf8');

    return {
      exitCode: 0,
      stdout: [`Upgraded manifest to version 2: ${absolutePath}`],
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
