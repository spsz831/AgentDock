import path from 'node:path';
import { runDoctor, doctorExitCode } from '../core/doctor';
import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import type { CommandResult, ParsedCliOptions, DoctorReportData } from '../manifest/types';
import { toJsonError, toJsonLine } from '../utils/command-json';

export async function runDoctorCommand(options: ParsedCliOptions = {}): Promise<CommandResult> {
  const agent = options.agent ?? 'all';
  const out = options.out ? path.resolve(options.out) : undefined;

  try {
    const report = await runDoctor({
      agent,
      root: options.root,
      fromScan: options.fromScan,
      package: options.package,
      out,
    });

    if (options.json === true) {
      return {
        exitCode: doctorExitCode(report),
        stdout: [toJsonLine('doctor', report.healthy, report, [])],
        stderr: [],
      };
    }

    const lines = [
      `Doctor (${report.mode})${report.agent ? ` agent=${report.agent}` : ''}`,
      report.summary,
      ...report.checks.flatMap((check) => {
        const out2: string[] = [`  [${check.status.toUpperCase()}] ${check.label} — ${check.detail}`];
        if (check.remediation && check.status !== 'pass') {
          out2.push(`    → 建议: ${check.remediation}`);
        }
        return out2;
      }),
      ...(report.reportPath ? [`report: ${report.reportPath}`] : []),
    ];
    return { exitCode: doctorExitCode(report), stdout: lines, stderr: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json === true) {
      const data: DoctorReportData = { mode: 'live', agent, target: '', healthy: false, checks: [], summary: message };
      return {
        exitCode: 2,
        stdout: [toJsonLine('doctor', false, data, [toJsonError(COMMAND_ERROR_CODES.DOCTOR_FAILED, message)])],
        stderr: [],
      };
    }
    return { exitCode: 2, stdout: [], stderr: [message] };
  }
}
