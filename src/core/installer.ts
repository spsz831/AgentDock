import path from 'node:path';
import type { InstallPlan } from './exporter';
import { copyDirectorySafe, copyFileSafe, ensureDirectory, pathExists, readJsonFile, resolveFrom } from '../utils/fs';

export interface InstallResult {
  targetPath: string;
}

function collectPlannedTargets(targetPath: string, installPlan: InstallPlan): string[] {
  const targets: string[] = [];

  for (const source of installPlan.sources) {
    targets.push(path.join(targetPath, source.to));
  }

  for (const template of installPlan.templates) {
    targets.push(path.join(targetPath, template.to));
  }

  return targets;
}

export async function installPackage(packagePath: string, explicitTargetPath?: string, overwrite = false): Promise<InstallResult> {
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
  const effectiveOverwrite = overwrite || installPlan.overwrite === true;
  const targetPath = path.resolve(explicitTargetPath ?? resolveFrom(packageRoot, installPlan.targetPath ?? './installed'));
  const plannedTargets = collectPlannedTargets(targetPath, installPlan);
  const conflicts: string[] = [];

  for (const plannedTarget of plannedTargets) {
    if (await pathExists(plannedTarget)) {
      conflicts.push(plannedTarget);
    }
  }

  if (!effectiveOverwrite && conflicts.length > 0) {
    throw new Error(`Install conflict detected:\n${conflicts.join('\n')}`);
  }

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
