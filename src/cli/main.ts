import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAccept } from "../commands/accept.js";
import { printReport, runReport } from "../commands/report.js";
import { runRevert } from "../commands/revert.js";
import { runRewind } from "../commands/rewind.js";
import { runStage } from "../commands/stage.js";
import {
  CliCommands,
  CliOptionFlags,
  DefaultPackageRoot,
  ReportComparisons,
  StageStrategies,
} from "../config/types.js";
import { BeefupError } from "../errors.js";
import { createLogger, getLogger, setLogger } from "../log.js";
import { resolveCommandPackageRoots } from "../project/package-root.js";
import { BEEFUP_DIR, BeefupSnapshots } from "../project/paths.js";
import { securityFindingCountLabel } from "../report/shared.js";
import type { StageReport } from "../report/types.js";
import { gitToplevel } from "../strategy/git.js";
import { parseCliArgs, showHelp } from "./args.js";

/**
 * Reads the package version from the nearest package.json for `--version`.
 */
async function readVersion(): Promise<string> {
  const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../package.json"
  );
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

/**
 * Writes a stage/report result to stdout and warns if new findings were introduced.
 */
function emitReport(report: StageReport, labeled: boolean): void {
  if (labeled) {
    process.stdout.write(
      `${packageRootHeading(report.packageRoot ?? DefaultPackageRoot)}\n`
    );
  }
  process.stdout.write(printReport(report));
  if (report.security.introduced.length > 0) {
    const review =
      report.comparison === ReportComparisons.Applied
        ? `${BEEFUP_DIR}/${BeefupSnapshots.Prior} vs the live tree`
        : `${BEEFUP_DIR}/${BeefupSnapshots.Staged} before accept`;
    getLogger().warn(
      `${securityFindingCountLabel(report.security.introduced.length)} introduced; review ${review}`
    );
  }
}

/**
 * Returns a stdout heading for a package root when a command runs against several.
 */
function packageRootHeading(packageRoot: string): string {
  return `\n# ${packageRoot}\n`;
}

/**
 * Formats an error thrown while running a command against one package root.
 */
function formatCommandError(error: unknown): string {
  if (error instanceof BeefupError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * CLI entrypoint: parses argv, runs a Beefup command, and returns a process exit code.
 */
export async function main(argv = process.argv): Promise<number> {
  try {
    const args = parseCliArgs(argv);
    setLogger(createLogger({ level: args.logLevel }));
    if (args.version) {
      console.log(await readVersion());
      return 0;
    }
    if (args.help || !args.command) {
      console.log(showHelp());
      return 0;
    }

    if (
      args.command !== CliCommands.Stage &&
      args.command !== CliCommands.Report &&
      args.command !== CliCommands.Accept &&
      args.command !== CliCommands.Revert &&
      args.command !== CliCommands.Rewind
    ) {
      throw new BeefupError(`unknown command: ${args.command}`);
    }

    const startDir = path.resolve(args.dir ?? process.cwd());
    const gitRoot = await gitToplevel(startDir);
    const { projectRoot, packageRoots } = await resolveCommandPackageRoots({
      startDir,
      cliPackageRoots: args.packageRoot,
      gitRoot,
    });
    const log = getLogger();
    const labeled = packageRoots.length > 1;
    log.debug(
      `${args.command} log-level=${args.logLevel} projectRoot=${projectRoot} packageRoots=${packageRoots.map((root) => root.relative).join(",")}`
    );
    if (args.noSafeChain) {
      log.warn(
        `${CliOptionFlags.NoSafeChain} suppresses Safe Chain; lockfile updates and installs run through unprotected npm/pnpm`
      );
    }

    const failures: { relative: string; message: string }[] = [];
    for (const packageRoot of packageRoots) {
      try {
        if (args.command === CliCommands.Stage) {
          const report = await runStage({
            projectRoot,
            packageRoot: packageRoot.relative,
            mode: args.mode,
            strategy: args.strategy ?? StageStrategies.Worktree,
            format: args.format,
            noSafeChain: args.noSafeChain,
          });
          emitReport(report, labeled);
          continue;
        }
        if (args.command === CliCommands.Report) {
          const report = await runReport({
            projectRoot,
            packageRoot: packageRoot.relative,
            mode: args.mode,
            strategy: args.strategy,
            format: args.format,
            noSafeChain: args.noSafeChain,
          });
          emitReport(report, labeled);
          continue;
        }
        if (args.command === CliCommands.Accept) {
          const result = await runAccept({
            projectRoot,
            packageRoot: packageRoot.relative,
            format: args.format,
            noSafeChain: args.noSafeChain,
          });
          if (labeled) {
            process.stdout.write(`${packageRootHeading(packageRoot.relative)}\n`);
          }
          process.stdout.write(
            `Accepted staged upgrade. Applied ${result.copied.join(", ")} and installed from the frozen lockfile (${result.packageManager}).\n`
          );
          for (const warning of result.warnings) {
            getLogger().warn(warning);
          }
          continue;
        }
        if (args.command === CliCommands.Revert) {
          const result = await runRevert({
            projectRoot,
            packageRoot: packageRoot.relative,
            format: args.format,
            noSafeChain: args.noSafeChain,
          });
          if (labeled) {
            process.stdout.write(`${packageRootHeading(packageRoot.relative)}\n`);
          }
          process.stdout.write(
            `Reverted to ${BEEFUP_DIR}/${BeefupSnapshots.Prior}. Applied ${result.copied.join(", ")} and installed from the frozen lockfile (${result.packageManager}).\n`
          );
          continue;
        }
        if (args.command === CliCommands.Rewind) {
          const report = await runRewind({
            projectRoot,
            packageRoot: packageRoot.relative,
            gitRef: args.gitRef ?? "",
            format: args.format,
            noSafeChain: args.noSafeChain,
          });
          emitReport(report, labeled);
        }
      } catch (error) {
        const message = formatCommandError(error);
        failures.push({ relative: packageRoot.relative, message });
        const prefix =
          packageRoot.relative === DefaultPackageRoot
            ? "error:"
            : `error: ${packageRoot.relative}:`;
        console.error(`${prefix} ${message}`);
      }
    }

    if (failures.length > 0) {
      if (labeled) {
        getLogger().warn(
          `${failures.length} of ${packageRoots.length} package roots failed`
        );
      }
      return 1;
    }
    return 0;
  } catch (error) {
    if (error instanceof BeefupError) {
      console.error(`error: ${error.message}`);
      return error.exitCode;
    }
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

