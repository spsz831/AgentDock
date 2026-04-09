import path from 'node:path';
import type { AgentDockManifest } from '../manifest/types';
import { copyDirectoryFiltered, copyDirectorySafe, copyFileSafe, ensureDirectory, resolveFrom, writeJsonFile } from '../utils/fs';

export interface InstallPlanEntry {
  id: string;
  kind: 'file' | 'directory';
  from: string;
  to: string;
}

export interface TemplatePlanEntry {
  id: string;
  from: string;
  to: string;
}

export interface InstallPlan {
  targetPath?: string;
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
  const payloadSourcesRoot = path.join(outputPath, 'payload', 'sources');
  const payloadTemplatesRoot = path.join(outputPath, 'payload', 'templates');
  const installPlan: InstallPlan = {
    targetPath: manifest.install?.targetPath,
    sources: [],
    templates: [],
  };

  await ensureDirectory(payloadSourcesRoot);
  await ensureDirectory(payloadTemplatesRoot);

  for (const source of manifest.sources) {
    const sourcePath = resolveFrom(manifestDirectory, source.path);
    const sourceRoot = path.join(payloadSourcesRoot, source.id);

    if (source.type === 'directory') {
      if ((source.include?.length ?? 0) > 0 || (source.exclude?.length ?? 0) > 0) {
        await copyDirectoryFiltered(sourcePath, sourceRoot, source.include, source.exclude);
      } else {
        await copyDirectorySafe(sourcePath, sourceRoot);
      }
      installPlan.sources.push({
        id: source.id,
        kind: 'directory',
        from: path.join('payload', 'sources', source.id),
        to: source.id,
      });
      continue;
    }

    const fileName = path.basename(source.path);
    await copyFileSafe(sourcePath, path.join(sourceRoot, fileName));
    installPlan.sources.push({
      id: source.id,
      kind: 'file',
      from: path.join('payload', 'sources', source.id, fileName),
      to: fileName,
    });
  }

  for (const template of manifest.templates ?? []) {
    const templatePath = resolveFrom(manifestDirectory, template.source);
    const fileName = path.basename(template.source);
    await copyFileSafe(templatePath, path.join(payloadTemplatesRoot, template.id, fileName));
    installPlan.templates.push({
      id: template.id,
      from: path.join('payload', 'templates', template.id, fileName),
      to: path.basename(template.destination),
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
}
