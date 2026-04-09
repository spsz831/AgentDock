import type { CommandErrorCode } from '../constants/command-error-codes';

export interface CommandJsonError {
  code: CommandErrorCode;
  message: string;
}

export interface CommandJsonReport<TData = Record<string, unknown>> {
  schemaVersion: 1;
  generatedAt: string;
  toolVersion: string;
  command: string;
  success: boolean;
  data: TData;
  errors: CommandJsonError[];
}
