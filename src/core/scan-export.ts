import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import {
  findSecretLeaks,
  injectSecretsInText,
  maskSecretsInPlace,
  maskSecretsInText,
  renderEnvExample,
  type FreeTextSecret,
} from '../scanners/sensitive';
import type { Dirent } from 'node:fs';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import {
  acquireLock,
  copyDirectorySafe,
  copyFileSafe,
  ensureDirectory,
  pathExists,
  releaseLock,
  writeJsonFile,
  writeTextFile,
} from '../utils/fs';
import type { AgentDockManifestV3, AgentDomain, DomainEntry } from '../manifest/types';
import type { InstallPlan, InstallPlanEntry } from './exporter';

export interface ScanExportOptions {
  /** Path to a v3 scan manifest (`agentdock.scan.yml`). */
  scanManifestPath: string;
  /** Output package directory. */
  out: string;
  /** Optional `.env` with real secret values to re-inject into masked content. */
  env?: string;
  overwrite?: boolean;
}

export interface ScanExportResult {
  outputPath: string;
  snapshotPath: string;
  installPlanPath: string;
}

function* iterEntries(domain: AgentDomain): Generator<DomainEntry> {
  yield* domain.mcp;
  yield* domain.skills;
  yield* domain.agents;
  yield* domain.plugins;
  yield* domain.hooks;
  yield* domain.memory;
  yield* domain.settings;
}

function toPosix(rel: string): string {
  return rel.split(path.sep).join(path.posix.sep);
}

function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Recover the scanned home directory from entry paths. All entries share the same
 * home; we take the parent of the `.claude` (or `.codex`) segment, or of
 * `.claude.json`.
 */
function deriveScanRoot(manifest: AgentDockManifestV3): string {
  for (const domain of Object.values(manifest.agents)) {
    if (!domain) {
      continue;
    }
    for (const entry of iterEntries(domain)) {
      const parts = entry.path.split(path.sep);
      const idxClaude = parts.indexOf('.claude');
      if (idxClaude >= 0) {
        return parts.slice(0, idxClaude).join(path.sep) || path.sep;
      }
      const idxCodex = parts.indexOf('.codex');
      if (idxCodex >= 0) {
        return parts.slice(0, idxCodex).join(path.sep) || path.sep;
      }
      if (path.basename(entry.path) === '.claude.json') {
        return path.dirname(entry.path);
      }
    }
  }
  throw new Error('SCAN_EXPORT_NO_ROOT: cannot derive home root from scanned entries');
}

/**
 * Build an installable package from a v3 scan manifest. Produces the exact layout
 * `install` already consumes (manifest.resolved.json + meta/install-plan.json +
 * payload/sources/*), so the hardened installer works unchanged.
 *
 * Secrets are masked by default (`{{KEY}}` placeholders); pass `--env` to re-inject
 * real values. MCP servers are aggregated into a single `.claude.json` payload
 * (mcpServers only) — restoring to a fresh/target machine is the intended use.
 */
export async function exportFromScan(options: ScanExportOptions): Promise<ScanExportResult> {
  const manifestPath = path.resolve(options.scanManifestPath);
  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = YAML.parse(raw) as AgentDockManifestV3;
  if (manifest.version !== 3) {
    throw new Error(`SCAN_EXPORT_UNSUPPORTED: expected v3 scan manifest, got version ${manifest.version}`);
  }

  const scanRoot = deriveScanRoot(manifest);
  const env = options.env ? parseEnv(await fs.readFile(options.env, 'utf8')) : undefined;

  const outputPath = path.resolve(options.out);
  await ensureDirectory(outputPath);
  const lockPath = path.join(outputPath, '.agentdock-scan-export.lock');
  const lockHandle = await acquireLock(lockPath);
  try {
    const payloadSourcesRoot = path.join(outputPath, 'payload', 'sources');
    await ensureDirectory(payloadSourcesRoot);

    const sources: InstallPlanEntry[] = [];
    const freeTextSecrets: FreeTextSecret[] = [];
    const toFrom = (diskRel: string): string => `payload/sources/${diskRel}`;

    /**
     * Walk a copied directory and mask (or re-inject, when `env` is set)
     * leaked secret tokens in every text file. Skips files with no leak and
     * no placeholder so binaries / clean files are never rewritten.
     */
    async function processDirectoryTexts(dir: string, agent: string): Promise<void> {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await processDirectoryTexts(full, agent);
          continue;
        }
        let content: string;
        try {
          content = await fs.readFile(full, 'utf8');
        } catch {
          continue; // unreadable / binary — leave untouched
        }
        const hasLeak = findSecretLeaks(content).length > 0;
        const hasPlaceholder = env ? /\{\{AGENTDOCK_[A-Z0-9_]+\}\}/.test(content) : false;
        if (!hasLeak && !hasPlaceholder) {
          continue;
        }
        const out = env
          ? injectSecretsInText(maskSecretsInText(content, agent, freeTextSecrets), env)
          : maskSecretsInText(content, agent, freeTextSecrets);
        await writeTextFile(full, out);
      }
    }

    for (const [agentName, domain] of Object.entries(manifest.agents) as [string, AgentDomain | undefined][]) {
      if (!domain) {
        continue;
      }
      const agent = agentName;

      // --- MCP: aggregate all captured servers into one .claude.json payload ---
      if (domain.mcp.length > 0) {
        const claudeJsonPath = domain.mcp[0].path;
        if (!(await pathExists(claudeJsonPath))) {
          throw new Error(`SCAN_EXPORT_MISSING_SOURCE: ${claudeJsonPath} (scanned but no longer present)`);
        }
        const claudeJson = JSON.parse(await fs.readFile(claudeJsonPath, 'utf8')) as {
          mcpServers?: Record<string, unknown>;
        };
        const merged = { mcpServers: {} as Record<string, unknown> };
        for (const entry of domain.mcp) {
          const name = (entry.ref ?? '').split('mcpServers.')[1];
          if (!name) {
            continue;
          }
          const def = claudeJson.mcpServers?.[name];
          if (def == null) {
            continue;
          }
          const cloned = JSON.parse(JSON.stringify(def));
          maskSecretsInPlace(cloned, `${claudeJsonPath}#mcpServers.${name}`, agent, env);
          merged.mcpServers[name] = cloned;
        }
        const diskRel = '.agentdock-mcp.json';
        const content = JSON.stringify(merged, null, 2);
        await writeTextFile(path.join(payloadSourcesRoot, diskRel), content);
        // `merge: true` → installer deep-merges this JSON into the target's
        // existing file (preserving other top-level keys / other mcpServers)
        // instead of overwriting it. Makes `install` safe on a machine
        // that already has a `.claude.json`.
        sources.push({ id: `${agent}-mcp-merged`, kind: 'file', from: toFrom(diskRel), to: '.claude.json', merge: true });
      }

      // --- Everything else ---
      for (const entry of iterEntries(domain)) {
        if (entry.kind === 'mcp') {
          continue; // handled above
        }
        if (!(await pathExists(entry.path))) {
          throw new Error(`SCAN_EXPORT_MISSING_SOURCE: ${entry.path} (scanned but no longer present)`);
        }
        const rel = toPosix(path.relative(scanRoot, entry.path));
        const stat = await fs.stat(entry.path);
        const kind: 'file' | 'directory' = stat.isDirectory() ? 'directory' : 'file';
        const targetDisk = path.join(payloadSourcesRoot, rel);

        if (kind === 'directory') {
          // recursive copy (skill dirs), then mask/inject any leaked
          // tokens inside the copied text files (prevents plaintext riding into the package)
          await copyDirectorySafe(entry.path, targetDisk);
          await processDirectoryTexts(targetDisk, agent);
        } else if (entry.kind === 'settings') {
          if (path.extname(entry.path) === '.toml') {
            // Codex config.toml: parse as TOML, mask secrets at the object
            // level (same detectors as JSON), re-emit as TOML so the restore
            // lands back as a valid .codex/config.toml.
            try {
              const parsed = parseToml(await fs.readFile(entry.path, 'utf8'));
              maskSecretsInPlace(parsed, entry.path, agent, env);
              await writeTextFile(targetDisk, stringifyToml(parsed as Record<string, unknown>));
            } catch (parseErr) {
              // Malformed TOML: fall back to a verbatim copy so export never
              // crashes. Secrets in such a file are NOT masked here; `doctor`
              // still flags leaked tokens in the resulting package.
              await copyFileSafe(entry.path, targetDisk);
              console.warn(
                `[agentdock] 警告：无法解析 ${entry.path}（${String((parseErr as Error).message)}），已按原样复制（机密未脱敏，请用 doctor 检查）`,
              );
            }
          } else {
            try {
              const obj = JSON.parse(await fs.readFile(entry.path, 'utf8'));
              maskSecretsInPlace(obj, entry.path, agent, env);
              await writeTextFile(targetDisk, JSON.stringify(obj, null, 2));
            } catch (parseErr) {
              await copyFileSafe(entry.path, targetDisk);
              console.warn(
                `[agentdock] 警告：无法解析 ${entry.path}（${String((parseErr as Error).message)}），已按原样复制（机密未脱敏，请用 doctor 检查）`,
              );
            }
          }
        } else {
          // skill .md / agent .md / plugin json / hook script / memory md:
          // mask (or re-inject when `env` is set) any leaked secret tokens
          // so plaintext never rides into the package. Clean files (no leak,
          // no placeholder) are copied verbatim.
          let content: string;
          try {
            content = await fs.readFile(entry.path, 'utf8');
          } catch {
            await copyFileSafe(entry.path, targetDisk);
            continue;
          }
          const hasLeak = findSecretLeaks(content).length > 0;
          const hasPlaceholder = env ? /\{\{AGENTDOCK_[A-Z0-9_]+\}\}/.test(content) : false;
          if (!hasLeak && !hasPlaceholder) {
            await copyFileSafe(entry.path, targetDisk);
          } else {
            const out = env
              ? injectSecretsInText(maskSecretsInText(content, agent, freeTextSecrets), env)
              : maskSecretsInText(content, agent, freeTextSecrets);
            await writeTextFile(targetDisk, out);
          }
        }

        // Codex `config.toml` (and any TOML settings entry) is merged rather
        // than overwritten, so installing onto a machine that already has a
        // config.toml keeps its own model/provider settings and only adds the
        // package's `mcp_servers` — mirroring the Claude `.claude.json` merge
        // behavior (which scopes to `mcpServers`) and closing the Codex parity
        // gap. On a fresh target the whole file is restored.
        const merge = entry.kind === 'settings' && path.extname(entry.path) === '.toml' ? true : undefined;
        const mergeKeys = merge ? ['mcp_servers'] : undefined;
        sources.push({ id: entry.id, kind, from: toFrom(rel), to: rel, merge, mergeKeys });
      }
    }

    const installPlan: InstallPlan = {
      overwrite: options.overwrite ?? false,
      sources,
      templates: [],
    };

    const snapshotPath = path.join(outputPath, 'manifest.resolved.json');
    const installPlanPath = path.join(outputPath, 'meta', 'install-plan.json');
    const packageMetadataPath = path.join(outputPath, 'package.json');
    const envExamplePath = path.join(outputPath, '.env.example');

    // Free-text secrets discovered during export are folded into the resolved
    // manifest + the package's own `.env.example` so `--env` re-injection
    // and `doctor --package` stay consistent end-to-end.
    const augmentedSecrets = [
      ...manifest.secrets,
      ...freeTextSecrets.map((secret) => ({
        key: secret.key,
        source: secret.source,
        sample: secret.sample,
      })),
    ];
    const resolvedManifest: AgentDockManifestV3 = {
      ...manifest,
      secrets: augmentedSecrets,
    };

    await writeJsonFile(snapshotPath, resolvedManifest);
    await writeJsonFile(installPlanPath, installPlan);
    await writeJsonFile(packageMetadataPath, {
      name: 'agentdock-scan-package',
      version: '1.0.0',
      project: manifest.project.name,
      manifestVersion: 3,
    });
    await writeTextFile(envExamplePath, renderEnvExample(augmentedSecrets));

    return { outputPath, snapshotPath, installPlanPath };
  } finally {
    await releaseLock(lockHandle, lockPath);
  }
}
