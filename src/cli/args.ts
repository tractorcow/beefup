import type { UpgradeMode, ReportFormat, StageStrategyName } from "../config/types.js";
import { BeefupError } from "../errors.js";

export interface CliArgs {
  command?: string;
  mode?: UpgradeMode;
  strategy: StageStrategyName;
  dir?: string;
  format: ReportFormat;
  help: boolean;
  version: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    strategy: "worktree",
    format: "text",
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
      if (value !== "same-major" && value !== "latest") {
        throw new BeefupError(`invalid --mode ${value}; use same-major or latest`);
      }
      args.mode = value;
    } else if (arg === "--strategy") {
      const value = argv[i + 1];
      i += 1;
      if (value !== "worktree" && value !== "inplace") {
        throw new BeefupError(`invalid --strategy ${value}; use worktree or inplace`);
      }
      args.strategy = value;
    } else if (arg === "--dir") {
      args.dir = argv[i + 1];
      i += 1;
    } else if (arg === "--format") {
      const value = argv[i + 1];
      i += 1;
      if (value !== "text" && value !== "markdown" && value !== "json") {
        throw new BeefupError(`invalid --format ${value}; use text, markdown, or json`);
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

export function showHelp(): string {
  return `beefup - staged, pinned, audited dependency upgrades

USAGE:
    beefup stage [OPTIONS]

OPTIONS:
    --mode same-major|latest     Upgrade mode (default: same-major, or project config)
    --strategy worktree|inplace  Isolation strategy (default: worktree)
    --dir <path>                 Project directory (default: cwd)
    --format text|markdown|json  Report format printed to stdout (default: text)
    -h, --help                   Show this help
    -v, --version                Show version

EXAMPLES:
    beefup stage
    beefup stage --mode latest --strategy inplace
    beefup stage --format markdown
`;
}
