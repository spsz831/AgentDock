import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { planInstall, type PlanEntry } from './installer';
import {
  acquireLock,
  ensureDirectory,
  pathExists,
  releaseLock,
  writeJsonFile,
  writeTextFile,
} from '../utils/fs';

export type UninstallAction = 'remove-file' | 'remove-dir' | 'unmerge' | 'skip-missing' | 'skip-modified';

export interface UninstallEntry {
  to: string;
  kind: 'file' | 'directory' | 'template';
  action: UninstallAction;
  note?: string;
}

export interface UninstallResult {
  targetPath: string;
  removed: UninstallEntry[];
  skipped: UninstallEntry[];
  dryRun: boolean;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Reverse a merge: remove from the target file exactly the keys whose current
 * value still equals the package's contributed value. User-edited values
 * (which now differ) are left untouched. Format-aware (JSON or TOML) so the
 * Codex `.codex/config.toml` unmerge behaves like the JSON `.claude.json`
 * unmerge. Returns the keys that were removed.
 */
async function unmergeDataFile(sourcePath: string, toPath: string, mergeKeys?: string[]): Promise<string[]> {
  const parse = (filePath: string, content: string): Record<string, unknown> =>
    path.extname(filePath).toLowerCase() === '.toml'
      ? (parseToml(content) as Record<string, unknown>)
      : (JSON.parse(content) as Record<string, unknown>);

  let source: Record<string, unknown>;
  try {
    source = parse(sourcePath, await fs.readFile(sourcePath, 'utf8'));
  } catch {
    return [];
  }
  if (!(await pathExists(toPath))) {
    return [];
  }

  let target: Record<string, unknown>;
  try {
    target = parse(toPath, await fs.readFile(toPath, 'utf8'));
  } catch {
    return [];
  }

  const removed: string[] = [];
  // TOML config.toml uses `mcp_servers`; JSON .claude.json uses `mcpServers`.
  const mcpKey = path.extname(sourcePath).toLowerCase() === '.toml' ? 'mcp_servers' : 'mcpServers';
  const sourceServers = source[mcpKey] as Record<string, unknown> | undefined;
  const targetServers = target[mcpKey] as Record<string, unknown> | undefined;

  // If the merge was scoped to specific keys, only unmerge those (preserve the
  // target's other keys, e.g. its own model/provider on a Codex config.toml).
  const scopedKeys = mergeKeys && mergeKeys.length > 0 ? mergeKeys : undefined;

  for (const key of Object.keys(source)) {
    if (scopedKeys && !scopedKeys.includes(key)) continue;
    if (key === mcpKey) continue;
    if (deepEqual(target[key], source[key])) {
      delete target[key];
      removed.push(key);
    }
  }
  if (sourceServers && targetServers) {
    for (const server of Object.keys(sourceServers)) {
      if (deepEqual(targetServers[server], sourceServers[server])) {
        delete targetServers[server];
        removed.push(`${mcpKey}.${server}`);
      }
    }
  }

  if (removed.length > 0) {
    if (path.extname(toPath).toLowerCase() === '.toml') {
      await writeTextFile(toPath, stringifyToml(target as Record<string, unknown>));
    } else {
      await writeJsonFile(toPath, target);
    }
  }
  return removed;
}

/**
 * Reverse an install. Files/directories are removed only when they still
 * match the package (safe); modified ones are skipped unless `--force`.
 * Merge entries are reversed key-by-key so user-edited values survive.
 * Reuses `planInstall` so no install-time bookkeeping is required — the
 * package itself is the source of truth for what to undo.
 */
export async function uninstallPackage(
  packagePath: string,
  explicitTargetPath?: string,
  dryRun = false,
  force = false,
): Promise<UninstallResult> {
  const plan = await planInstall(packagePath, explicitTargetPath);
  const removed: UninstallEntry[] = [];
  const skipped: UninstallEntry[] = [];

  const decide = (entry: PlanEntry): UninstallAction => {
    if (entry.merge) return 'unmerge';
    if (!entry.exists) return 'skip-missing';
    if (entry.identical) return entry.kind === 'directory' ? 'remove-dir' : 'remove-file';
    return force ? (entry.kind === 'directory' ? 'remove-dir' : 'remove-file') : 'skip-modified';
  };

  if (dryRun) {
    for (const entry of plan.entries) {
      const action = decide(entry);
      const note = action === 'skip-modified' ? 'modified — use --force' : undefined;
      (action === 'skip-missing' || action === 'skip-modified' ? skipped : removed).push({
        to: entry.to,
        kind: entry.kind,
        action,
        note,
      });
    }
    return { targetPath: plan.targetPath, removed, skipped, dryRun: true };
  }

  await ensureDirectory(plan.targetPath);
  const lockPath = path.join(plan.targetPath, '.agentdock.lock');
  const lockHandle = await acquireLock(lockPath);
  try {
    for (const entry of plan.entries) {
      const action = decide(entry);

      if (action === 'skip-missing') {
        skipped.push({ to: entry.to, kind: entry.kind, action });
        continue;
      }
      if (action === 'skip-modified') {
        skipped.push({ to: entry.to, kind: entry.kind, action, note: 'modified — use --force' });
        continue;
      }
      if (action === 'unmerge') {
        const removedKeys = await unmergeDataFile(entry.from, entry.to, entry.mergeKeys);
        removed.push({
          to: entry.to,
          kind: entry.kind,
          action,
          note: removedKeys.length > 0 ? `removed ${removedKeys.join(', ')}` : 'nothing to remove',
        });
        continue;
      }
      // remove-file / remove-dir
      await fs.rm(entry.to, { recursive: true, force: action === 'remove-dir' && force });
      removed.push({ to: entry.to, kind: entry.kind, action });
    }
    return { targetPath: plan.targetPath, removed, skipped, dryRun: false };
  } finally {
    await releaseLock(lockHandle, lockPath);
  }
}
