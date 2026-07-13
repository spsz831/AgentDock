import path from 'node:path';
import { runList } from '../core/list';
import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import type { CommandResult, ListReportData, ParsedCliOptions } from '../manifest/types';
import { toJsonError, toJsonLine } from '../utils/command-json';

export async function runListCommand(options: ParsedCliOptions = {}): Promise<CommandResult> {
  const out = options.out ? path.resolve(options.out) : undefined;

  try {
    const report = await runList({
      fromScan: options.fromScan,
      package: options.package,
      agent: options.agent,
      out,
    });

    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine('list', true, report, [])],
        stderr: [],
      };
    }

    const lines: string[] = [];
    lines.push(`List (${report.mode}) — ${report.project.name || 'untitled'}`);
    lines.push(report.summary);
    for (const info of report.agents) {
      const title = info.agent === 'claude' ? 'Claude Code' : 'Codex';
      lines.push(`  ${title}: ${info.totals.all} 项`);
      lines.push(`    MCP: ${info.totals.mcp ? info.mcp.join(', ') : '—'}`);
      lines.push(`    Skills: ${info.totals.skills ? info.skills.join(', ') : '—'}`);
      lines.push(`    Agents: ${info.totals.agents ? info.agents.join(', ') : '—'}`);
      lines.push(`    Plugins: ${info.totals.plugins ? info.plugins.join(', ') : '—'}`);
      lines.push(`    Hooks: ${info.totals.hooks ? info.hooks.join(', ') : '—'}`);
      lines.push(`    Memory: ${info.totals.memory ? info.memory.join(', ') : '—'}`);
      lines.push(`    Settings: ${info.totals.settings ? info.settings.join(', ') : '—'}`);
    }
    lines.push(`  机密隔离: ${report.secretsCount} 个`);
    if (report.installPlan && report.installPlan.length > 0) {
      lines.push(`  安装计划: ${report.installPlan.length} 条文件映射`);
    }
    if (report.reportPath) {
      lines.push(`report: ${report.reportPath}`);
    }

    return { exitCode: 0, stdout: lines, stderr: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json === true) {
      const data: ListReportData = {
        mode: 'scan',
        manifestPath: '',
        project: { name: '' },
        agents: [],
        secretsCount: 0,
        secrets: [],
        summary: message,
      };
      return {
        exitCode: 1,
        stdout: [toJsonLine('list', false, data, [toJsonError(COMMAND_ERROR_CODES.LIST_FAILED, message)])],
        stderr: [],
      };
    }
    return { exitCode: 1, stdout: [], stderr: [message] };
  }
}
