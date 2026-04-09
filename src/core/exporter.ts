import path from 'node:path';
import type { AgentDockManifest } from '../manifest/types';
import { copyDirectorySafe, copyFileSafe, ensureDirectory, resolveFrom, writeJsonFile } from '../utils/fs';

export interface ExportResult {
  outputPath: string;
  snapshotPath: string;
}

export async function exportManifest(manifest: AgentDockManifest, manifestDirectory: string): Promise<ExportResult> {
  const outputPath = resolveFrom(manifestDirectory, manifest.outputs.path);
  await ensureDirectory(outputPath);

  for (const source of manifest.sources) {
    const sourcePath = resolveFrom(manifestDirectory, source.path);
    const targetPath = path.join(outputPath, source.id);

    if (source.type === 'directory') {
      await copyDirectorySafe(sourcePath, targetPath);
      continue;
    }

    const fileName = path.basename(source.path);
    await copyFileSafe(sourcePath, path.join(outputPath, fileName));
  }

  const snapshotPath = path.join(outputPath, 'manifest.resolved.json');
  await writeJsonFile(snapshotPath, manifest);

  return { outputPath, snapshotPath };
}
