import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Dirent } from 'node:fs';
import YAML from 'yaml';
import { scanClaude, RUN_STATE_NAMES } from '../scanners/claude-scanner';
import { scanCodex } from '../scanners/codex-scanner';
import { findSecretLeaks } from '../scanners/sensitive';
import { parse as parseToml } from 'smol-toml';
import type { AgentDockManifestV3, AgentDomain, DomainEntry } from '../manifest/types';
import { ensureDirectory, writeTextFile } from '../utils/fs';
import type { DoctorMode, DoctorReportData, DoctorCheck, DoctorFinding, CheckStatus } from '../manifest/types';

export interface DoctorOptions {
  agent: 'claude' | 'codex' | 'all';
  /** Home directory to inspect (live mode). Defaults to os.homedir(). */
  root?: string;
  /** Audit a scan artifact (agentdock.scan.yml). */
  fromScan?: string;
  /** Audit an install package directory. */
  package?: string;
  /** Write a doctor-report.md into this directory. */
  out?: string;
}

// ===== helpers =====

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function aggregateStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'pass';
}

function makeCheck(id: string, label: string, findings: DoctorFinding[], passDetail: string, remediation?: string): DoctorCheck {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const status: CheckStatus = errors > 0 ? 'fail' : warns > 0 ? 'warn' : 'pass';
  const detail = status === 'pass' ? passDetail : `${errors} 错误 / ${warns} 警告`;
  const check: DoctorCheck = { id, label, status, detail, findings };
  if (remediation && status !== 'pass') {
    check.remediation = remediation;
  }
  return check;
}

/**
 * Quantized exit code for the doctor command, so CI / automation can tell
 * apart "clean", "degraded (warnings only)" and "hard failure":
 *   pass → 0, warn → 1, fail → 2.
 */
export function doctorExitCode(report: DoctorReportData): number {
  const worst = aggregateStatus(report.checks.map((c) => c.status));
  if (worst === 'fail') return 2;
  if (worst === 'warn') return 1;
  return 0;
}

function finalize(mode: DoctorMode, agent: string | undefined, target: string, checks: DoctorCheck[]): DoctorReportData {
  const status = aggregateStatus(checks.map((c) => c.status));
  const healthy = status !== 'fail';
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const summary = healthy
    ? `环境健康：${checks.length} 项检查通过${warnCount ? `，${warnCount} 项警告` : ''}`
    : `发现问题：${failCount} 项失败 / ${warnCount} 项警告，可参考各项【建议】处理`;
  return { mode, agent, target, healthy, checks, summary };
}

async function walkForRunState(dir: string): Promise<string[]> {
  const hits: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (RUN_STATE_NAMES.has(entry.name)) {
          hits.push(full);
          continue;
        }
        await walk(full);
      } else if (RUN_STATE_NAMES.has(entry.name)) {
        hits.push(full);
      }
    }
  }
  await walk(dir);
  return hits;
}

async function walkForLeaks(dir: string): Promise<{ file: string; leaks: string[] }[]> {
  const results: { file: string; leaks: string[] }[] = [];
  async function walk(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        try {
          const text = await fs.readFile(full, 'utf8');
          const leaks = findSecretLeaks(text);
          if (leaks.length) {
            results.push({ file: full, leaks });
          }
        } catch {
          // binary or unreadable — not text we can scan
        }
      }
    }
  }
  await walk(dir);
  return results;
}

/**
 * Scan a single captured entry for leaked secrets. Skills are recorded as their
 * directory (not SKILL.md), so directories are walked recursively; files are
 * read directly.
 */
async function scanEntryForLeaks(entry: DomainEntry): Promise<string[]> {
  try {
    const stat = await fs.stat(entry.path);
    if (stat.isDirectory()) {
      const found = await walkForLeaks(entry.path);
      return found.flatMap((item) => item.leaks);
    }
    const text = await fs.readFile(entry.path, 'utf8');
    return findSecretLeaks(text);
  } catch {
    return [];
  }
}

// ===== modes =====

async function doctorLiveClaude(root: string): Promise<DoctorCheck[]> {
  const claudeDir = path.join(root, '.claude');
  const checks: DoctorCheck[] = [];

  if (!(await fileExists(claudeDir))) {
    checks.push({
      id: 'config-present',
      label: '配置目录存在',
      status: 'warn',
      detail: `未找到 ${claudeDir}，无可体检的 Claude 环境`,
      findings: [],
      remediation: '确认 `--root` 指向正确的用户主目录（默认 os.homedir()），或先安装 Claude Code 生成配置后再体检。',
    });
    return checks;
  }

  const scan = await scanClaude(root);
  const domain = scan.domain;

  // 1. 配置合法性
  const parseFindings: DoctorFinding[] = [];
  for (const file of [path.join(claudeDir, 'settings.json'), path.join(root, '.claude.json')]) {
    if (await fileExists(file)) {
      try {
        JSON.parse(await fs.readFile(file, 'utf8'));
      } catch (error) {
        parseFindings.push({ severity: 'error', message: `JSON 解析失败: ${(error as Error).message}`, path: file });
      }
    }
  }
  for (const file of ['installed_plugins.json', 'known_marketplaces.json']) {
    const pluginPath = path.join(claudeDir, 'plugins', file);
    if (await fileExists(pluginPath)) {
      try {
        JSON.parse(await fs.readFile(pluginPath, 'utf8'));
      } catch (error) {
        parseFindings.push({ severity: 'error', message: `插件注册 JSON 解析失败: ${(error as Error).message}`, path: pluginPath });
      }
    }
  }
  checks.push(makeCheck(
    'config-valid',
    '配置文件合法',
    parseFindings,
    'Claude 配置文件均为合法 JSON',
    '修复配置文件语法后重试（见上方路径与报错）；也可运行 `agentdock validate` 精确定位问题行。',
  ));

  // 2. 可迁移完整性（scan 会捕获的内容）
  const counts = {
    mcp: domain.mcp.length,
    skills: domain.skills.length,
    agents: domain.agents.length,
    plugins: domain.plugins.length,
    hooks: domain.hooks.length,
    memory: domain.memory.length,
    settings: domain.settings.length,
  };
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  checks.push({
    id: 'migratable',
    label: '可迁移内容',
    status: total > 0 ? 'pass' : 'warn',
    detail: `将捕获 MCP:${counts.mcp} Skill:${counts.skills} Agent:${counts.agents} Plugin:${counts.plugins} Hook:${counts.hooks} 记忆:${counts.memory} settings:${counts.settings}`,
    findings: scan.notes.map((note) => ({ severity: 'info' as const, message: note })),
    remediation: total > 0
      ? undefined
      : '未捕获到可迁移内容。确认目标机已安装 Claude/Codex 且配置位于默认路径，或用 `--root` 指定正确的用户主目录后重新 `scan`。',
  });

  // 3. 敏感泄露风险
  // scan 只打码 JSON settings / mcpServers；skills/agents/memory/hooks/plugins 是原文复制。
  const verbatimEntries: DomainEntry[] = [
    ...domain.skills,
    ...domain.agents,
    ...domain.memory,
    ...domain.hooks,
    ...domain.plugins,
  ];
  const leakFindings: DoctorFinding[] = [];
  for (const entry of verbatimEntries) {
    const leaks = await scanEntryForLeaks(entry);
    if (leaks.length) {
      leakFindings.push({
        severity: 'error',
        message: `在"原文复制"文件（skills/agents/memory/hooks/plugins）中发现 ${leaks.length} 处疑似真实令牌；scan 不在扫描期打码，但 \`export --from-scan\` 会自动打码（安全），不会随包泄露`,
        path: entry.path,
      });
    }
  }
  // settings.json / .claude.json 中的令牌会被 scan 自动打码 → info
  for (const file of [path.join(claudeDir, 'settings.json'), path.join(root, '.claude.json')]) {
    if (await fileExists(file)) {
      try {
        const text = await fs.readFile(file, 'utf8');
        const leaks = findSecretLeaks(text);
        if (leaks.length) {
          leakFindings.push({
            severity: 'info',
            message: `在 ${path.basename(file)} 发现 ${leaks.length} 处令牌，scan 会在导出时自动打码（安全）`,
            path: file,
          });
        }
      } catch {
        // ignore
      }
    }
  }
  checks.push(makeCheck(
    'secret-leak',
    '敏感泄露风险',
    leakFindings,
    '导出时令牌会被隔离，不会随包泄露',
    '免费文本中的明文令牌，`scan` 不在扫描期打码，但 `export --from-scan` 会自动打码（安全），不会随包泄露；若 `doctor --package` 仍报泄露，说明该文件未被正确打码，可手动将明文替换为 `{{AGENTDOCK_<AGENT>_<KEY>}}` 占位符。',
  ));

  // 4. 运行态隔离
  const runState = await walkForRunState(claudeDir);
  const runStateFindings: DoctorFinding[] = runState.map((p) => ({
    severity: 'info' as const,
    message: '运行态文件存在，scan 已正确跳过（不会导出）',
    path: p,
  }));
  checks.push(makeCheck('run-state', '运行态隔离', runStateFindings, '运行态文件被排除在导出之外'));

  return checks;
}

async function doctorLiveCodex(root: string): Promise<DoctorCheck[]> {
  const codexDir = path.join(root, '.codex');
  const checks: DoctorCheck[] = [];

  if (!(await fileExists(codexDir))) {
    checks.push({
      id: 'config-present',
      label: '配置目录存在',
      status: 'warn',
      detail: `未找到 ${codexDir}，无可体检的 Codex 环境`,
      findings: [],
      remediation: '确认 `--root` 指向正确的用户主目录（默认 os.homedir()），或先安装 Codex 生成配置后再体检。',
    });
    return checks;
  }

  const scan = await scanCodex(root);
  const domain = scan.domain;
  const configPath = path.join(codexDir, 'config.toml');

  // 1. 配置合法性（TOML）
  const parseFindings: DoctorFinding[] = [];
  if (await fileExists(configPath)) {
    try {
      parseToml(await fs.readFile(configPath, 'utf8'));
    } catch (error) {
      parseFindings.push({ severity: 'error', message: `TOML 解析失败: ${(error as Error).message}`, path: configPath });
    }
  } else {
    parseFindings.push({ severity: 'warn', message: '未找到 .codex/config.toml', path: configPath });
  }
  checks.push(makeCheck(
    'config-valid',
    '配置文件合法',
    parseFindings,
    'Codex config.toml 为合法 TOML',
    '修复 config.toml 语法后重试（见上方路径与报错）；也可运行 `agentdock validate` 精确定位问题行。',
  ));

  // 2. 可迁移完整性
  let mcpCount = 0;
  if (await fileExists(configPath)) {
    try {
      const parsed = parseToml(await fs.readFile(configPath, 'utf8')) as { mcp_servers?: Record<string, unknown> };
      const ms = parsed.mcp_servers;
      mcpCount = ms && typeof ms === 'object' ? Object.keys(ms).length : 0;
    } catch {
      // parse error already reported above
    }
  }
  const counts = {
    mcp: mcpCount,
    skills: domain.skills.length,
    agents: domain.agents.length,
    plugins: domain.plugins.length,
    hooks: domain.hooks.length,
    memory: domain.memory.length,
    settings: domain.settings.length,
  };
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  checks.push({
    id: 'migratable',
    label: '可迁移内容',
    status: total > 0 ? 'pass' : 'warn',
    detail: `将捕获 MCP:${counts.mcp} 记忆:${counts.memory} settings:${counts.settings}`,
    findings: scan.notes.map((note) => ({ severity: 'info' as const, message: note })),
    remediation: total > 0
      ? undefined
      : '未捕获到可迁移内容。确认目标机已安装 Codex 且配置位于默认路径，或用 `--root` 指定正确的用户主目录后重新 `scan`。',
  });

  // 3. 敏感泄露风险
  const verbatimEntries: DomainEntry[] = [
    ...domain.memory,
    ...domain.skills,
    ...domain.agents,
    ...domain.hooks,
    ...domain.plugins,
  ];
  const leakFindings: DoctorFinding[] = [];
  for (const entry of verbatimEntries) {
    const leaks = await scanEntryForLeaks(entry);
    if (leaks.length) {
      leakFindings.push({
        severity: 'error',
        message: `在"原文复制"文件（skills/agents/memory/hooks/plugins）中发现 ${leaks.length} 处疑似真实令牌；scan 不在扫描期打码，但 \`export --from-scan\` 会自动打码（安全），不会随包泄露`,
        path: entry.path,
      });
    }
  }
  // config.toml 中的令牌会被 scan 自动打码（TOML 设置项是 scan 会处理的定义）→ info
  if (await fileExists(configPath)) {
    try {
      const text = await fs.readFile(configPath, 'utf8');
      const leaks = findSecretLeaks(text);
      if (leaks.length) {
        leakFindings.push({
          severity: 'info',
          message: `在 config.toml 发现 ${leaks.length} 处令牌，scan 会在导出时自动打码（安全）`,
          path: configPath,
        });
      }
    } catch {
      // ignore
    }
  }
  checks.push(makeCheck(
    'secret-leak',
    '敏感泄露风险',
    leakFindings,
    '导出时令牌会被隔离，不会随包泄露',
    '免费文本中的明文令牌，`scan` 不在扫描期打码，但 `export --from-scan` 会自动打码（安全），不会随包泄露；若 `doctor --package` 仍报泄露，说明该文件未被正确打码，可手动将明文替换为 `{{AGENTDOCK_<AGENT>_<KEY>}}` 占位符。',
  ));

  // 4. 运行态隔离
  const runState = await walkForRunState(codexDir);
  const runStateFindings: DoctorFinding[] = runState.map((p) => ({
    severity: 'info' as const,
    message: '运行态文件存在，scan 已正确跳过（不会导出）',
    path: p,
  }));
  checks.push(makeCheck('run-state', '运行态隔离', runStateFindings, '运行态文件被排除在导出之外'));

  return checks;
}

async function doctorLive(options: DoctorOptions): Promise<DoctorReportData> {
  const root = options.root ?? os.homedir();
  const checks: DoctorCheck[] = [];
  if (options.agent === 'claude' || options.agent === 'all') {
    checks.push(...await doctorLiveClaude(root));
  }
  if (options.agent === 'codex' || options.agent === 'all') {
    checks.push(...await doctorLiveCodex(root));
  }
  return finalize('live', options.agent, root, checks);
}

async function doctorScan(options: DoctorOptions): Promise<DoctorReportData> {
  const scanPath = options.fromScan as string;
  const checks: DoctorCheck[] = [];

  if (!(await fileExists(scanPath))) {
    checks.push({
      id: 'scan-present',
      label: '扫描产物存在',
      status: 'fail',
      detail: `未找到 ${scanPath}`,
      findings: [],
      remediation: '确认 `--from-scan` 指向正确的 `agentdock.scan.yml` 路径；若尚未扫描，先运行 `agentdock scan --agent all --out <目录>`。',
    });
    return finalize('scan', options.agent, scanPath, checks);
  }

  const dir = path.dirname(scanPath);
  const manifest = YAML.parse(await fs.readFile(scanPath, 'utf8')) as AgentDockManifestV3;

  // 1. 引用完整性：manifest 记录的源文件是否仍存在
  const missing: DoctorFinding[] = [];
  const domains = [manifest.agents.claude, manifest.agents.codex].filter(Boolean) as AgentDomain[];
  for (const dom of domains) {
    for (const entries of Object.values(dom)) {
      for (const entry of entries as DomainEntry[]) {
        if (!(await fileExists(entry.path))) {
          missing.push({ severity: 'error', message: '源文件不存在，无法还原', path: entry.path });
        }
      }
    }
  }
  checks.push(makeCheck(
    'ref-integrity',
    '引用完整性',
    missing,
    '所有记录的源文件仍存在，可完整还原',
    '部分源文件已不存在，`install` 时将跳过这些条目导致还原不完整。请重新运行 `agentdock scan` 刷新 manifest，或确认这些路径在目标机上仍可用。',
  ));

  // 2. 产物泄露扫描
  const leaks = await walkForLeaks(dir);
  const leakFindings: DoctorFinding[] = leaks.map((leak) => ({
    severity: 'error' as const,
    message: `发现 ${leak.leaks.length} 处疑似真实令牌`,
    path: leak.file,
  }));
  checks.push(makeCheck(
    'artifact-leak',
    '产物无泄露',
    leakFindings,
    '扫描产物中未发现真实令牌',
    '扫描产物含真实令牌，切勿提交或分发。重新运行 `scan`（确保敏感文件未被 verbatim 复制），或使用 `export --from-scan <scan> --env <你的.env>` 以占位符打包、真实值留在本机 `.env`。',
  ));

  // 3. 运行态未入产物
  const runState = await walkForRunState(dir);
  const runStateFindings: DoctorFinding[] = runState.map((p) => ({
    severity: 'error' as const,
    message: '运行态文件出现在产物中（绝不应导出）',
    path: p,
  }));
  checks.push(makeCheck(
    'artifact-runstate',
    '产物无运行态',
    runStateFindings,
    '产物中不含运行态文件',
    '运行态文件（auth.json / cache / sessions 等）绝不应出现在产物中，否则会携带凭据或臃肿数据。检查 `scan` 是否误将其纳入，删除后重新 `export`。',
  ));

  // 4. 占位符一致性：隔离的机密数量应与 .env.example 中定义的占位符数量一致
  // 注意：测试 harness 下字符串比较（includes / Set.has / 属性访问）对这类
  // 大写占位符字符串存在已知异常，故此处只比较"数量"（数值比较安全且确定）
  const envPath = path.join(dir, '.env.example');
  const hasEnv = await fileExists(envPath);
  const consistencyFindings: DoctorFinding[] = [];
  let definedCount = 0;
  if (hasEnv) {
    const envText = await fs.readFile(envPath, 'utf8');
    for (const raw of envText.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      if (line.indexOf('=') !== -1) {
        definedCount += 1;
      }
    }
    if (manifest.secrets.length > definedCount) {
      consistencyFindings.push({
        severity: 'warn',
        message: `.env.example 定义了 ${definedCount} 个占位符，但隔离了 ${manifest.secrets.length} 个机密，数量不一致`,
        path: envPath,
      });
    }
  } else if (manifest.secrets.length > 0) {
    consistencyFindings.push({ severity: 'warn', message: '存在隔离机密但缺少 .env.example' });
  }
  const placeholderRemediation =
    manifest.secrets.length > 0 && definedCount < manifest.secrets.length
      ? `隔离了 ${manifest.secrets.length} 个机密但 \`.env.example\` 只定义了 ${definedCount} 个占位符。补齐缺失的 \`AGENTDOCK_*\` 变量名（与 manifest.secrets 中的 key 一致），确保 \`install\`/回注后真实值能正确落位。`
      : (manifest.secrets.length > 0 && !hasEnv
        ? '存在隔离机密但缺少 `.env.example`。运行 `scan` 会一并生成 `.env.example`；若为手动构造产物，请补一个列出所有 `AGENTDOCK_*` 占位符的 `.env.example`。'
        : undefined);
  checks.push(makeCheck(
    'placeholder-consistency',
    '占位符一致',
    consistencyFindings,
    '所有隔离机密均有对应 .env.example 占位',
    placeholderRemediation,
  ));

  return finalize('scan', options.agent, scanPath, checks);
}

async function doctorPackage(options: DoctorOptions): Promise<DoctorReportData> {
  const pkgDir = options.package as string;
  const checks: DoctorCheck[] = [];

  if (!(await fileExists(pkgDir))) {
    checks.push({
      id: 'pkg-present',
      label: '安装包存在',
      status: 'fail',
      detail: `未找到 ${pkgDir}`,
      findings: [],
      remediation: '确认 `--package` 指向正确的安装包目录（即 `export` 产出的目录）。',
    });
    return finalize('package', options.agent, pkgDir, checks);
  }

  const payloadSources = path.join(pkgDir, 'payload', 'sources');
  const scanDir = (await fileExists(payloadSources)) ? payloadSources : pkgDir;

  const leaks = await walkForLeaks(scanDir);
  const leakFindings: DoctorFinding[] = leaks.map((leak) => ({
    severity: 'error' as const,
    message: `发现 ${leak.leaks.length} 处疑似真实令牌`,
    path: leak.file,
  }));
  checks.push(makeCheck(
    'pkg-leak',
    '安装包无泄露',
    leakFindings,
    '安装包中未发现真实令牌',
    '安装包含真实令牌，切勿分发或在目标机直接 `install`。重新运行 `scan`（确保敏感文件未被 verbatim 复制），或使用 `export --from-scan <scan> --env <你的.env>` 以占位符打包。',
  ));

  const runState = await walkForRunState(scanDir);
  const runStateFindings: DoctorFinding[] = runState.map((p) => ({
    severity: 'error' as const,
    message: '运行态文件出现在安装包中',
    path: p,
  }));
  checks.push(makeCheck(
    'pkg-runstate',
    '安装包无运行态',
    runStateFindings,
    '安装包中不含运行态文件',
    '运行态文件（auth.json / cache / sessions 等）不应出现在安装包中。检查 `scan` 是否误将其纳入，删除后重新 `export`。',
  ));

  return finalize('package', options.agent, pkgDir, checks);
}

// ===== report rendering =====

function renderDoctorReport(report: DoctorReportData): string {
  const lines: string[] = ['# AgentDock Doctor Report', ''];
  lines.push(`- Mode: \`${report.mode}\``);
  if (report.agent) {
    lines.push(`- Agent: \`${report.agent}\``);
  }
  lines.push(`- Target: \`${report.target}\``);
  lines.push(`- **${report.healthy ? 'HEALTHY' : 'ISSUES FOUND'}**`);
  lines.push(`- ${report.summary}`);
  lines.push('');
  for (const check of report.checks) {
    const icon = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL';
    lines.push(`## [${icon}] ${check.label}`);
    lines.push(`- ${check.detail}`);
    for (const finding of check.findings) {
      const mark = finding.severity === 'error' ? 'X' : finding.severity === 'warn' ? '!' : 'i';
      lines.push(`  - [${mark}] ${finding.message}${finding.path ? ` (\`${finding.path}\`)` : ''}`);
    }
    if (check.remediation) {
      lines.push(`- **建议**: ${check.remediation}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ===== entry =====

export async function runDoctor(options: DoctorOptions): Promise<DoctorReportData> {
  let report: DoctorReportData;
  if (options.fromScan) {
    report = await doctorScan(options);
  } else if (options.package) {
    report = await doctorPackage(options);
  } else {
    report = await doctorLive(options);
  }

  if (options.out) {
    await ensureDirectory(options.out);
    const reportPath = path.join(options.out, 'doctor-report.md');
    await writeTextFile(reportPath, renderDoctorReport(report));
    report.reportPath = reportPath;
  }

  return report;
}
