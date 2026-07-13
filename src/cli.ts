#!/usr/bin/env node
import { runExportCommand } from './commands/export';
import { runInitCommand } from './commands/init';
import { runInstallCommand } from './commands/install';
import { runScanCommand } from './commands/scan';
import { runDoctorCommand } from './commands/doctor';
import { runListCommand } from './commands/list';
import { runUpgradeCommand } from './commands/upgrade';
import { runValidateCommand } from './commands/validate';
import type { CommandResult, ParsedCliOptions } from './manifest/types';

function parseCliOptions(args: string[]): { positionals: string[]; options: ParsedCliOptions } {
  const positionals: string[] = [];
  const options: ParsedCliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--overwrite') {
      options.overwrite = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }
    if (arg === '--backup') {
      options.backup = true;
      continue;
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--write') {
      const nextArg = args[index + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        options.writePath = nextArg;
        index += 1;
      } else {
        positionals.push(arg);
      }
      continue;
    }
    if (arg === '--agent' || arg === '--root' || arg === '--out') {
      const nextArg = args[index + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        if (arg === '--agent') options.agent = nextArg as ParsedCliOptions['agent'];
        if (arg === '--root') options.root = nextArg;
        if (arg === '--out') options.out = nextArg;
        index += 1;
      } else {
        positionals.push(arg);
      }
      continue;
    }
    if (arg === '--from-scan' || arg === '--env' || arg === '--package') {
      const nextArg = args[index + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        if (arg === '--from-scan') options.fromScan = nextArg;
        if (arg === '--env') options.env = nextArg;
        if (arg === '--package') options.package = nextArg;
        index += 1;
      } else {
        positionals.push(arg);
      }
      continue;
    }
    positionals.push(arg);
  }

  return { positionals, options };
}

export async function runCli(args: string[]): Promise<CommandResult> {
  const [command, ...rest] = args;
  const { positionals, options } = parseCliOptions(rest);

  switch (command) {
    case 'validate':
      return runValidateCommand(positionals[0], options);
    case 'export':
      return runExportCommand(positionals[0], options);
    case 'init':
      return runInitCommand(positionals[0], options);
    case 'install':
      return runInstallCommand(positionals[0], positionals[1], options);
    case 'upgrade':
      return runUpgradeCommand(positionals[0], options);
    case 'scan':
      return runScanCommand(options);
    case 'doctor':
      return runDoctorCommand(options);
    case 'list':
      return runListCommand(options);
    default:
      return {
        exitCode: 1,
        stdout: [],
        stderr: ['Usage: agentdock <init|validate|export|install|upgrade|scan|doctor|list> [path]'],
      };
  }
}

async function main() {
  const result = await runCli(process.argv.slice(2));
  for (const line of result.stdout) {
    console.log(line);
  }
  for (const line of result.stderr) {
    console.error(line);
  }
  process.exitCode = result.exitCode;
}

if (require.main === module) {
  void main();
}
