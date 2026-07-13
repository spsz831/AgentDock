import fs from 'node:fs/promises';
import path from 'node:path';
import type { InstallPlan } from './exporter';
import {
  acquireLock,
  copyDirectorySafe,
  copyFileSafe,
  ensureDirectory,
  pathExists,
  readJsonFile,
  releaseLock,
  safeResolveWithin,
} from '../utils/fs';

export interface InstallResult {
  targetPath: string;
}

interface ResolvedEntry {
  from: string;
  to: string;
  kind: 'file' | 'directory' | 'template';
}

async function isIdenticalFile(targetPath: string, sourcePath: string): Promise<boolean> {
  try {
    const [targetBuf, sourceBuf] = await Promise.all([
      fs.readFile(targetPath),
      fs.readFile(sourcePath),
    ]);
    return targetBuf.equals(sourceBuf);
  } catch {
    return false;
  }
}

async function isIdenticalDirectory(targetPath: string, sourcePath: string): Promise<boolean> {
  const [targetEntries, sourceEntries] = await Promise.all([
    fs.readdir(targetPath, { withFileTypes: true }),
    fs.readdir(sourcePath, { withFileTypes: true }),
  ]);
  if (targetEntries.length !== sourceEntries.length) {
    return false;
  }
  for (const sourceEntry of sourceEntries) {
    const targetEntry = targetEntries.find((entry) => entry.name === sourceEntry.name);
    if (!targetEntry) {
      return false;
    }
    const targetChild = path.join(targetPath, sourceEntry.name);
    const sourceChild = path.join(sourcePath, sourceEntry.name);
    if (sourceEntry.isDirectory()) {
      if (!targetEntry.isDirectory()) {
        return false;
      }
      if (!(await isIdenticalDirectory(targetChild, sourceChild))) {
        return false;
      }
    } else {
      if (targetEntry.isDirectory()) {
        return false;
      }
      if (!(await isIdenticalFile(targetChild, sourceChild))) {
        return false;
      }
    }
  }
  return true;
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

  // The target may live anywhere the user chooses (e.g. ~/.claude); only individual
  // entries must stay within it. No boundary check against packageRoot here.
  const targetRoot = path.resolve(explicitTargetPath ?? installPlan.targetPath ?? './installed');

  // Boundary-check every entry against its allowed root (blocks path traversal in
  // both the destination `to` and the source `from` fields of a malicious package).
  const entries: ResolvedEntry[] = [
    ...installPlan.sources.map((source) => ({
      from: safeResolveWithin(packageRoot, source.from, 'source.from'),
      to: safeResolveWithin(targetRoot, source.to, 'source.to'),
      kind: source.kind,
    })),
    ...installPlan.templates.map((template) => ({
      from: safeResolveWithin(packageRoot, template.from, 'template.from'),
      to: safeResolveWithin(targetRoot, template.to, 'template.to'),
      kind: 'template' as const,
    })),
  ];

  // Create the target root up front so the lock file parent exists.
  await ensureDirectory(targetRoot);

  const lockPath = path.join(targetRoot, '.agentdock.lock');
  const lockHandle = await acquireLock(lockPath);
  try {
    const conflicts: string[] = [];

    for (const entry of entries) {
      if (!(await pathExists(entry.to))) {
        continue;
      }
      if (effectiveOverwrite) {
        continue;
      }
      // Idempotent no-op: an existing entry identical to the source is not a conflict.
      if (entry.kind === 'directory') {
        if (await isIdenticalDirectory(entry.to, entry.from)) {
          continue;
        }
      } else if (await isIdenticalFile(entry.to, entry.from)) {
        continue;
      }
      conflicts.push(entry.to);
    }

    if (conflicts.length > 0) {
      throw new Error(`Install conflict detected:\n${conflicts.join('\n')}`);
    }

    for (const entry of entries) {
      if (entry.kind === 'directory') {
        await copyDirectorySafe(entry.from, entry.to);
      } else {
        await copyFileSafe(entry.from, entry.to);
      }
    }

    return { targetPath: targetRoot };
  } finally {
    await releaseLock(lockHandle, lockPath);
  }
}
