export type SourceType = 'file' | 'directory';

export interface AgentDockProject {
  name: string;
  description?: string;
}

export interface AgentDockSource {
  id: string;
  type: SourceType;
  path: string;
}

export interface AgentDockOutput {
  type: 'directory';
  path: string;
}

export interface AgentDockOptions {
  includeHidden?: boolean;
  overwrite?: boolean;
}

export interface AgentDockManifest {
  version: 1;
  project: AgentDockProject;
  sources: AgentDockSource[];
  outputs: AgentDockOutput;
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
