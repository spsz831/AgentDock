import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { AgentDockManifest, LoadedManifest } from './types';

export async function loadManifest(manifestPath: string): Promise<LoadedManifest> {
  const absolutePath = path.resolve(manifestPath);
  const fileContent = await fs.readFile(absolutePath, 'utf8');
  const data = YAML.parse(fileContent) as AgentDockManifest;

  return {
    path: absolutePath,
    directory: path.dirname(absolutePath),
    data,
  };
}
