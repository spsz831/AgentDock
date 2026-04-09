import path from 'node:path';
import type { InstallPlan } from './exporter';
import { copyDirectorySafe, copyFileSafe, ensureDirectory, pathExists, readJsonFile, resolveFrom } from '../utils/fs';

export interface InstallResult {
  targetPath: string;
}

export async function installPackage(packagePath: string, explicitTargetPath?: string): Promise<InstallResult> {
  const packageRoot = path.resolve(packagePath);
  const manifestSnapshotPath = path.join(packageRoot, 'manifest.resolved.json');
  const installPlanPath = path.join(packageRoot, 'meta', 'install-plan.json');

  if (!(await pathExists(manifestSnapshotPath))) {
    throw new Error(`Missing package manifest snapshot: ${manifestSnapshotPath}`);
  }

  if (!(await pathExists(installPlanPath))) {
    throw new Error(`Missing install plan: ${installPlanPath}`);
  }

  const installPlan = await readJsonFile<InstallPlan>(installPlanPath);
  const targetPath = path.resolve(explicitTargetPath ?? resolveFrom(packageRoot, installPlan.targetPath ?? './installed'));
  await ensureDirectory(targetPath);

  for (const source of installPlan.sources) {
    const fromPath = path.join(packageRoot, source.from);
    const toPath = path.join(targetPath, source.to);

    if (source.kind === 'directory') {
      await copyDirectorySafe(fromPath, toPath);
    } else {
      await copyFileSafe(fromPath, toPath);
    }
  }

  for (const template of installPlan.templates) {
    const fromPath = path.join(packageRoot, template.from);
    const toPath = path.join(targetPath, template.to);
    await copyFileSafe(fromPath, toPath);
  }

  return { targetPath };
}
