import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
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
  writeJsonFile,
  writeTextFile,
} from '../utils/fs';

/** Parse a data file by its extension (TOML or JSON). */
function parseByExt(filePath: string, content: string): unknown {
  return path.extname(filePath).toLowerCase() === '.toml' ? parseToml(content) : JSON.parse(content);
}

export interface InstallResult {
  targetPath: string;
  /** Present when `dryRun` was requested — a read-only preview of what would happen. */
  plan?: InstallPlanPreview;
}

interface ResolvedEntry {
  from: string;
  to: string;
  kind: 'file' | 'directory' | 'template';
  merge?: boolean;
  mergeKeys?: string[];
}

/** How a single planned entry would be handled by `install`. */
export type PlanAction = 'create' | 'overwrite' | 'merge' | 'skip' | 'conflict';

export interface PlanEntry {
  from: string;
  to: string;
  kind: 'file' | 'directory' | 'template';
  merge: boolean;
  /** When set, the merge is restricted to these top-level keys (other target keys preserved). */
  mergeKeys?: string[];
  /** Whether the destination already exists on the target machine. */
  exists: boolean;
  /** When `exists`, whether the destination is byte-identical to the source (idempotent no-op). */
  identical: boolean;
  action: PlanAction;
  /** Short human note, e.g. which mcpServers a merge entry would add. */
  note?: string;
}

export interface InstallPlanPreview {
  targetPath: string;
  entries: PlanEntry[];
  conflicts: PlanEntry[];
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

/**
 * Recursively merge `source` into `target`. Objects merge key-by-key
 * (source wins on name conflict); arrays / primitives are replaced by source.
 * Used so a merged `.claude.json` keeps the target's other top-level
 * keys and its existing mcpServers while the package's servers win.
 */
function deepMerge(target: unknown, source: unknown): unknown {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return source;
  }
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    return source;
  }
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [key, value] of Object.entries(source)) {
    out[key] = deepMerge((target as Record<string, unknown>)[key], value);
  }
  return out;
}

/** Deep-merge only `keys` from `source` into `target`; other target keys are left untouched. */
function mergeOnlyKeys(target: unknown, source: unknown, keys: string[]): unknown {
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const key of keys) {
    out[key] = deepMerge(out[key], (source as Record<string, unknown>)[key]);
  }
  return out;
}

/**
 * Deep-merge a package payload into a target file, preserving the target's
 * own file format (JSON or TOML). Used so a merged `.claude.json` (JSON) or
 * Codex `.codex/config.toml` (TOML) keeps the target's other keys while the
 * package's keys win. Never clobbers the target file format.
 *
 * When `mergeKeys` is given, only those top-level keys are merged (the rest
 * of the target is preserved). On a *fresh* target (file absent) the whole
 * payload is restored regardless, so a first install still carries the full
 * configuration.
 */
async function mergeDataFile(from: string, to: string, mergeKeys?: string[]): Promise<void> {
  let source: unknown = {};
  try {
    source = parseByExt(from, await fs.readFile(from, 'utf8'));
  } catch {
    source = {};
  }
  // Fresh target: restore the entire payload (in the target's format).
  if (!(await pathExists(to))) {
    if (path.extname(to).toLowerCase() === '.toml') {
      await writeTextFile(to, stringifyToml(source as Record<string, unknown>));
    } else {
      await writeJsonFile(to, source);
    }
    return;
  }
  let target: unknown = {};
  try {
    target = parseByExt(to, await fs.readFile(to, 'utf8'));
  } catch {
    target = {};
  }
  const merged = mergeKeys && mergeKeys.length > 0
    ? mergeOnlyKeys(target, source, mergeKeys)
    : deepMerge(target, source);
  if (path.extname(to).toLowerCase() === '.toml') {
    await writeTextFile(to, stringifyToml(merged as Record<string, unknown>));
  } else {
    await writeJsonFile(to, merged);
  }
}

/**
 * Produce a read-only preview of what `install` would do for a package
 * against a target path — without writing anything. Boundary checks
 * (`safeResolveWithin`) still run so path-traversal issues surface here.
 * Shared by `install --dry-run` and the `diff` command.
 */
export async function planInstall(
  packagePath: string,
  explicitTargetPath?: string,
  overwrite = false,
): Promise<InstallPlanPreview> {
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
  const targetRoot = path.resolve(explicitTargetPath ?? installPlan.targetPath ?? './installed');

  const rawEntries: ResolvedEntry[] = [
    ...installPlan.sources.map((source) => ({
      from: safeResolveWithin(packageRoot, source.from, 'source.from'),
      to: safeResolveWithin(targetRoot, source.to, 'source.to'),
      kind: source.kind,
      merge: source.merge ?? false,
      mergeKeys: source.mergeKeys,
    })),
    ...installPlan.templates.map((template) => ({
      from: safeResolveWithin(packageRoot, template.from, 'template.from'),
      to: safeResolveWithin(targetRoot, template.to, 'template.to'),
      kind: 'template' as const,
      merge: false,
    })),
  ];

  const entries: PlanEntry[] = [];
  for (const entry of rawEntries) {
    const exists = await pathExists(entry.to);
    let identical = false;
    if (exists) {
      identical = entry.kind === 'directory'
        ? await isIdenticalDirectory(entry.to, entry.from)
        : await isIdenticalFile(entry.to, entry.from);
    }

    let action: PlanAction;
    let note: string | undefined;
    if (entry.merge) {
      action = 'merge';
      note = exists ? await describeMerge(entry.from, entry.to, entry.mergeKeys) : 'merge: target missing (will create)';
    } else if (!exists) {
      action = 'create';
    } else if (identical) {
      action = 'skip';
    } else if (effectiveOverwrite) {
      action = 'overwrite';
    } else {
      action = 'conflict';
    }

    entries.push({ ...entry, merge: entry.merge ?? false, mergeKeys: entry.mergeKeys, exists, identical, action, note });
  }

  const conflicts = entries.filter((entry) => entry.action === 'conflict');
  return { targetPath: targetRoot, entries, conflicts };
}

/** Human-readable summary of what a merge entry would add to the target file. */
async function describeMerge(sourcePath: string, targetPath: string, mergeKeys?: string[]): Promise<string> {
  try {
    const source = parseByExt(sourcePath, await fs.readFile(sourcePath, 'utf8')) as Record<string, unknown>;
    const targetExists = await pathExists(targetPath);
    const target = targetExists
      ? (parseByExt(targetPath, await fs.readFile(targetPath, 'utf8')) as Record<string, unknown>)
      : {};

    // TOML config.toml uses `mcp_servers`; JSON .claude.json uses `mcpServers`.
    const mcpKey = path.extname(sourcePath).toLowerCase() === '.toml' ? 'mcp_servers' : 'mcpServers';
    const focusKey = mergeKeys && mergeKeys.length > 0
      ? (mergeKeys.find((k) => k === mcpKey) ?? mergeKeys[0])
      : mcpKey;
    const sourceServers = source[focusKey] as Record<string, unknown> | undefined;
    const targetServers = target[focusKey] as Record<string, unknown> | undefined;
    if (sourceServers && targetServers && typeof sourceServers === 'object') {
      const added = Object.keys(sourceServers).filter((key) => !(key in targetServers));
      if (added.length > 0) {
        return `merge: adds ${focusKey} [${added.join(', ')}]`;
      }
    }

    if (mergeKeys && mergeKeys.length > 0) {
      const addedKeys = mergeKeys.filter((key) => !(key in target));
      if (addedKeys.length > 0) {
        return `merge: adds keys [${addedKeys.join(', ')}]`;
      }
      return `merge: no new keys in [${mergeKeys.join(', ')}]`;
    }

    const addedKeys = Object.keys(source).filter((key) => !(key in target));
    if (addedKeys.length > 0) {
      return `merge: adds keys [${addedKeys.join(', ')}]`;
    }
    return 'merge: no new top-level keys';
  } catch {
    return 'merge: deep-merge into existing';
  }
}

export async function installPackage(
  packagePath: string,
  explicitTargetPath?: string,
  overwrite = false,
  dryRun = false,
): Promise<InstallResult> {
  const plan = await planInstall(packagePath, explicitTargetPath, overwrite);

  // Dry-run: validate + preview only, never touch the target.
  if (dryRun) {
    return { targetPath: plan.targetPath, plan };
  }

  // Create the target root up front so the lock file parent exists.
  await ensureDirectory(plan.targetPath);

  const lockPath = path.join(plan.targetPath, '.agentdock.lock');
  const lockHandle = await acquireLock(lockPath);
  try {
    if (plan.conflicts.length > 0) {
      throw new Error(`Install conflict detected:\n${plan.conflicts.map((entry) => entry.to).join('\n')}`);
    }

    for (const entry of plan.entries) {
      // Idempotent no-op: an existing entry identical to the source is skipped.
      if (entry.action === 'skip') {
        continue;
      }
      if (entry.action === 'merge') {
        // Deep-merge the payload into the existing target (preserving other
        // top-level keys / other mcpServers or mcp_servers). Never clobbers it.
        await mergeDataFile(entry.from, entry.to, entry.mergeKeys);
        continue;
      }
      if (entry.kind === 'directory') {
        await copyDirectorySafe(entry.from, entry.to);
      } else {
        await copyFileSafe(entry.from, entry.to);
      }
    }

    return { targetPath: plan.targetPath, plan };
  } finally {
    await releaseLock(lockHandle, lockPath);
  }
}
