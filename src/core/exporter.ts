import path from 'node:path';
import type { AgentDockManifest } from '../manifest/types';
import { renderTemplateFile } from './template-renderer';
import { resolveSourceDestination } from './source-destination';
import { acquireLock, copyDirectoryFiltered, copyDirectorySafe, copyFileSafe, ensureDirectory, releaseLock, resolveFrom, writeJsonFile, writeTextFile } from '../utils/fs';

export interface InstallPlanEntry {
  id: string;
  kind: 'file' | 'directory';
  from: string;
  to: string;
  /**
   * When true, the entry is a JSON file that should be *deep-merged*
   * into the existing target (preserving other top-level keys and other
   * entries) instead of overwritten. Used for `.claude.json` so installing
   * onto a machine that already has config never clobbers it.
   */
  merge?: boolean;
}

export interface TemplatePlanEntry {
  id: string;
  from: string;
  to: string;
}

export interface InstallPlan {
  targetPath?: string;
  overwrite?: boolean;
  sources: InstallPlanEntry[];
  templates: TemplatePlanEntry[];
}

export interface ExportResult {
  outputPath: string;
  snapshotPath: string;
  installPlanPath: string;
}

export async function exportManifest(manifest: AgentDockManifest, manifestDirectory: string): Promise<ExportResult> {
  const outputPath = resolveFrom(manifestDirectory, manifest.outputs.path);
  await ensureDirectory(outputPath);
  const lockFile = path.join(outputPath, '.agentdock-export.lock');
  const lockHandle = await acquireLock(lockFile);
  try {
    const followSymlinks = manifest.options?.followSymlinks !== false;
    const payloadSourcesRoot = path.join(outputPath, 'payload', 'sources');
    const payloadTemplatesRoot = path.join(outputPath, 'payload', 'templates');
  const installPlan: InstallPlan = {
    targetPath: manifest.install?.targetPath,
    overwrite: manifest.install?.overwrite ?? false,
    sources: [],
    templates: [],
  };

  await ensureDirectory(payloadSourcesRoot);
  await ensureDirectory(payloadTemplatesRoot);

  for (const source of manifest.sources) {
    const sourcePath = resolveFrom(manifestDirectory, source.path);
    const sourceRoot = path.join(payloadSourcesRoot, source.id);
    const destination = resolveSourceDestination(source);

    if (source.type === 'directory') {
      if ((source.include?.length ?? 0) > 0 || (source.exclude?.length ?? 0) > 0) {
        await copyDirectoryFiltered(sourcePath, sourceRoot, source.include, source.exclude, followSymlinks);
      } else {
        await copyDirectorySafe(sourcePath, sourceRoot, followSymlinks);
      }
      installPlan.sources.push({
        id: source.id,
        kind: 'directory',
        from: path.join('payload', 'sources', source.id),
        to: destination,
      });
      continue;
    }

    const fileName = path.basename(source.path);
    await copyFileSafe(sourcePath, path.join(sourceRoot, fileName));
    installPlan.sources.push({
      id: source.id,
      kind: 'file',
      from: path.join('payload', 'sources', source.id, fileName),
      to: destination,
    });
  }

  for (const template of manifest.templates ?? []) {
    const rendered = await renderTemplateFile(template, manifestDirectory);
    await writeTextFile(path.join(payloadTemplatesRoot, template.id, rendered.fileName), rendered.content);
    installPlan.templates.push({
      id: template.id,
      from: path.join('payload', 'templates', template.id, rendered.fileName),
      to: template.destination,
    });
  }

  const snapshotPath = path.join(outputPath, 'manifest.resolved.json');
  const installPlanPath = path.join(outputPath, 'meta', 'install-plan.json');
  const packageMetadataPath = path.join(outputPath, 'package.json');

  await writeJsonFile(snapshotPath, manifest);
  await writeJsonFile(installPlanPath, installPlan);
  await writeJsonFile(packageMetadataPath, {
    name: 'agentdock-package',
    version: '1.0.0',
    project: manifest.project.name,
    manifestVersion: manifest.version,
  });

    return { outputPath, snapshotPath, installPlanPath };
  } finally {
    await releaseLock(lockHandle, lockFile);
  }
}
