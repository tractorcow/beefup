import {
  CliCommands,
  isReportFormat,
  isStageStrategy,
  isUpgradeMode,
  ReportFormats,
  StageStrategies,
  UpgradeModes,
  type ReportFormat,
  type StageStrategyName,
  type UpgradeMode,
} from "../config/types.js";
import { BeefupError } from "../errors.js";

export interface CliArgs {
  command?: string;
  mode?: UpgradeMode;
  strategy?: StageStrategyName;
  dir?: string;
  format: ReportFormat;
  help: boolean;
  version: boolean;
}

/**
 * Parses process argv into typed CLI options for stage, report, and accept.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    format: ReportFormats.Color,
    help: false,
    version: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--version" || arg === "-v") {
      args.version = true;
    } else if (arg === "--mode") {
      const value = argv[i + 1];
      i += 1;
      if (!isUpgradeMode(value)) {
        throw new BeefupError(`invalid --mode ${value}; use same-major or latest`);
      }
      args.mode = value;
    } else if (arg === "--strategy") {
      const value = argv[i + 1];
      i += 1;
      if (!isStageStrategy(value)) {
        throw new BeefupError(`invalid --strategy ${value}; use worktree or inplace`);
      }
      args.strategy = value;
    } else if (arg === "--dir") {
      args.dir = argv[i + 1];
      i += 1;
    } else if (arg === "--format") {
      const value = argv[i + 1];
      i += 1;
      if (!isReportFormat(value)) {
        throw new BeefupError(
          `invalid --format ${value}; use ${Object.values(ReportFormats).join(", ")}`
        );
      }
      args.format = value;
    } else if (!arg.startsWith("-") && !args.command) {
      args.command = arg;
    } else {
      throw new BeefupError(`unknown argument: ${arg}`);
    }
  }

  return args;
}

/**
 * Returns the CLI usage help text printed for `--help` or missing commands.
 */
export function showHelp(): string {
  return `beefup - staged, pinned, audited dependency upgrades

USAGE:
    beefup <command> [OPTIONS]

COMMANDS:
    ${CliCommands.Stage}     Propose an upgrade into .beefup/staged and write a report
    ${CliCommands.Report}    Regenerate the report for an existing staged upgrade
    ${CliCommands.Accept}    Apply the staged upgrade to the live project and install from the lockfile

OPTIONS:
    --mode ${UpgradeModes.SameMajor}|${UpgradeModes.Latest}     Upgrade mode (default: ${UpgradeModes.SameMajor}, or project config)
    --strategy ${StageStrategies.Worktree}|${StageStrategies.Inplace}  Isolation strategy for ${CliCommands.Stage} (default: ${StageStrategies.Worktree})
    --dir <path>                 Project directory (default: cwd)
    --format ${Object.values(ReportFormats).join("|")}  Report format printed to stdout (default: ${ReportFormats.Color})
    -h, --help                   Show this help
    -v, --version                Show version

EXAMPLES:
    beefup ${CliCommands.Stage}
    beefup ${CliCommands.Stage} --mode ${UpgradeModes.Latest} --strategy ${StageStrategies.Inplace}
    beefup ${CliCommands.Stage} --format ${ReportFormats.Html}
    beefup ${CliCommands.Report}
    beefup ${CliCommands.Report} --format ${ReportFormats.Json}
    beefup ${CliCommands.Accept}
`;
}
