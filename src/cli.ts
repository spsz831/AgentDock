import { runExportCommand } from './commands/export';
import { runInitCommand } from './commands/init';
import { runInstallCommand } from './commands/install';
import { runValidateCommand, type CommandResult } from './commands/validate';

export async function runCli(args: string[]): Promise<CommandResult> {
  const [command, ...rest] = args;

  switch (command) {
    case 'validate':
      return runValidateCommand(rest[0]);
    case 'export':
      return runExportCommand(rest[0]);
    case 'init':
      return runInitCommand(rest[0]);
    case 'install':
      return runInstallCommand(rest[0], rest[1]);
    default:
      return {
        exitCode: 1,
        stdout: [],
        stderr: ['Usage: agentdock <init|validate|export|install> [path]'],
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
