import {
  CliCommands,
  CliOptionFlags,
  DefaultLogLevel,
  isLogLevel,
  isReportFormat,
  isStageStrategy,
  isUpgradeMode,
  LogLevels,
  ReportFormats,
  StageStrategies,
  UpgradeModes,
  type LogLevel,
  type ReportFormat,
  type StageStrategyName,
  type UpgradeMode,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { BEEFUP_DIR, ReportFileNames } from "../project/paths.js";

export interface CliArgs {
  command?: string;
  gitRef?: string;
  mode?: UpgradeMode;
  strategy?: StageStrategyName;
  dir?: string;
  packageRoot?: string[];
  format: ReportFormat;
  /** When true, skip Safe Chain and use npm/pnpm directly. */
  noSafeChain: boolean;
  /** Stderr verbosity; default is warnings and errors only. */
  logLevel: LogLevel;
  help: boolean;
  version: boolean;
}

/**
 * Parses process argv into typed CLI options for stage, report, accept, revert, and rewind.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    format: ReportFormats.Html,
    noSafeChain: false,
    logLevel: DefaultLogLevel,
    help: false,
    version: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === CliOptionFlags.Help || arg === CliOptionFlags.HelpShort) {
      args.help = true;
    } else if (arg === CliOptionFlags.Version || arg === CliOptionFlags.VersionShort) {
      args.version = true;
    } else if (arg === CliOptionFlags.Mode) {
      const value = argv[i + 1];
      i += 1;
      if (!isUpgradeMode(value)) {
        throw new BeefupError(
          `invalid ${CliOptionFlags.Mode} ${value}; use ${UpgradeModes.SameMajor} or ${UpgradeModes.Latest}`
        );
      }
      args.mode = value;
    } else if (arg === CliOptionFlags.Strategy) {
      const value = argv[i + 1];
      i += 1;
      if (!isStageStrategy(value)) {
        throw new BeefupError(
          `invalid ${CliOptionFlags.Strategy} ${value}; use ${StageStrategies.Worktree} or ${StageStrategies.Inplace}`
        );
      }
      args.strategy = value;
    } else if (arg === CliOptionFlags.Dir) {
      args.dir = argv[i + 1];
      i += 1;
    } else if (arg === CliOptionFlags.PackageRoot) {
      const value = argv[i + 1];
      i += 1;
      if (!args.packageRoot) {
        args.packageRoot = [];
      }
      args.packageRoot.push(value);
    } else if (arg === CliOptionFlags.Format) {
      const value = argv[i + 1];
      i += 1;
      if (!isReportFormat(value)) {
        throw new BeefupError(
          `invalid ${CliOptionFlags.Format} ${value}; use ${Object.values(ReportFormats).join(", ")}`
        );
      }
      args.format = value;
    } else if (arg === CliOptionFlags.NoSafeChain) {
      args.noSafeChain = true;
    } else if (
      arg === CliOptionFlags.Quiet ||
      arg === CliOptionFlags.QuietShort
    ) {
      args.logLevel = LogLevels.Quiet;
    } else if (
      arg === CliOptionFlags.Verbose ||
      arg === CliOptionFlags.VerboseShort
    ) {
      args.logLevel = LogLevels.Info;
    } else if (arg === CliOptionFlags.Debug) {
      args.logLevel = LogLevels.Debug;
    } else if (arg === CliOptionFlags.LogLevel) {
      const value = argv[i + 1];
      i += 1;
      if (!isLogLevel(value)) {
        throw new BeefupError(
          `invalid ${CliOptionFlags.LogLevel} ${value}; use ${Object.values(LogLevels).join(", ")}`
        );
      }
      args.logLevel = value;
    } else if (!arg.startsWith("-") && !args.command) {
      args.command = arg;
    } else if (
      !arg.startsWith("-") &&
      args.command === CliCommands.Rewind &&
      !args.gitRef
    ) {
      args.gitRef = arg;
    } else {
      throw new BeefupError(`unknown argument: ${arg}`);
    }
  }

  if (
    args.command === CliCommands.Rewind &&
    !args.gitRef &&
    !args.help &&
    !args.version
  ) {
    throw new BeefupError(
      `missing git ref; usage: beefup ${CliCommands.Rewind} <git-ref>`
    );
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
    ${CliCommands.Report}    Regenerate the report (proposal or applied) from existing snapshots
    ${CliCommands.Accept}    Apply the staged upgrade to the live project and install from the lockfile
    ${CliCommands.Revert}    Restore .beefup/prior onto the live project and install from that lockfile
    ${CliCommands.Rewind}    Snapshot historic manifests from a git ref into .beefup/prior

OPTIONS:
    ${CliOptionFlags.Mode} ${UpgradeModes.SameMajor}|${UpgradeModes.Latest}     Upgrade mode (default: ${UpgradeModes.SameMajor}, or project config)
    ${CliOptionFlags.Strategy} ${StageStrategies.Worktree}|${StageStrategies.Inplace}  Isolation strategy for ${CliCommands.Stage} (default: ${StageStrategies.Worktree})
    ${CliOptionFlags.Dir} <path>                 Project directory (default: cwd)
    ${CliOptionFlags.PackageRoot} <path>       Directory with package.json and lockfile (repeatable; default: project root or config)
    ${CliOptionFlags.Format} ${Object.values(ReportFormats).join("|")}  Human-readable file under ${BEEFUP_DIR}/report (default: ${ReportFormats.Html}; ${ReportFileNames.Json} is always written)
    ${CliOptionFlags.NoSafeChain}            Bypass Safe Chain and use npm/pnpm directly
    ${CliOptionFlags.Quiet}, ${CliOptionFlags.QuietShort}                Suppress warnings
    ${CliOptionFlags.Verbose}, ${CliOptionFlags.VerboseShort}            Log major steps to stderr
    ${CliOptionFlags.Debug}                   Log steps, timings, and subprocess commands
    ${CliOptionFlags.LogLevel} ${Object.values(LogLevels).join("|")}  Log verbosity (default: ${DefaultLogLevel})
    -h, --help                   Show this help
    -v, --version                Show version

EXAMPLES:
    beefup ${CliCommands.Stage}
    beefup ${CliCommands.Stage} ${CliOptionFlags.Mode} ${UpgradeModes.Latest} ${CliOptionFlags.Strategy} ${StageStrategies.Inplace}
    beefup ${CliCommands.Stage} ${CliOptionFlags.Format} ${ReportFormats.Html}
    beefup ${CliCommands.Stage} ${CliOptionFlags.PackageRoot} ./app
    beefup ${CliCommands.Stage} ${CliOptionFlags.PackageRoot} ./app ${CliOptionFlags.PackageRoot} ./api
    beefup ${CliCommands.Report}
    beefup ${CliCommands.Report} ${CliOptionFlags.Format} ${ReportFormats.Markdown}
    beefup ${CliCommands.Accept}
    beefup ${CliCommands.Revert}
    beefup ${CliCommands.Rewind} HEAD~1
    beefup ${CliCommands.Rewind} ${CliOptionFlags.Debug} HEAD~1
`;
}
