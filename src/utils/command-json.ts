import packageJson from '../../package.json';
import type { CommandErrorCode } from '../constants/command-error-codes';
import type { CommandJsonError, CommandJsonReport } from '../types/command-report';

export function toJsonError(code: CommandErrorCode, message: string): CommandJsonError {
  return { code, message };
}

export function toJsonLine<TData>(
  command: string,
  success: boolean,
  data: TData,
  errors: CommandJsonError[],
): string {
  const report: CommandJsonReport<TData> = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    toolVersion: packageJson.version,
    command,
    success,
    data,
    errors,
  };

  return JSON.stringify(report);
}
