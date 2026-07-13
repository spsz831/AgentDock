import fs from 'node:fs/promises';
import path from 'node:path';
import { minimatch } from 'minimatch';

export function resolveFrom(baseDir: string, targetPath: string): string {
  return path.resolve(baseDir, targetPath);
}

/**
 * Resolve `relativeTarget` against `root` and assert the result stays within `root`.
 * Throws PATH_ESCAPE if it would escape (e.g. destination: ../../../etc/x). Blocks path traversal.
 */
export function safeResolveWithin(root: string, relativeTarget: string, label = 'path'): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativeTarget);
  const inside = resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
  if (!inside) {
    throw new Error(`PATH_ESCAPE: ${label} resolves outside the allowed root: ${relativeTarget}`);
  }
  return resolved;
}

/**
 * Acquire an exclusive lock file (O_EXCL). Retries until timeout, then throws LOCK_TIMEOUT.
 * Caller MUST call releaseLock in a finally block.
 */
export async function acquireLock(lockPath: string, timeoutMs = 10000, retryMs = 200): Promise<fs.FileHandle> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await fs.open(lockPath, 'wx');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        if (Date.now() >= deadline) {
          throw new Error(`LOCK_TIMEOUT: another agentdock process holds the lock at ${lockPath}`);
        }
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        continue;
      }
      throw err;
    }
  }
}

export async function releaseLock(handle: fs.FileHandle, lockPath: string): Promise<void> {
  try {
    await handle.close();
  } catch {
    /* ignore */
  }
  try {
    await fs.rm(lockPath, { force: true });
  } catch {
    /* ignore */
  }
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function copyFileSafe(sourcePath: string, targetPath: string): Promise<void> {
  await ensureDirectory(path.dirname(targetPath));
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.copyFile(sourcePath, tmpPath);
  await fs.rename(tmpPath, targetPath);
}

export async function writeTextFile(targetPath: string, content: string): Promise<void> {
  await ensureDirectory(path.dirname(targetPath));
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, targetPath);
}

interface WalkedFile {
  absolutePath: string;
  relativePath: string;
}

async function walkDirectoryWithSymlinkPolicy(
  currentPath: string,
  relativeBase: string,
  followSymlinks: boolean,
  visitedRealDirectories = new Set<string>(),
): Promise<WalkedFile[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const files: WalkedFile[] = [];

  for (const entry of entries) {
    const sourcePath = path.join(currentPath, entry.name);
    const relativePath = path.join(relativeBase, entry.name).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      files.push(...await walkDirectoryWithSymlinkPolicy(sourcePath, relativePath, followSymlinks, visitedRealDirectories));
      continue;
    }

    if (entry.isFile()) {
      files.push({ absolutePath: sourcePath, relativePath });
      continue;
    }

    if (!entry.isSymbolicLink()) {
      continue;
    }

    if (!followSymlinks) {
      continue;
    }

    const resolvedPath = await fs.realpath(sourcePath);
    const stat = await fs.stat(resolvedPath);

    if (stat.isDirectory()) {
      if (visitedRealDirectories.has(resolvedPath)) {
        continue;
      }
      visitedRealDirectories.add(resolvedPath);
      files.push(...await walkDirectoryWithSymlinkPolicy(resolvedPath, relativePath, followSymlinks, visitedRealDirectories));
      continue;
    }

    if (stat.isFile()) {
      files.push({ absolutePath: resolvedPath, relativePath });
    }
  }

  return files;
}

export async function copyDirectoryFiltered(
  sourcePath: string,
  targetPath: string,
  include?: string[],
  exclude?: string[],
  followSymlinks = true,
): Promise<void> {
  const files = await walkDirectoryWithSymlinkPolicy(sourcePath, '', followSymlinks);
  const includePatterns = include?.length ? include : ['**/*'];
  const excludePatterns = exclude ?? [];

  for (const file of files) {
    const isIncluded = includePatterns.some((pattern) => minimatch(file.relativePath, pattern, { dot: true }));
    const isExcluded = excludePatterns.some((pattern) => minimatch(file.relativePath, pattern, { dot: true }));

    if (!isIncluded || isExcluded) {
      continue;
    }

    await copyFileSafe(file.absolutePath, path.join(targetPath, file.relativePath));
  }
}

export async function copyDirectorySafe(sourcePath: string, targetPath: string, followSymlinks = true): Promise<void> {
  await ensureDirectory(path.dirname(targetPath));
  await fs.cp(sourcePath, targetPath, { recursive: true, dereference: followSymlinks });
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(targetPath: string): Promise<T> {
  const content = await fs.readFile(targetPath, 'utf8');
  return JSON.parse(content) as T;
}

export async function writeJsonFile(targetPath: string, data: unknown): Promise<void> {
  await ensureDirectory(path.dirname(targetPath));
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, targetPath);
}
