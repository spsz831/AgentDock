import { runExportCommand } from './commands/export';
import { runInitCommand } from './commands/init';
import { runInstallCommand } from './commands/install';
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
    default:
      return {
        exitCode: 1,
        stdout: [],
        stderr: ['Usage: agentdock <init|validate|export|install|upgrade> [path]'],
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
