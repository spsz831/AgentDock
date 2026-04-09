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
}

export interface AgentDockManifest {
  version: 1;
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
}

export interface CommandResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
}
