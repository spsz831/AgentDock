import fs from 'node:fs/promises';
import path from 'node:path';
import { minimatch } from 'minimatch';

export function resolveFrom(baseDir: string, targetPath: string): string {
  return path.resolve(baseDir, targetPath);
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function copyFileSafe(sourcePath: string, targetPath: string): Promise<void> {
  await ensureDirectory(path.dirname(targetPath));
  await fs.copyFile(sourcePath, targetPath);
}

export async function writeTextFile(targetPath: string, content: string): Promise<void> {
  await ensureDirectory(path.dirname(targetPath));
  await fs.writeFile(targetPath, content, 'utf8');
}

async function walkDirectory(rootPath: string, currentPath = rootPath): Promise<string[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkDirectory(rootPath, fullPath));
      continue;
    }

    files.push(path.relative(rootPath, fullPath).replace(/\\/g, '/'));
  }

  return files;
}

export async function copyDirectoryFiltered(
  sourcePath: string,
  targetPath: string,
  include?: string[],
  exclude?: string[],
): Promise<void> {
  const files = await walkDirectory(sourcePath);
  const includePatterns = include?.length ? include : ['**/*'];
  const excludePatterns = exclude ?? [];

  for (const relativeFile of files) {
    const isIncluded = includePatterns.some((pattern) => minimatch(relativeFile, pattern, { dot: true }));
    const isExcluded = excludePatterns.some((pattern) => minimatch(relativeFile, pattern, { dot: true }));

    if (!isIncluded || isExcluded) {
      continue;
    }

    await copyFileSafe(path.join(sourcePath, relativeFile), path.join(targetPath, relativeFile));
  }
}

export async function copyDirectorySafe(sourcePath: string, targetPath: string): Promise<void> {
  await ensureDirectory(path.dirname(targetPath));
  await fs.cp(sourcePath, targetPath, { recursive: true });
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
  await fs.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
