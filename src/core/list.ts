import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ensureDirectory, writeTextFile } from '../utils/fs';
import type {
  AgentDockManifestV3,
  AgentDomain,
  AgentListInfo,
  DomainEntry,
  ListInstallEntry,
  ListMode,
  ListReportData,
  SecretEntry,
} from '../manifest/types';

export interface ListOptions {
  /** Path to a v3 scan manifest (`agentdock.scan.yml`). */
  fromScan?: string;
  /** Path to an install package directory (reads `manifest.resolved.json`). */
  package?: string;
  /** Filter to a single agent; defaults to 'all'. */
  agent?: 'claude' | 'codex' | 'all';
  /** Write a `list-report.md` into this directory. */
  out?: string;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Turn a `DomainEntry.ref` (e.g. `.claude.json#mcpServers.github`,
 * `skills/my-skill`, `agents/reviewer.md`) into a short display name.
 */
function displayName(entry: DomainEntry): string {
  let name = entry.ref ?? entry.path;
  // strip a leading "<file>#" prefix (e.g. .claude.json#, config.toml#)
  name = name.replace(/^[^#]*#/, '');
  name = name.replace(/^mcpServers\./, '');
  name = name.replace(/^[a-z]+\//, '');
  name = name.replace(/\.(md|json|toml|sh|ts|js|txt)$/i, '');
  return name || path.basename(entry.path);
}

function buildAgentInfo(agentName: 'claude' | 'codex', domain: AgentDomain): AgentListInfo {
  const mcp = domain.mcp.map(displayName);
  const skills = domain.skills.map(displayName);
  const agents = domain.agents.map(displayName);
  const plugins = domain.plugins.map(displayName);
  const hooks = domain.hooks.map(displayName);
  const memory = domain.memory.map(displayName);
  const settings = domain.settings.map(displayName);
  const all = mcp.length + skills.length + agents.length + plugins.length + hooks.length + memory.length + settings.length;
  return {
    agent: agentName,
    mcp,
    skills,
    agents,
    plugins,
    hooks,
    memory,
    settings,
    totals: {
      mcp: mcp.length,
      skills: skills.length,
      agents: agents.length,
      plugins: plugins.length,
      hooks: hooks.length,
      memory: memory.length,
      settings: settings.length,
      all,
    },
  };
}

function summarize(report: ListReportData): string {
  const totalEntries = report.agents.reduce((sum, a) => sum + a.totals.all, 0);
  const agentLabels = report.agents.map((a) => a.agent).join(' + ');
  return `已捕获 ${agentLabels || '无'} 环境，共 ${totalEntries} 项定义，隔离 ${report.secretsCount} 个机密`;
}

function renderMarkdown(report: ListReportData): string {
  const lines: string[] = [];
  lines.push('# AgentDock 清单 (list)');
  lines.push('');
  lines.push(`来源: ${report.mode} — ${report.manifestPath}`);
  if (report.project.name) {
    lines.push(`项目: ${report.project.name}`);
  }
  lines.push('');

  if (report.agents.length === 0) {
    lines.push('> 清单为空：未捕获任何助手环境定义。');
    lines.push('');
  }

  for (const info of report.agents) {
    const title = info.agent === 'claude' ? 'Claude Code' : 'Codex';
    lines.push(`## ${title}`);
    const sections: [string, string[]][] = [
      ['MCP servers', info.mcp],
      ['Skills', info.skills],
      ['Agents', info.agents],
      ['Plugins', info.plugins],
      ['Hooks', info.hooks],
      ['Memory', info.memory],
      ['Settings', info.settings],
    ];
    for (const [label, names] of sections) {
      if (names.length > 0) {
        lines.push(`- ${label} (${names.length}): ${names.join(', ')}`);
      } else {
        lines.push(`- ${label}: 无`);
      }
    }
    lines.push(`- 合计: ${info.totals.all} 项`);
    lines.push('');
  }

  lines.push('## 机密隔离');
  if (report.secrets.length > 0) {
    for (const secret of report.secrets) {
      lines.push(`- ${secret.key}  (${secret.source})`);
    }
  } else {
    lines.push('- 无隔离机密');
  }
  lines.push('');

  if (report.installPlan && report.installPlan.length > 0) {
    lines.push('## 安装计划 (package)');
    for (const entry of report.installPlan) {
      lines.push(`- ${entry.from} → ${entry.to}  (${entry.kind})`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function writeReport(outDir: string, report: ListReportData): Promise<string> {
  await ensureDirectory(outDir);
  const reportPath = path.join(outDir, 'list-report.md');
  await writeTextFile(reportPath, renderMarkdown(report));
  return reportPath;
}

/**
 * List what a scan captured (or what a package contains) as a structured
 * inventory. Pure presentation — never re-reads source machines, never
 * mutates files. Consumes the same v3 manifest that `export --from-scan`
 * and `install` already use.
 */
export async function runList(options: ListOptions): Promise<ListReportData> {
  let manifest: AgentDockManifestV3;
  let mode: ListMode;
  let manifestPath: string;
  let installPlan: ListInstallEntry[] | undefined;

  if (options.fromScan) {
    mode = 'scan';
    manifestPath = path.resolve(options.fromScan);
    if (!(await fileExists(manifestPath))) {
      throw new Error(`LIST_NO_SOURCE: scan manifest not found: ${manifestPath}`);
    }
    const raw = await fs.readFile(manifestPath, 'utf8');
    manifest = YAML.parse(raw) as AgentDockManifestV3;
    if (manifest.version !== 3) {
      throw new Error(`LIST_UNSUPPORTED: expected v3 scan manifest, got version ${manifest.version}`);
    }
  } else if (options.package) {
    mode = 'package';
    const pkgDir = path.resolve(options.package);
    manifestPath = path.join(pkgDir, 'manifest.resolved.json');
    if (!(await fileExists(manifestPath))) {
      throw new Error(`LIST_NO_SOURCE: package manifest not found: ${manifestPath}`);
    }
    const raw = await fs.readFile(manifestPath, 'utf8');
    manifest = JSON.parse(raw) as AgentDockManifestV3;
    if (manifest.version !== 3) {
      throw new Error(`LIST_UNSUPPORTED: package manifest is not v3`);
    }
    const planPath = path.join(pkgDir, 'meta', 'install-plan.json');
    if (await fileExists(planPath)) {
      try {
        const plan = JSON.parse(await fs.readFile(planPath, 'utf8')) as {
          sources?: { from: string; to: string; kind: string }[];
        };
        installPlan = (plan.sources ?? []).map((s) => ({ from: s.from, to: s.to, kind: s.kind }));
      } catch {
        installPlan = undefined;
      }
    }
  } else {
    throw new Error('LIST_NO_SOURCE: provide --from-scan <yml> or --package <dir>');
  }

  const agentFilter = options.agent ?? 'all';
  const agents: AgentListInfo[] = [];
  for (const [name, domain] of Object.entries(manifest.agents) as [string, AgentDomain | undefined][]) {
    if (!domain) {
      continue;
    }
    if (agentFilter !== 'all' && agentFilter !== name) {
      continue;
    }
    agents.push(buildAgentInfo(name as 'claude' | 'codex', domain));
  }

  const report: ListReportData = {
    mode,
    manifestPath,
    project: manifest.project,
    agents,
    secretsCount: manifest.secrets.length,
    secrets: manifest.secrets as SecretEntry[],
    summary: '',
    ...(installPlan ? { installPlan } : {}),
  };
  report.summary = summarize(report);

  if (options.out) {
    report.reportPath = await writeReport(path.resolve(options.out), report);
  }

  return report;
}
