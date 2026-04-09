import type { UpgradeWarningCode } from '../constants/upgrade-warning-codes';

export type UpgradeWarning = {
  code: UpgradeWarningCode;
  message: string;
};

export type UpgradeSummary = {
  addedDestinationCount: number;
  changedLineCount: number;
  sourceCount: number;
  templateCount: number;
  warningCount: number;
  warnings: UpgradeWarning[];
};

export type UpgradeJsonReport = {
  command: 'upgrade';
  manifestPath: string;
  outputPath?: string;
  fromVersion: number;
  toVersion: number;
  changed: boolean;
  dryRun: boolean;
  diff: string[];
  summary: UpgradeSummary;
};
