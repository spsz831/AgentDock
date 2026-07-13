export type ManifestVersion = 1 | 2;
export type SourceType = 'file' | 'directory';
export type InstallMode = 'package' | 'direct';

export interface AgentDockProject {
  name: string;
  description?: string;
}

export interface AgentDockSource {
  id: string;
  type: SourceType;
  path: string;
  destination?: string;
  include?: string[];
  exclude?: string[];
}

export interface AgentDockTemplate {
  id: string;
  source: string;
  destination: string;
  variables?: Record<string, string>;
}

export interface AgentDockOutput {
  type: 'directory';
  path: string;
}

export interface AgentDockInstall {
  mode?: InstallMode;
  targetPath?: string;
  overwrite?: boolean;
}

export interface AgentDockOptions {
  includeHidden?: boolean;
  overwrite?: boolean;
  followSymlinks?: boolean;
}

// ===== Manifest v3 (domain-scanned, produced by `scan`) =====

export type DomainEntryKind = 'mcp' | 'skill' | 'agent' | 'plugin' | 'hook' | 'memory' | 'settings';

export interface DomainEntry {
  id: string;
  kind: DomainEntryKind;
  /** Source-machine path (absolute on the scanning host). */
  path: string;
  /** Stable reference, e.g. `.claude.json#mcpServers.github`. */
  ref?: string;
  note?: string;
}

export interface AgentDomain {
  mcp: DomainEntry[];
  skills: DomainEntry[];
  agents: DomainEntry[];
  plugins: DomainEntry[];
  hooks: DomainEntry[];
  memory: DomainEntry[];
  settings: DomainEntry[];
}

export interface SecretEntry {
  /** Placeholder env var name, e.g. AGENTDOCK_CLUDE_GITHUB_TOKEN. */
  key: string;
  /** Where the secret was found, e.g. /home/x/.claude.json#mcpServers.github.env.GITHUB_TOKEN. */
  source: string;
  /** Masked sample for operator reference, e.g. ghp_****wxyz. */
  sample?: string;
}

export interface AgentDockManifestV3 {
  version: 3;
  project: AgentDockProject;
  agents: {
    claude?: AgentDomain;
    codex?: AgentDomain;
  };
  secrets: SecretEntry[];
  outputs: AgentDockOutput;
  options?: AgentDockOptions;
}

export interface AgentDockManifest {
  version: ManifestVersion;
  project: AgentDockProject;
  sources: AgentDockSource[];
  templates?: AgentDockTemplate[];
  outputs: AgentDockOutput;
  install?: AgentDockInstall;
  options?: AgentDockOptions;
}

export interface LoadedManifest {
  path: string;
  directory: string;
  data: AgentDockManifest;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ParsedCliOptions {
  overwrite?: boolean;
  dryRun?: boolean;
  json?: boolean;
  verbose?: boolean;
  writePath?: string;
  backup?: boolean;
  force?: boolean;
  agent?: 'claude' | 'codex' | 'all';
  root?: string;
  out?: string;
  fromScan?: string;
  env?: string;
  package?: string;
}

export interface CommandResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

// ===== Doctor report (produced by `doctor`) =====

export type DoctorMode = 'live' | 'scan' | 'package';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorFinding {
  severity: 'info' | 'warn' | 'error';
  message: string;
  path?: string;
}

export interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  findings: DoctorFinding[];
}

export interface DoctorReportData {
  mode: DoctorMode;
  agent?: string;
  target: string;
  healthy: boolean;
  checks: DoctorCheck[];
  summary: string;
  reportPath?: string;
}

// ===== List report (produced by `list`) =====

export type ListMode = 'scan' | 'package';

export interface AgentListInfo {
  agent: 'claude' | 'codex';
  mcp: string[];
  skills: string[];
  agents: string[];
  plugins: string[];
  hooks: string[];
  memory: string[];
  settings: string[];
  totals: {
    mcp: number;
    skills: number;
    agents: number;
    plugins: number;
    hooks: number;
    memory: number;
    settings: number;
    all: number;
  };
}

export interface ListInstallEntry {
  from: string;
  to: string;
  kind: string;
}

export interface ListReportData {
  mode: ListMode;
  manifestPath: string;
  project: AgentDockProject;
  agents: AgentListInfo[];
  secretsCount: number;
  secrets: SecretEntry[];
  summary: string;
  installPlan?: ListInstallEntry[];
  reportPath?: string;
}
