import os from 'node:os';
import path from 'node:path';
import { defaultScanRoot, runScan } from '../core/scan';
import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import type { CommandResult, ParsedCliOptions } from '../manifest/types';
import { toJsonError, toJsonLine } from '../utils/command-json';
import type { ScanReportData } from '../core/scan';

export async function runScanCommand(options: ParsedCliOptions = {}): Promise<CommandResult> {
  const agent = options.agent ?? 'all';
  const root = options.root ?? defaultScanRoot();
  const out = options.out ? path.resolve(options.out) : path.resolve('agentdock-scan');

  try {
    const { report } = await runScan({ agent, root, out });

    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine('scan', true, report, [])],
        stderr: [],
      };
    }

    return {
      exitCode: 0,
      stdout: [
        `Scan complete (agent=${agent})`,
        `manifest: ${report.manifestPath}`,
        `env.example: ${report.envExamplePath}`,
        `report: ${report.reportPath}`,
        `secrets isolated: ${report.secretsCount}`,
      ],
      stderr: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json === true) {
      const data: ScanReportData = {
        agent,
        manifestPath: '',
        envExamplePath: '',
        reportPath: '',
        counts: {},
        secretsCount: 0,
        skipped: [],
        notes: [message],
      };
      return {
        exitCode: 1,
        stdout: [toJsonLine('scan', false, data, [toJsonError(COMMAND_ERROR_CODES.SCAN_FAILED, message)])],
        stderr: [],
      };
    }
    return {
      exitCode: 1,
      stdout: [],
      stderr: [message],
    };
  }
}
